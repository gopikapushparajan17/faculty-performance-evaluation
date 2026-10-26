"""
Unit and integration tests for Patent Verification System.
Mocked provider responses are used; NO real external network calls are made.
"""

from __future__ import annotations

import logging
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from fastapi import FastAPI

from app.deps import get_current_user
from app.models import User
from app.patent_verifier import (
    BasePatentProvider,
    EpoOpsProvider,
    GooglePatentsProvider,
    PatentRecord,
    extract_patent_identifier_from_url,
    is_safe_patent_url,
    normalize_patent_identifier,
    normalize_person_name,
    person_name_matches,
    set_default_fallback_provider,
    set_default_provider,
    verify_patent,
)
from app.routes import patents

app = FastAPI()
app.include_router(patents.router, prefix="/api/patents")


class MockPatentProvider(BasePatentProvider):
    """Mock provider for deterministic testing without external network calls."""

    def __init__(
        self,
        status: str = "verified",
        record: PatentRecord | None = None,
        source: str = "Mock Patent Provider",
    ):
        self.status = status
        self.record = record
        self.source = source

    def get_patent(self, identifier: str) -> dict:
        return {
            "status": self.status,
            "record": self.record,
            "verification_source": self.source,
        }


# ============================================================================
# 1. NAME MATCHING TESTS (Requirements 7 & 8 + edge cases)
# ============================================================================

def test_faculty_name_matches_reordered_name():
    """Requirement 7: 'John Smith' matches 'Smith, John'."""
    assert person_name_matches("John Smith", "Smith, John") is True
    assert person_name_matches("Smith, John", "John Smith") is True


def test_faculty_name_matches_initials():
    """Requirement 8: 'John A Smith' matches 'J. A. Smith'."""
    assert person_name_matches("John A Smith", "J. A. Smith") is True
    assert person_name_matches("J. A. Smith", "John A Smith") is True


def test_faculty_name_matches_other_variations():
    """Supports single initial, middle name reordering, and titles."""
    assert person_name_matches("John Smith", "J. Smith") is True
    assert person_name_matches("John A Smith", "A. John Smith") is True
    assert person_name_matches("Dr. John Smith", "Smith, John") is True


def test_faculty_name_does_not_match_different_people():
    """Distinguishes different names with common surnames or first names."""
    assert person_name_matches("John Smith", "Bob Smith") is False
    assert person_name_matches("John Smith", "John Doe") is False
    assert person_name_matches("John A Smith", "John B Smith") is False


def test_name_matching_rejects_single_token_matches():
    """Do NOT produce a match merely because one short token such as 'A' or 'K' matches."""
    assert person_name_matches("A", "A") is False
    assert person_name_matches("K", "K. Smith") is False
    assert person_name_matches("John Smith", "A") is False
    assert person_name_matches("A", "John Smith") is False
    assert person_name_matches("", "") is False


def test_normalize_person_name():
    assert normalize_person_name("Dr. Smith, John A.") == "smith john a"
    assert normalize_person_name("Prof. Jane  Doe") == "jane doe"


# ============================================================================
# 2. PATENT IDENTIFIER & URL EXTRACTION (Requirements 6 & 9)
# ============================================================================

def test_normalize_patent_identifier_valid():
    assert normalize_patent_identifier("IN123456") == "IN123456"
    assert normalize_patent_identifier("123456") == "123456"
    assert normalize_patent_identifier("IN123456B") == "IN123456B"
    assert normalize_patent_identifier("IN202041012345") == "IN202041012345"
    assert normalize_patent_identifier("IN/2020/41012345") == "IN202041012345"
    assert normalize_patent_identifier("US9876543B2") == "US9876543B2"
    assert normalize_patent_identifier("US8789139B2") == "US8789139B2"
    assert normalize_patent_identifier("US20140181936A1") == "US20140181936A1"
    assert normalize_patent_identifier("IN201811044487A") == "IN201811044487A"
    assert normalize_patent_identifier("IN2013MU01574A") == "IN2013MU01574A"
    assert normalize_patent_identifier("IN2013MU01590A") == "IN2013MU01590A"
    assert normalize_patent_identifier("EP1234567A1") == "EP1234567A1"
    assert normalize_patent_identifier("WO2019123456A1") == "WO2019123456A1"


def test_normalize_indian_year_office_code_identifiers():
    """Indian identifiers with year + office code (e.g. MU) plus existing formats."""
    assert normalize_patent_identifier("IN2013MU01574A") == "IN2013MU01574A"
    assert normalize_patent_identifier("IN2013MU01590A") == "IN2013MU01590A"
    assert normalize_patent_identifier("IN201811044487A") == "IN201811044487A"
    assert normalize_patent_identifier("US8789139B2") == "US8789139B2"


def test_normalize_patent_identifier_invalid():
    """Requirement 6: Invalid patent identifier causes validation failure."""
    assert normalize_patent_identifier("") is None
    assert normalize_patent_identifier("   ") is None
    assert normalize_patent_identifier("invalid!@#") is None
    assert normalize_patent_identifier("../etc/passwd") is None
    assert normalize_patent_identifier("<script>") is None
    assert normalize_patent_identifier("IN") is None
    assert normalize_patent_identifier("IN20MU") is None
    assert normalize_patent_identifier("123") is None
    assert normalize_patent_identifier("NOTAPATENT") is None
    assert normalize_patent_identifier("IN2013$$$$") is None


def test_ssrf_protection_prevents_unsafe_urls():
    """Requirement 9: Prevent unsafe arbitrary URL fetching."""
    unsafe_urls = [
        "http://localhost:8000/secret",
        "http://127.0.0.1:8000",
        "http://0.0.0.0/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/admin",
        "http://192.168.1.1/",
        "http://[::1]/",
        "http://evil.com/patent/IN123456",
        "http://internal.service.local/patent",
        "file:///etc/passwd",
        "ftp://patents.google.com/test",
    ]
    for url in unsafe_urls:
        assert is_safe_patent_url(url) is False, f"URL should be unsafe: {url}"
        assert extract_patent_identifier_from_url(url) is None


def test_extract_patent_identifier_from_safe_urls():
    # Google Patents
    assert (
        extract_patent_identifier_from_url("https://patents.google.com/patent/IN123456B/en")
        == "IN123456B"
    )
    # Espacenet
    assert (
        extract_patent_identifier_from_url(
            "https://worldwide.espacenet.com/patent/search/family/067215234/publication/IN123456B?q=IN123456"
        )
        == "IN123456B"
    )
    # IP India / InPASS
    assert (
        extract_patent_identifier_from_url(
            "https://ipindiaservices.gov.in/patentsearch/GrantedSearch/viewApplicationStatus.aspx?AppId=IN202041012345"
        )
        == "IN202041012345"
    )


# ============================================================================
# 3. VERIFICATION FLOW & ASSOCIATION TYPES (Requirements 1, 2, 3, 4, 5)
# ============================================================================

def test_valid_patent_faculty_inventor_match():
    """Requirement 1: Valid patent + faculty inventor match -> verified, association_type = inventor."""
    record = PatentRecord(
        patent_number="IN123456B",
        application_number="IN202041012345",
        title="Automated Faculty Evaluation System",
        status="Granted",
        inventors=["Smith, John", "Kumar, Rajesh"],
        applicants=["Global Institute of Technology"],
        filing_date="2020-03-15",
        grant_date="2022-01-10",
        source="EPO Open Patent Services (OPS)",
    )
    provider = MockPatentProvider(status="verified", record=record)

    res = verify_patent(
        patent_number="IN123456B",
        patent_link=None,
        faculty_name="John Smith",
        provider=provider,
    )

    assert res["verification_status"] == "verified"
    assert res["association_type"] == "inventor"
    assert res["matched_name"] == "Smith, John"
    assert res["patent_number"] == "IN123456B"
    assert res["title"] == "Automated Faculty Evaluation System"
    assert res["status"] == "Granted"
    assert "Smith, John" in res["inventors"]


def test_valid_patent_faculty_applicant_match():
    """Requirement 2: Valid patent + faculty applicant match -> verified, association_type = applicant."""
    record = PatentRecord(
        patent_number="IN654321B",
        title="Renewable Energy Storage Device",
        status="Granted",
        inventors=["External Inventor A", "External Inventor B"],
        applicants=["Alice Wonder"],
        source="EPO Open Patent Services (OPS)",
    )
    provider = MockPatentProvider(status="verified", record=record)

    res = verify_patent(
        patent_number="IN654321B",
        patent_link=None,
        faculty_name="Alice Wonder",
        provider=provider,
    )

    assert res["verification_status"] == "verified"
    assert res["association_type"] == "applicant"
    assert res["matched_name"] == "Alice Wonder"


def test_valid_patent_no_faculty_match():
    """Requirement 3: Valid patent + no faculty match -> not_verified, association_type = none."""
    record = PatentRecord(
        patent_number="IN123456B",
        title="Some Other Innovation",
        status="Granted",
        inventors=["Dr. Vikram Malhotra"],
        applicants=["National Labs"],
        source="EPO Open Patent Services (OPS)",
    )
    provider = MockPatentProvider(status="verified", record=record)

    res = verify_patent(
        patent_number="IN123456B",
        patent_link=None,
        faculty_name="John Smith",
        provider=provider,
    )

    assert res["verification_status"] == "not_verified"
    assert res["association_type"] == "none"
    assert res["matched_name"] is None


def test_patent_not_found():
    """Requirement 4: Patent not found -> not_found."""
    provider = MockPatentProvider(status="not_found", record=None)

    res = verify_patent(
        patent_number="IN999999",
        patent_link=None,
        faculty_name="John Smith",
        provider=provider,
    )

    assert res["verification_status"] == "not_found"
    assert res["association_type"] is None
    assert res["matched_name"] is None


def test_provider_unavailable():
    """Requirement 5: Provider unavailable -> unable_to_verify."""
    provider = MockPatentProvider(status="unable_to_verify", record=None)

    res = verify_patent(
        patent_number="IN123456",
        patent_link=None,
        faculty_name="John Smith",
        provider=provider,
    )

    assert res["verification_status"] == "unable_to_verify"
    assert res["association_type"] is None


def test_epo_ops_unconfigured_behavior():
    """When credentials are not configured, return unable_to_verify with source epo_ops_not_configured."""
    with patch.dict(os.environ, {"EPO_OPS_CONSUMER_KEY": "", "EPO_OPS_CONSUMER_SECRET": ""}, clear=True):
        provider = EpoOpsProvider(consumer_key="", consumer_secret="")
        res = provider.get_patent("IN123456")
        assert res["status"] == "unable_to_verify"
        assert res["verification_source"] == "epo_ops_not_configured"


# ============================================================================
# 4. API ENDPOINT TESTS (Requirements 6, 10, 11)
# ============================================================================

def test_unauthenticated_request_returns_401():
    """Requirement 10: Unauthenticated API request -> 401."""
    client = TestClient(app)
    # Clear any dependency overrides to test real auth protection
    app.dependency_overrides.clear()

    response = client.post(
        "/api/patents/verify",
        json={"patent_number": "IN123456"},
    )
    assert response.status_code == 401


def test_api_verify_patent_success_faculty_inventor():
    """API endpoint returns 200 with structured response for authenticated faculty."""
    client = TestClient(app)
    mock_faculty = User(
        id="101",
        email="john.smith@univ.edu",
        name="John Smith",
        role="faculty",
        department="Computer Science",
    )
    app.dependency_overrides[get_current_user] = lambda: mock_faculty

    record = PatentRecord(
        patent_number="IN123456B",
        application_number="IN202041012345",
        title="Smart Evaluation System",
        status="Granted",
        inventors=["Smith, John"],
        applicants=["University"],
    )
    mock_provider = MockPatentProvider(status="verified", record=record)
    set_default_provider(mock_provider)

    try:
        response = client.post(
            "/api/patents/verify",
            json={"patent_number": "IN123456B"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verification_status"] == "verified"
        assert data["association_type"] == "inventor"
        assert data["matched_name"] == "Smith, John"
        assert data["patent_number"] == "IN123456B"
    finally:
        set_default_provider(None)
        app.dependency_overrides.clear()


def test_api_verify_patent_invalid_identifier_returns_422():
    """Requirement 6 via API: Malformed patent number returns 422."""
    client = TestClient(app)
    mock_faculty = User(
        id="101",
        email="john.smith@univ.edu",
        name="John Smith",
        role="faculty",
    )
    app.dependency_area = {}
    app.dependency_overrides[get_current_user] = lambda: mock_faculty

    try:
        response = client.post(
            "/api/patents/verify",
            json={"patent_number": "invalid!@#_123"},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_api_verify_patent_unsafe_url_returns_422():
    """Requirement 9 via API: Unsafe URL returns 422 and is not fetched."""
    client = TestClient(app)
    mock_faculty = User(
        id="101",
        email="john.smith@univ.edu",
        name="John Smith",
        role="faculty",
    )
    app.dependency_overrides[get_current_user] = lambda: mock_faculty

    try:
        response = client.post(
            "/api/patents/verify",
            json={"patent_link": "http://127.0.0.1:8000/api/admin"},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_credentials_never_exposed_in_response_or_logs(caplog):
    """Requirement 11: Ensure provider credentials are never included in responses/logs."""
    fake_key = "SECRET_CONSUMER_KEY_XYZ_123"
    fake_secret = "SECRET_CONSUMER_SECRET_ABC_789"

    client = TestClient(app)
    mock_faculty = User(
        id="101",
        email="john.smith@univ.edu",
        name="John Smith",
        role="faculty",
    )
    app.dependency_overrides[get_current_user] = lambda: mock_faculty

    # Test with real EpoOpsProvider instance configured with fake credentials
    provider = EpoOpsProvider(consumer_key=fake_key, consumer_secret=fake_secret)
    set_default_provider(provider)

    try:
        with patch("requests.post", side_effect=Exception("Simulated network crash")):
            with caplog.at_level(logging.DEBUG):
                response = client.post(
                    "/api/patents/verify",
                    json={"patent_number": "IN123456"},
                )
                assert response.status_code == 200
                res_json = response.text
                # Key and secret must NOT appear in HTTP response
                assert fake_key not in res_json
                assert fake_secret not in res_json

                # Key and secret must NOT appear in log records
                for record in caplog.records:
                    assert fake_key not in record.message
                    assert fake_secret not in record.message
    finally:
        set_default_provider(None)
        app.dependency_overrides.clear()


# ============================================================================
# 5. GOOGLE PATENTS FALLBACK TESTS (Requirements 1, 2, 3, 5, 6, 7, 8, 9, 11)
# ============================================================================

SAMPLE_GOOGLE_PATENTS_HTML = """<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="canonical" href="https://patents.google.com/patent/IN201811044487A/en">
    <meta name="DC.type" content="patent">
    <meta name="DC.title" content="Curcumin Solid Lipid Nanoparticles">
    <meta name="DC.date" content="2018-11-26" scheme="dateSubmitted">
    <meta name="citation_patent_application_number" content="IN:201811044487A">
    <meta name="citation_patent_publication_number" content="IN:201811044487:A">
    <meta name="DC.date" content="2020-08-14">
    <meta name="DC.contributor" content="Indu Pal KAUR" scheme="inventor">
    <meta name="DC.contributor" content="Vandita Kakkar" scheme="inventor">
    <meta name="DC.contributor" content="Simarjot Kaur SANDHU" scheme="inventor">
    <meta name="DC.contributor" content="Tanvi Gupta" scheme="inventor">
    <meta name="DC.contributor" content="Registrar, Panjab University Chandigarh" scheme="assignee">
  </head>
  <body>
    <dd itemprop="publicationNumber">IN201811044487A</dd>
    <dd itemprop="applicationNumber">IN201811044487A</dd>
    <time itemprop="priorityDate">2018-11-26</time>
  </body>
</html>
"""


def test_google_patents_provider_successful_lookup():
    """Unit test: Google Patents provider parses HTML correctly."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_GOOGLE_PATENTS_HTML

    provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response) as mock_get:
        res = provider.get_patent("IN201811044487A")
        assert res["status"] == "verified"
        assert res["verification_source"] == "Google Patents"
        rec = res["record"]
        assert rec is not None
        assert rec.patent_number == "IN201811044487A"
        assert rec.application_number == "IN201811044487A"
        assert rec.title == "Curcumin Solid Lipid Nanoparticles"
        assert rec.filing_date == "2018-11-26"
        assert rec.publication_date == "2020-08-14"
        assert rec.priority_date == "2018-11-26"
        assert "Indu Pal KAUR" in rec.inventors
        assert "Registrar, Panjab University Chandigarh" in rec.applicants
        assert rec.current_holder == "Registrar, Panjab University Chandigarh"
        assert rec.source_url == "https://patents.google.com/patent/IN201811044487A/en"

        mock_get.assert_called_once()
        call_url = mock_get.call_args[0][0]
        assert call_url == "https://patents.google.com/patent/IN201811044487A/en"


def test_google_patents_fallback_inventor_match_indu_pal_kaur():
    """Requirement 9: IN201811044487A with faculty Indu Pal Kaur."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_GOOGLE_PATENTS_HTML

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response):
        res = verify_patent(
            patent_number="IN201811044487A",
            patent_link=None,
            faculty_name="Indu Pal Kaur",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["patent_found"] is True
        assert res["inventor_match"] is True
        assert res["association"] == "verified"
        assert res["verification_status"] == "verified"
        assert res["relationship"] == "Faculty member is listed as an inventor"
        assert res["association_type"] == "inventor"
        assert res["matched_name"] == "Indu Pal KAUR"
        assert res["patent_number"] == "IN201811044487A"
        assert res["verification_source"] == "Google Patents"


def test_google_patents_fallback_applicant_match():
    """Applicant / assignee match when faculty matches assignee."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_GOOGLE_PATENTS_HTML

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response):
        res = verify_patent(
            patent_number="IN201811044487A",
            patent_link=None,
            faculty_name="Registrar, Panjab University Chandigarh",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["patent_found"] is True
        assert res["inventor_match"] is False
        assert res["association"] == "verified"
        assert res["verification_status"] == "verified"
        assert res["relationship"] == "Faculty member is listed as an applicant/assignee"
        assert res["association_type"] == "applicant"
        assert res["matched_name"] == "Registrar, Panjab University Chandigarh"


def test_google_patents_fallback_no_faculty_match():
    """Patent found in Google Patents fallback, but no faculty match."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_GOOGLE_PATENTS_HTML

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response):
        res = verify_patent(
            patent_number="IN201811044487A",
            patent_link=None,
            faculty_name="Dr. Unrelated Researcher",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["patent_found"] is True
        assert res["inventor_match"] is False
        assert res["association"] == "none"
        assert res["verification_status"] == "not_verified"
        assert res["relationship"] == "Faculty association not found"
        assert res["association_type"] == "none"
        assert res["matched_name"] is None


def test_google_patents_404_not_found():
    """Google Patents 404 returns not_found when both providers cannot find the record."""
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.text = "Not found"

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response):
        res = verify_patent(
            patent_number="IN201811044487A",
            patent_link=None,
            faculty_name="Indu Pal Kaur",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["verification_status"] == "not_found"
        assert res["patent_found"] is False
        assert res["association_type"] is None


def test_google_patents_provider_network_failure():
    """Provider / network failure on fallback returns unable_to_verify."""
    import requests

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", side_effect=requests.RequestException("Connection timed out")):
        res = verify_patent(
            patent_number="IN201811044487A",
            patent_link=None,
            faculty_name="Indu Pal Kaur",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["verification_status"] == "unable_to_verify"
        assert res["patent_found"] is False


def test_epo_primary_success_skips_google_patents():
    """If EPO finds the patent, Google Patents fallback is not queried."""
    epo_record = PatentRecord(
        patent_number="IN201811044487A",
        title="Curcumin Nanoformulation",
        inventors=["Indu Pal KAUR"],
        source="EPO Open Patent Services (OPS)",
    )
    epo_provider = MockPatentProvider(status="verified", record=epo_record)
    fallback_provider = MagicMock()

    res = verify_patent(
        patent_number="IN201811044487A",
        patent_link=None,
        faculty_name="Indu Pal Kaur",
        provider=epo_provider,
        fallback_provider=fallback_provider,
    )

    assert res["verification_status"] == "verified"
    assert res["verification_source"] == "Mock Patent Provider"
    fallback_provider.get_patent.assert_not_called()


# ============================================================================
# 6. US / MULTI-JURISDICTION GOOGLE PATENTS FALLBACK
# ============================================================================

SAMPLE_US_GOOGLE_PATENTS_HTML = """<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="canonical" href="https://patents.google.com/patent/US8789139B2/en">
    <meta name="DC.type" content="patent">
    <meta name="DC.title" content="Automated test to tell computers and humans apart">
    <meta name="DC.date" content="2013-01-11" scheme="dateSubmitted">
    <meta name="citation_patent_application_number" content="US:13/739,557">
    <meta name="citation_patent_number" content="US:8789139">
    <meta name="DC.date" content="2014-07-22" scheme="issue">
    <meta name="DC.contributor" content="Jean-Charles PICARD" scheme="inventor">
    <meta name="DC.contributor" content="Hewlett Packard Development Co LP" scheme="assignee">
  </head>
  <body>
    <dd itemprop="publicationNumber">US8789139B2</dd>
    <dd itemprop="applicationNumber">US13/739,557</dd>
    <time itemprop="priorityDate">2012-12-20</time>
    <time itemprop="filingDate">2013-01-11</time>
    <time itemprop="publicationDate">2014-07-22</time>
  </body>
</html>
"""


def test_google_patents_provider_us_patent_lookup():
    """US8789139B2 is fetched from Google Patents without requiring an IN prefix."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_US_GOOGLE_PATENTS_HTML

    provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response) as mock_get:
        res = provider.get_patent("US8789139B2")
        assert res["status"] == "verified"
        assert res["verification_source"] == "Google Patents"
        rec = res["record"]
        assert rec is not None
        assert rec.patent_number == "US8789139B2"
        assert rec.title == "Automated test to tell computers and humans apart"
        assert rec.status == "Granted"
        assert rec.filing_date == "2013-01-11"
        assert rec.publication_date == "2014-07-22"
        assert rec.grant_date == "2014-07-22"
        assert rec.priority_date == "2012-12-20"
        assert "Jean-Charles PICARD" in rec.inventors
        assert "Hewlett Packard Development Co LP" in rec.applicants
        assert rec.source_url == "https://patents.google.com/patent/US8789139B2/en"

        mock_get.assert_called_once()
        call_url = mock_get.call_args[0][0]
        assert call_url == "https://patents.google.com/patent/US8789139B2/en"


def test_google_patents_fallback_us_inventor_match():
    """US patent inventor matching via Google Patents fallback after EPO 404."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_US_GOOGLE_PATENTS_HTML

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response):
        res = verify_patent(
            patent_number="US8789139B2",
            patent_link=None,
            faculty_name="Jean-Charles Picard",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["patent_found"] is True
        assert res["inventor_match"] is True
        assert res["association"] == "verified"
        assert res["verification_status"] == "verified"
        assert res["relationship"] == "Faculty member is listed as an inventor"
        assert res["association_type"] == "inventor"
        assert res["matched_name"] == "Jean-Charles PICARD"
        assert res["patent_number"] == "US8789139B2"
        assert res["verification_source"] == "Google Patents"


def test_google_patents_fallback_us_no_faculty_match():
    """US patent found via Google Patents, but faculty is not associated."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = SAMPLE_US_GOOGLE_PATENTS_HTML

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response):
        res = verify_patent(
            patent_number="US8789139B2",
            patent_link=None,
            faculty_name="Dr. Unrelated Researcher",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["patent_found"] is True
        assert res["inventor_match"] is False
        assert res["association"] == "none"
        assert res["verification_status"] == "not_verified"
        assert res["relationship"] == "Faculty association not found"
        assert res["association_type"] == "none"
        assert res["matched_name"] is None


def test_google_patents_us_404_not_found():
    """Google Patents 404 for a US identifier returns not_found after EPO 404."""
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.text = "Not found"

    epo_provider = MockPatentProvider(status="not_found", record=None)
    fallback_provider = GooglePatentsProvider()

    with patch("requests.get", return_value=mock_response) as mock_get:
        res = verify_patent(
            patent_number="US8789139B2",
            patent_link=None,
            faculty_name="Jean-Charles Picard",
            provider=epo_provider,
            fallback_provider=fallback_provider,
        )

        assert res["verification_status"] == "not_found"
        assert res["patent_found"] is False
        assert res["association_type"] is None
        mock_get.assert_called_once()
        assert mock_get.call_args[0][0] == "https://patents.google.com/patent/US8789139B2/en"


def test_epo_primary_success_skips_google_patents_for_us_identifier():
    """If EPO finds a US patent, Google Patents fallback is not queried."""
    epo_record = PatentRecord(
        patent_number="US8789139B2",
        title="Automated test to tell computers and humans apart",
        inventors=["Jean-Charles PICARD"],
        source="EPO Open Patent Services (OPS)",
    )
    epo_provider = MockPatentProvider(
        status="verified",
        record=epo_record,
        source="EPO Open Patent Services (OPS)",
    )
    fallback_provider = MagicMock()

    res = verify_patent(
        patent_number="US8789139B2",
        patent_link=None,
        faculty_name="Jean-Charles Picard",
        provider=epo_provider,
        fallback_provider=fallback_provider,
    )

    assert res["verification_status"] == "verified"
    assert res["verification_source"] == "EPO Open Patent Services (OPS)"
    assert res["patent_number"] == "US8789139B2"
    fallback_provider.get_patent.assert_not_called()
