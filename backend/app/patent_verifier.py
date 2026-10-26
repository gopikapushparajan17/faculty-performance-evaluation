"""
Patent Verifier Module

Provides patent identifier normalization, SSRF-safe URL extraction,
robust person name matching, and external provider integration (EPO OPS, IP India reference)
for faculty performance evaluation.
"""

from __future__ import annotations
import base64
import html
import ipaddress
import logging
import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urlparse, urlsplit

import requests
from pathlib import Path
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

logger = logging.getLogger(__name__)

# Academic and honorific titles to ignore during name normalization
ACADEMIC_TITLES = {"dr", "prof", "professor", "mr", "mrs", "ms"}

# Strictly allowed domains for patent URL references
ALLOWED_PATENT_DOMAINS = {
    "patents.google.com",
    "worldwide.espacenet.com",
    "espacenet.com",
    "ipindiaservices.gov.in",
    "search.ipindia.gov.in",
    "ipindia.gov.in",
    "patentscope.wipo.int",
    "ops.epo.org",
    "epo.org",
}

# General patent identifier pattern:
# - Indian numeric (e.g. IN123456, 123456, IN123456B, IN202041012345, IN201811044487A)
# - Indian year + optional office code + serial (e.g. IN2013MU01574A, IN2013MU01590A)
# - International publication numbers (e.g. US8789139B2, US9876543B2, EP1234567, WO...)
PATENT_NUMBER_PATTERN = re.compile(
    r"^(?:"
    r"(?:IN)?\d{4}[A-Z]{2,3}\d{4,8}[A-Z]?\d?|"
    r"(?:IN)?[0-9]{6,12}[A-Z0-9]*|"
    r"[A-Z]{2}[0-9]{5,12}[A-Z0-9]*"
    r")$",
    re.IGNORECASE,
)


def _normalize_token(token: str) -> str:
    """Normalize unicode characters and strip combining diacritics."""
    s = unicodedata.normalize("NFKD", token)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


def _tokenize_name(name_str: str) -> list[str]:
    """Tokenize a person's name into clean lowercase words without punctuation."""
    if not name_str or not isinstance(name_str, str):
        return []
    # Replace punctuation and digits with spaces
    cleaned = re.sub(r"[^\w\s]", " ", name_str)
    cleaned = re.sub(r"[\d_]", " ", cleaned)
    tokens: list[str] = []
    for raw in cleaned.split():
        norm = _normalize_token(raw)
        if norm and norm not in ACADEMIC_TITLES:
            tokens.append(norm)
    return tokens


def normalize_person_name(name: str) -> str:
    """
    Normalize a person name:
    - lowercase
    - normalize Unicode
    - remove punctuation
    - normalize whitespace
    """
    tokens = _tokenize_name(name)
    return " ".join(tokens)


def person_name_matches(faculty_name: str, candidate_name: str) -> bool:
    """
    Compare meaningful name tokens between faculty_name and candidate_name.
    Reuses the publication author matching philosophy:
    - Order independent ("John Smith" == "Smith, John")
    - Handles initials where safe ("John A Smith" == "J. A. Smith", "John Smith" == "J. Smith")
    - Does NOT use substring matching alone
    - Does NOT match on single short tokens like "A" or "K" alone
    """
    f_tokens = _tokenize_name(faculty_name)
    c_tokens = _tokenize_name(candidate_name)

    if len(f_tokens) < 2 or len(c_tokens) < 2:
        return False

    if sorted(f_tokens) == sorted(c_tokens):
        return True

    f_words = [t for t in f_tokens if len(t) > 1]
    f_initials = [t for t in f_tokens if len(t) == 1]
    c_words = [t for t in c_tokens if len(t) > 1]
    c_initials = [t for t in c_tokens if len(t) == 1]

    common_words = set(f_words) & set(c_words)
    if not common_words:
        return False

    f_rem_words = [w for w in f_words if w not in common_words]
    c_rem_words = [w for w in c_words if w not in common_words]

    # Conflicting full words (e.g. John Smith vs Bob Smith)
    if f_rem_words and c_rem_words:
        return False

    f_all_initials = sorted([w[0] for w in f_rem_words] + f_initials)
    c_all_initials = sorted([w[0] for w in c_rem_words] + c_initials)

    if f_all_initials == c_all_initials:
        return True

    # When at least 2 full words match (e.g. "John Smith" vs "John A. Smith")
    if len(common_words) >= 2:
        if not f_rem_words and not c_rem_words:
            if (not f_initials and len(c_initials) == 1) or (not c_initials and len(f_initials) == 1):
                return True

    return False


def is_safe_patent_url(url: str) -> bool:
    """
    Validate that a URL points to an approved external patent provider.
    Prevents SSRF by:
    - Enforcing http/https scheme only
    - Rejecting empty hostnames
    - Rejecting userinfo (username/password in URL)
    - Rejecting IP addresses (IPv4, IPv6, localhost, loopback, private ranges)
    - Rejecting internal/local hostnames (.local, .internal, localhost)
    - Strictly whitelisting known patent provider domains
    """
    if not url or not isinstance(url, str):
        return False

    try:
        parsed = urlsplit(url.strip())
    except Exception:
        return False

    if parsed.scheme.lower() not in ("http", "https"):
        return False

    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        return False

    # Disallow userinfo
    if parsed.username or parsed.password:
        return False

    # Disallow localhost / local hostnames
    if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal", ".lan")):
        return False

    # Disallow IP addresses (private, loopback, link-local, public)
    try:
        ip = ipaddress.ip_address(hostname)
        return False
    except ValueError:
        pass

    # Check whitelist
    for allowed in ALLOWED_PATENT_DOMAINS:
        if hostname == allowed or hostname.endswith("." + allowed):
            return True

    return False


def normalize_patent_identifier(value: str | None) -> str | None:
    """
    Normalize patent numbers and application numbers:
    - IN123456 -> IN123456
    - 123456 -> 123456
    - IN123456B -> IN123456B
    - IN202041012345 -> IN202041012345
    - IN/2020/41012345 -> IN202041012345
    - IN2013MU01574A -> IN2013MU01574A
    - US8789139B2 -> US8789139B2
    Rejects malformed input, path traversal, injection characters, or empty strings.
    """
    if not value or not isinstance(value, str):
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    # Strip prefixes like 'patent:', 'pat.', 'application:', 'app.'
    for prefix in ("patent:", "pat:", "application:", "app:"):
        if cleaned.lower().startswith(prefix):
            cleaned = cleaned[len(prefix):].strip()

    # Remove standard delimiter characters often present in filings
    cleaned = re.sub(r"[\s\-_/.]", "", cleaned)
    cleaned = cleaned.upper()

    if not cleaned.isalnum():
        return None

    # Length bounds for realistic patent and application numbers
    if len(cleaned) < 5 or len(cleaned) > 30:
        return None

    if not PATENT_NUMBER_PATTERN.match(cleaned):
        return None

    return cleaned


def extract_patent_identifier_from_url(url: str | None) -> str | None:
    """
    Extract a patent identifier from an allowed patent-provider URL.
    Returns normalized identifier or None if URL is invalid, unsafe, or no identifier found.
    NEVER performs external HTTP fetching of user-provided URLs.
    """
    if not url or not isinstance(url, str):
        return None

    url_str = url.strip()
    if not is_safe_patent_url(url_str):
        return None

    try:
        parsed = urlparse(url_str)
    except Exception:
        return None

    hostname = (parsed.hostname or "").lower()
    path = unquote(parsed.path or "")
    query = parse_qs(parsed.query or "")

    extracted: str | None = None

    # 1. Google Patents: /patent/<id>/<lang>
    if "patents.google.com" in hostname:
        match = re.search(r"/patent/([A-Za-z0-9]+)", path)
        if match:
            extracted = match.group(1)

    # 2. Espacenet: /publication/<id> or query q=<id>
    elif "espacenet.com" in hostname:
        match = re.search(r"/publication/([A-Za-z0-9]+)", path)
        if match:
            extracted = match.group(1)
        elif "q" in query and query["q"]:
            extracted = query["q"][0]

    # 3. IP India / InPASS: query params or path segments
    elif "ipindia" in hostname:
        for param in ("AppId", "ApplicationNumber", "PatentNumber", "q", "app_id", "app_no"):
            if param in query and query[param]:
                extracted = query[param][0]
                break
        if not extracted:
            match = re.search(r"/(?:patent|application)/([A-Za-z0-9]+)", path)
            if match:
                extracted = match.group(1)

    # 4. WIPO Patentscope: docId query param
    elif "patentscope.wipo.int" in hostname:
        if "docId" in query and query["docId"]:
            extracted = query["docId"][0]

    # Fallback heuristic across path and query
    if not extracted:
        match = re.search(r"\b((?:IN)?[0-9]{6,12}[A-Za-z0-9]*|[A-Z]{2}[0-9]{5,12}[A-Za-z0-9]*)\b", path)
        if match:
            extracted = match.group(1)

    if extracted:
        return normalize_patent_identifier(extracted)

    return None


class PatentRecord:
    """Standardized representation of bibliographic patent data."""

    def __init__(
        self,
        patent_number: str | None = None,
        application_number: str | None = None,
        title: str | None = None,
        status: str | None = None,
        inventors: list[str] | None = None,
        applicants: list[str] | None = None,
        current_holder: str | None = None,
        filing_date: str | None = None,
        grant_date: str | None = None,
        source: str = "EPO Open Patent Services (OPS)",
        publication_date: str | None = None,
        priority_date: str | None = None,
        source_url: str | None = None,
    ):
        self.patent_number = patent_number
        self.application_number = application_number
        self.title = title
        self.status = status or "Published"
        self.inventors = inventors or []
        self.applicants = applicants or []
        self.current_holder = current_holder
        self.filing_date = filing_date
        self.grant_date = grant_date
        self.source = source
        self.publication_date = publication_date
        self.priority_date = priority_date
        self.source_url = source_url


class BasePatentProvider:
    """Abstract base class for patent verification providers."""

    def get_patent(self, identifier: str) -> dict[str, Any]:
        """
        Fetch patent details by normalized identifier.
        Returns dict containing:
        - status: 'verified' | 'not_found' | 'unable_to_verify'
        - record: Optional[PatentRecord]
        - verification_source: str
        """
        raise NotImplementedError


class EpoOpsProvider(BasePatentProvider):
    """
    EPO Open Patent Services (OPS) provider.
    Uses OAuth 2.0 Client Credentials flow to query bibliographic patent data.
    """

    OAUTH_TOKEN_URL = "https://ops.epo.org/3.2/auth/accesstoken"
    BIBLIO_PUB_URL = "https://ops.epo.org/rest-services/3.2/published-data/publication/epodoc/{number}/biblio"
    BIBLIO_APP_URL = "https://ops.epo.org/rest-services/3.2/published-data/application/epodoc/{number}/biblio"
    BIBLIO_PUB_DOCDB_URL = (
    "https://ops.epo.org/rest-services/3.2/"
    "published-data/publication/docdb/{number}/biblio")
    TIMEOUT_SECONDS = 15

    def __init__(
        self,
        consumer_key: str | None = None,
        consumer_secret: str | None = None,
    ):
        self.consumer_key = consumer_key or os.environ.get("EPO_OPS_CONSUMER_KEY", "").strip()
        self.consumer_secret = consumer_secret or os.environ.get("EPO_OPS_CONSUMER_SECRET", "").strip()
        self._access_token: str | None = None
        self._token_expires_at: float = 0

    def is_configured(self) -> bool:
        return bool(self.consumer_key and self.consumer_secret)

    def _get_access_token(self) -> str | None:
        if not self.is_configured():
            return None

        now = time.time()
        if self._access_token and now < self._token_expires_at - 30:
            return self._access_token

        auth_str = f"{self.consumer_key}:{self.consumer_secret}"
        b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")

        headers = {
            "Authorization": f"Basic {b64_auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {"grant_type": "client_credentials"}

        try:
            resp = requests.post(
                self.OAUTH_TOKEN_URL,
                headers=headers,
                data=data,
                timeout=self.TIMEOUT_SECONDS,
            )
            if resp.status_code != 200:
                logger.warning("EPO OPS token request failed with status %d", resp.status_code)
                return None

            payload = resp.json()
            token = payload.get("access_token")
            expires_in = int(payload.get("expires_in", 1200))
            if token:
                self._access_token = token
                self._token_expires_at = now + expires_in
                return token
        except Exception:
            logger.exception("Failed to obtain EPO OPS access token")
            return None

        return None

    def _format_date(self, raw_date: Any) -> str | None:
        if not raw_date or not isinstance(raw_date, str):
            return None
        s = raw_date.strip()
        if len(s) == 8 and s.isdigit():
            return f"{s[:4]}-{s[4:6]}-{s[6:]}"
        return s or None

    def _extract_text(self, node: Any) -> str | None:
        if not node:
            return None
        if isinstance(node, str):
            return node.strip() or None
        if isinstance(node, dict):
            val = node.get("$") or node.get("text") or node.get("name")
            if isinstance(val, str):
                return val.strip() or None
        if isinstance(node, list) and node:
            return self._extract_text(node[0])
        return None

    def _parse_biblio_json(self, data: dict[str, Any], identifier: str) -> PatentRecord:
        """Parse EPO OPS JSON bibliographic payload into a PatentRecord."""
        record = PatentRecord(
            patent_number=identifier,
            source="EPO Open Patent Services (OPS)",
        )

        try:
            world = data.get("ops:world-patent-data", {})
            pub_data = (
                world.get("ops:published-data", {})
                or world.get("ops:biblio-search", {})
            )
            exchange_docs = pub_data.get("exchange-documents", {})
            doc = exchange_docs.get("exchange-document")

            if isinstance(doc, list) and doc:
                doc = doc[0]

            if not isinstance(doc, dict):
                return record

            kind_code = doc.get("@kind", "")
            is_granted = "B" in kind_code.upper()
            record.status = "Granted" if is_granted else "Published"

            biblio = doc.get("bibliographic-data", {})

            # Title
            titles = biblio.get("invention-title", [])
            if isinstance(titles, dict):
                titles = [titles]
            for t in titles:
                text = self._extract_text(t)
                if text:
                    record.title = text
                    break

            # Publication Number and Grant Date
            pub_ref = biblio.get("publication-reference", {})
            doc_ids = pub_ref.get("document-id", [])
            if isinstance(doc_ids, dict):
                doc_ids = [doc_ids]
            for did in doc_ids:
                doc_num = self._extract_text(did.get("doc-number"))
                if doc_num:
                    record.patent_number = doc_num
                dt = self._extract_text(did.get("date"))
                if dt:
                    record.grant_date = self._format_date(dt)

            # Application Number and Filing Date
            app_ref = biblio.get("application-reference", {})
            app_doc_ids = app_ref.get("document-id", [])
            if isinstance(app_doc_ids, dict):
                app_doc_ids = [app_doc_ids]
            for did in app_doc_ids:
                doc_num = self._extract_text(did.get("doc-number"))
                if doc_num:
                    record.application_number = doc_num
                dt = self._extract_text(did.get("date"))
                if dt:
                    record.filing_date = self._format_date(dt)

            # Parties: Applicants and Inventors
            parties = biblio.get("parties", {})

            # Applicants
            applicants_data = parties.get("applicants", {}).get("applicant", [])
            if isinstance(applicants_data, dict):
                applicants_data = [applicants_data]
            for a in applicants_data:
                name = self._extract_text(a.get("applicant-name", {}).get("name") or a.get("applicant-name"))
                if name and name not in record.applicants:
                    record.applicants.append(name)

            # Inventors
            inventors_data = parties.get("inventors", {}).get("inventor", [])
            if isinstance(inventors_data, dict):
                inventors_data = [inventors_data]
            for inv in inventors_data:
                name = self._extract_text(inv.get("inventor-name", {}).get("name") or inv.get("inventor-name"))
                if name and name not in record.inventors:
                    record.inventors.append(name)

        except Exception:
            logger.exception("Error parsing EPO OPS bibliographic data")

        return record

    def get_patent(self, identifier: str) -> dict[str, Any]:
        if not self.is_configured():
            return {
                "status": "unable_to_verify",
                "verification_source": "epo_ops_not_configured",
                "record": None,
            }

        token = self._get_access_token()
        if not token:
            return {
                "status": "unable_to_verify",
                "verification_source": "EPO Open Patent Services (OPS)",
                "record": None,
            }

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

        identifier = identifier.strip()

        # Try the identifier exactly as supplied first.
        candidates = [identifier]

        # If the user entered an Indian publication without a kind code,
        # also try the A publication kind.
        if identifier.startswith("IN") and identifier[2:].isdigit():
            candidates.append(f"{identifier}A")

        for epodoc_id in candidates:
            try:
                # 1. Publication lookup using EPODOC
                url = self.BIBLIO_PUB_URL.format(number=epodoc_id)

                resp = requests.get(
                    url,
                    headers=headers,
                    timeout=self.TIMEOUT_SECONDS,
                )

                if resp.status_code == 200:
                    record = self._parse_biblio_json(
                        resp.json(),
                        identifier,
                    )

                    return {
                        "status": "verified",
                        "verification_source": "EPO Open Patent Services (OPS)",
                        "record": record,
                    }

                # 2. Publication lookup using DOCDB
                # DOCDB requires country.number.kind format.
                if epodoc_id.startswith("IN"):
                    doc_number = epodoc_id[2:]

                    if doc_number.endswith("A"):
                        doc_number = doc_number[:-1]

                    docdb_id = f"IN.{doc_number}.A"

                    docdb_url = self.BIBLIO_PUB_DOCDB_URL.format(
                        number=docdb_id
                    )

                    docdb_resp = requests.get(
                        docdb_url,
                        headers=headers,
                        timeout=self.TIMEOUT_SECONDS,
                    )

                    if docdb_resp.status_code == 200:
                        record = self._parse_biblio_json(
                            docdb_resp.json(),
                            identifier,
                        )

                        return {
                            "status": "verified",
                            "verification_source": "EPO Open Patent Services (OPS)",
                            "record": record,
                        }

            except Exception:
                logger.exception(
                    "Failed to query EPO OPS for patent %s",
                    identifier,
                )

        # 3. Try application endpoint as a final EPO lookup.
        try:
            app_url = self.BIBLIO_APP_URL.format(number=identifier)

            resp_app = requests.get(
                app_url,
                headers=headers,
                timeout=self.TIMEOUT_SECONDS,
            )

            if resp_app.status_code == 200:
                record = self._parse_biblio_json(
                    resp_app.json(),
                    identifier,
                )

                return {
                    "status": "verified",
                    "verification_source": "EPO Open Patent Services (OPS)",
                    "record": record,
                }

            if resp_app.status_code not in (404,):
                return {
                    "status": "unable_to_verify",
                    "verification_source": "EPO Open Patent Services (OPS)",
                    "record": None,
                }

        except Exception:
            logger.exception(
                "Failed to query EPO OPS application for patent %s",
                identifier,
            )

        return {
            "status": "not_found",
            "verification_source": "EPO Open Patent Services (OPS)",
            "record": None,
        }


def is_indian_patent_identifier(identifier: str | None) -> bool:
    """Check if identifier represents an Indian patent or patent application."""
    if not identifier or not isinstance(identifier, str):
        return False
    u = identifier.strip().upper()
    if u.startswith("IN"):
        return True
    if u.isdigit() and len(u) in (6, 12):
        return True
    return False


class GooglePatentsProvider(BasePatentProvider):
    """
    Google Patents fallback provider for public patent metadata across all jurisdictions
    (US, IN, EP, WO, etc.).
    Fetches https://patents.google.com/patent/<id>/en using requests without scraping CAPTCHA.
    """

    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
    TIMEOUT_SECONDS = 15

    def _clean_text(self, val: str | None) -> str | None:
        if not val or not isinstance(val, str):
            return None
        cleaned = html.unescape(val)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned or None

    def _publication_identifier(self, identifier: str) -> str:
        """Build the Google Patents path id for any supported jurisdiction."""
        clean_id = identifier.strip().upper()
        # Bare numeric Indian application numbers need the IN country code.
        if is_indian_patent_identifier(clean_id) and not clean_id.startswith("IN"):
            return f"IN{clean_id}"
        return clean_id

    def _google_patents_url(self, identifier: str) -> str:
        return f"https://patents.google.com/patent/{self._publication_identifier(identifier)}/en"

    def _kind_code(self, patent_number: str | None) -> str:
        if not patent_number:
            return ""
        match_kind = re.search(r"([A-Z]+\d*)$", patent_number, re.I)
        return match_kind.group(1).upper() if match_kind else ""

    def _parse_html(self, html_text: str, identifier: str, source_url: str) -> PatentRecord | None:
        if not html_text or not isinstance(html_text, str):
            return None

        # Verify page represents a patent (US, IN, EP, WO, and other jurisdictions).
        patent_markers = (
            "DC.type",
            "publicationNumber",
            "DC.contributor",
            "citation_patent_number",
            "citation_patent_publication_number",
        )
        if not any(marker in html_text for marker in patent_markers):
            return None

        record = PatentRecord(
            patent_number=identifier,
            source="Google Patents",
            source_url=source_url,
        )

        # 1. Canonical source URL
        m_canon = re.search(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', html_text, re.I)
        if m_canon:
            record.source_url = m_canon.group(1).strip()

        # 2. Publication Number (Google uses different meta names by jurisdiction)
        m_pub = re.search(
            r'<meta\s+name=["\']citation_patent_publication_number["\']\s+content=["\']([^"\']+)["\']',
            html_text,
            re.I,
        )
        if m_pub:
            pub_clean = re.sub(r"[:\s]", "", m_pub.group(1).strip())
            record.patent_number = pub_clean
        else:
            m_pub_dd = re.search(r'itemprop=["\']publicationNumber["\'][^>]*>([^<]+)<', html_text, re.I)
            if m_pub_dd:
                record.patent_number = re.sub(r"[\s]", "", m_pub_dd.group(1).strip())
            else:
                m_pat_num = re.search(
                    r'<meta\s+name=["\']citation_patent_number["\']\s+content=["\']([^"\']+)["\']',
                    html_text,
                    re.I,
                )
                if m_pat_num:
                    record.patent_number = re.sub(r"[:\s]", "", m_pat_num.group(1).strip()) or identifier

        # 3. Application Number
        m_app = re.search(
            r'<meta\s+name=["\']citation_patent_application_number["\']\s+content=["\']([^"\']+)["\']',
            html_text,
            re.I,
        )
        if m_app:
            app_clean = re.sub(r"[:\s]", "", m_app.group(1).strip())
            record.application_number = app_clean
        else:
            m_app_dd = re.search(r'itemprop=["\']applicationNumber["\'][^>]*>([^<]+)<', html_text, re.I)
            if m_app_dd:
                record.application_number = re.sub(r"[\s]", "", m_app_dd.group(1).strip())

        # 4. Title
        title: str | None = None
        m_title = re.search(r'<meta\s+name=["\']DC\.title["\']\s+content=["\']([^"\']+)["\']', html_text, re.I)
        if m_title and m_title.group(1).strip():
            title = self._clean_text(m_title.group(1))
        if not title:
            m_title_meta = re.search(r'<meta\s+itemprop=["\']title["\']\s+content=["\']([^"\']+)["\']', html_text, re.I)
            if m_title_meta and m_title_meta.group(1).strip():
                title = self._clean_text(m_title_meta.group(1))
        if not title:
            m_page_title = re.search(r'<h1[^>]*itemprop=["\']pageTitle["\'][^>]*>(.*?)</h1>', html_text, re.I | re.S)
            if m_page_title:
                raw_h1 = html.unescape(m_page_title.group(1))
                parts = [p.strip() for p in raw_h1.split("-")]
                if len(parts) >= 3 and parts[1]:
                    title = parts[1]
        if not title:
            m_head_title = re.search(r'<title>([^<]+)</title>', html_text, re.I)
            if m_head_title:
                raw_t = html.unescape(m_head_title.group(1))
                parts = [p.strip() for p in raw_t.split("-")]
                if len(parts) >= 3 and parts[1]:
                    title = parts[1]
        record.title = title

        # 5. Filing Date
        m_filing = re.search(
            r'<meta\s+(?:name=["\']DC\.date["\']\s+content=["\']([^"\']+)["\']\s+scheme=["\']dateSubmitted["\']|scheme=["\']dateSubmitted["\']\s+name=["\']DC\.date["\']\s+content=["\']([^"\']+)["\'])',
            html_text,
            re.I,
        )
        if m_filing:
            record.filing_date = m_filing.group(1) or m_filing.group(2)
        else:
            m_filing_time = re.search(r'itemprop=["\']filingDate["\'][^>]*>([^<]+)<', html_text, re.I)
            if m_filing_time:
                record.filing_date = m_filing_time.group(1).strip()

        # 6. Publication Date
        m_pub_date = re.search(
            r'<meta\s+name=["\']DC\.date["\']\s+content=["\'](\d{4}-\d{2}-\d{2})["\'](?!\s+scheme)',
            html_text,
            re.I,
        )
        if m_pub_date:
            record.publication_date = m_pub_date.group(1)
        else:
            m_issue = re.search(
                r'<meta\s+(?:name=["\']DC\.date["\']\s+content=["\']([^"\']+)["\']\s+scheme=["\']issue["\']|scheme=["\']issue["\']\s+name=["\']DC\.date["\']\s+content=["\']([^"\']+)["\'])',
                html_text,
                re.I,
            )
            if m_issue:
                record.publication_date = m_issue.group(1) or m_issue.group(2)
            else:
                m_pub_time = re.search(r'itemprop=["\']publicationDate["\'][^>]*>([^<]+)<', html_text, re.I)
                if m_pub_time:
                    record.publication_date = self._clean_text(m_pub_time.group(1))

        # 7. Priority Date
        m_prio = re.search(r'itemprop=["\']priorityDate["\'][^>]*>([^<]+)<', html_text, re.I)
        if m_prio:
            record.priority_date = m_prio.group(1).strip()

        # 8. Status and Grant Date (kind codes such as B2, A1)
        kind_letter = self._kind_code(record.patent_number) or self._kind_code(identifier)
        if "B" in kind_letter:
            record.status = "Granted"
            record.grant_date = record.publication_date
        elif "A" in kind_letter:
            record.status = "Published"
        else:
            record.status = "Published"

        # 9. Inventors
        inv_matches = re.findall(
            r'<meta\s+(?:name=["\']DC\.contributor["\']\s+content=["\']([^"\']+)["\']\s+scheme=["\']inventor["\']|scheme=["\']inventor["\']\s+name=["\']DC\.contributor["\']\s+content=["\']([^"\']+)["\'])',
            html_text,
            re.I,
        )
        for m in inv_matches:
            raw_name = m[0] or m[1]
            cleaned = self._clean_text(raw_name)
            if cleaned and cleaned not in record.inventors:
                record.inventors.append(cleaned)

        if not record.inventors:
            item_invs = re.findall(r'itemprop=["\']inventor["\'][^>]*>([^<]+)<', html_text, re.I)
            for raw_name in item_invs:
                cleaned = self._clean_text(raw_name)
                if cleaned and cleaned not in record.inventors:
                    record.inventors.append(cleaned)

        # 10. Assignees (applicants / current holder)
        ass_matches = re.findall(
            r'<meta\s+(?:name=["\']DC\.contributor["\']\s+content=["\']([^"\']+)["\']\s+scheme=["\']assignee["\']|scheme=["\']assignee["\']\s+name=["\']DC\.contributor["\']\s+content=["\']([^"\']+)["\'])',
            html_text,
            re.I,
        )
        for m in ass_matches:
            raw_name = m[0] or m[1]
            cleaned = self._clean_text(raw_name)
            if cleaned and cleaned not in record.applicants:
                record.applicants.append(cleaned)

        if not record.applicants:
            item_ass = re.findall(
                r'itemprop=["\'](?:assigneeOriginal|assigneeCurrent)["\'][^>]*>([^<]+)<',
                html_text,
                re.I,
            )
            for raw_name in item_ass:
                cleaned = self._clean_text(raw_name)
                if cleaned and cleaned not in record.applicants:
                    record.applicants.append(cleaned)

        if record.applicants:
            record.current_holder = record.applicants[0]

        return record

    def get_patent(self, identifier: str) -> dict[str, Any]:
        clean_id = self._publication_identifier(identifier)
        url = self._google_patents_url(identifier)

        if not is_safe_patent_url(url):
            return {
                "status": "unable_to_verify",
                "verification_source": "Google Patents",
                "record": None,
            }

        headers = {
            "User-Agent": self.USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        try:
            resp = requests.get(
                url,
                headers=headers,
                timeout=self.TIMEOUT_SECONDS,
                allow_redirects=True,
            )
            if resp.status_code == 404:
                return {
                    "status": "not_found",
                    "verification_source": "Google Patents",
                    "record": None,
                }

            if resp.status_code == 200:
                record = self._parse_html(resp.text, clean_id, url)
                if not record:
                    return {
                        "status": "not_found",
                        "verification_source": "Google Patents",
                        "record": None,
                    }
                return {
                    "status": "verified",
                    "verification_source": "Google Patents",
                    "record": record,
                }

            return {
                "status": "unable_to_verify",
                "verification_source": "Google Patents",
                "record": None,
            }

        except Exception:
            logger.exception("Failed to query Google Patents for patent %s", identifier)
            return {
                "status": "unable_to_verify",
                "verification_source": "Google Patents",
                "record": None,
            }


_DEFAULT_PROVIDER = None
_DEFAULT_FALLBACK_PROVIDER = None


def get_default_provider() -> BasePatentProvider:
    global _DEFAULT_PROVIDER
    if _DEFAULT_PROVIDER is None:
        _DEFAULT_PROVIDER = EpoOpsProvider()
    return _DEFAULT_PROVIDER


def set_default_provider(provider: BasePatentProvider | None) -> None:
    global _DEFAULT_PROVIDER
    _DEFAULT_PROVIDER = provider


def get_default_fallback_provider() -> BasePatentProvider:
    global _DEFAULT_FALLBACK_PROVIDER
    if _DEFAULT_FALLBACK_PROVIDER is None:
        _DEFAULT_FALLBACK_PROVIDER = GooglePatentsProvider()
    return _DEFAULT_FALLBACK_PROVIDER


def set_default_fallback_provider(provider: BasePatentProvider | None) -> None:
    global _DEFAULT_FALLBACK_PROVIDER
    _DEFAULT_FALLBACK_PROVIDER = provider


def verify_patent(
    patent_number: str | None,
    patent_link: str | None,
    faculty_name: str,
    provider: BasePatentProvider | None = None,
    fallback_provider: BasePatentProvider | None = None,
) -> dict[str, Any]:
    """
    Verify whether a patent record exists and whether the faculty member is associated with it.

    Returns structured dictionary:
    {
        "verification_status": "verified" | "not_verified" | "not_found" | "unable_to_verify",
        "association_type": "inventor" | "applicant" | "holder" | "none" | None,
        "matched_name": str | None,
        "patent_number": str | None,
        "application_number": str | None,
        "title": str | None,
        "status": str | None,
        "inventors": list[str],
        "applicants": list[str],
        "current_holder": str | None,
        "filing_date": str | None,
        "grant_date": str | None,
        "publication_date": str | None,
        "priority_date": str | None,
        "source_url": str | None,
        "verification_source": str,
        "verified_at": str,
        "patent_found": bool,
        "inventor_match": bool,
        "association": str | None,
        "relationship": str | None
    }
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # Determine identifier from patent_link or patent_number
    normalized_id: str | None = None

    if patent_link:
        if not is_safe_patent_url(patent_link):
            raise ValueError("Invalid patent link domain or unsafe URL format.")
        normalized_id = extract_patent_identifier_from_url(patent_link)
        if not normalized_id:
            raise ValueError("Could not extract a valid patent identifier from the URL.")
    elif patent_number:
        p_num = patent_number.strip()
        if p_num.lower().startswith(("http://", "https://")):
            if not is_safe_patent_url(p_num):
                raise ValueError("Invalid patent link domain or unsafe URL format.")
            normalized_id = extract_patent_identifier_from_url(p_num)
        else:
            normalized_id = normalize_patent_identifier(p_num)

        if not normalized_id:
            raise ValueError("Invalid patent number or application number format.")
    else:
        raise ValueError("Either patent_number or patent_link must be provided.")

    active_provider = provider or get_default_provider()
    result = active_provider.get_patent(normalized_id)

    status = result.get("status")
    source = result.get("verification_source", "EPO Open Patent Services (OPS)")
    record: PatentRecord | None = result.get("record")

    # If EPO returned not_found or epo_ops_not_configured, try Google Patents fallback for any jurisdiction
    active_fallback = fallback_provider or (get_default_fallback_provider() if provider is None else None)

    if (
        (status == "not_found" or (status == "unable_to_verify" and source == "epo_ops_not_configured"))
        and active_fallback is not None
    ):
        fb_result = active_fallback.get_patent(normalized_id)
        fb_status = fb_result.get("status")
        if fb_status == "verified" and fb_result.get("record"):
            status = "verified"
            source = fb_result.get("verification_source", "Google Patents")
            record = fb_result.get("record")
        elif fb_status == "unable_to_verify":
            status = "unable_to_verify"
            source = fb_result.get("verification_source", "Google Patents")
            record = None
        elif fb_status == "not_found":
            # Both providers genuinely cannot find the record
            status = "not_found"
            source = fb_result.get("verification_source", "Google Patents")
            record = None

    if status == "unable_to_verify":
        return {
            "verification_status": "unable_to_verify",
            "association_type": None,
            "matched_name": None,
            "patent_number": normalized_id,
            "application_number": None,
            "title": None,
            "status": None,
            "inventors": [],
            "applicants": [],
            "current_holder": None,
            "filing_date": None,
            "grant_date": None,
            "publication_date": None,
            "priority_date": None,
            "source_url": None,
            "verification_source": source,
            "verified_at": now_iso,
            "patent_found": False,
            "inventor_match": False,
            "association": None,
            "relationship": None,
        }

    if status == "not_found" or not record:
        return {
            "verification_status": "not_found",
            "association_type": None,
            "matched_name": None,
            "patent_number": normalized_id,
            "application_number": None,
            "title": None,
            "status": None,
            "inventors": [],
            "applicants": [],
            "current_holder": None,
            "filing_date": None,
            "grant_date": None,
            "publication_date": None,
            "priority_date": None,
            "source_url": None,
            "verification_source": source,
            "verified_at": now_iso,
            "patent_found": False,
            "inventor_match": False,
            "association": None,
            "relationship": None,
        }

    # Record was found; now match faculty name to inventor / applicant / current_holder
    matched_name: str | None = None
    association_type: str | None = None

    # 1. Check Inventors
    for inv in record.inventors:
        if person_name_matches(faculty_name, inv):
            association_type = "inventor"
            matched_name = inv
            break

    # 2. Check Applicants
    if not association_type:
        for app in record.applicants:
            if person_name_matches(faculty_name, app):
                association_type = "applicant"
                matched_name = app
                break

    # 3. Check Current Holder
    if not association_type and record.current_holder:
        if person_name_matches(faculty_name, record.current_holder):
            association_type = "holder"
            matched_name = record.current_holder

    if association_type == "inventor":
        verification_status = "verified"
        is_inventor_match = True
        relationship = "Faculty member is listed as an inventor"
    elif association_type in ("applicant", "holder"):
        verification_status = "verified"
        is_inventor_match = False
        relationship = "Faculty member is listed as an applicant/assignee"
    else:
        verification_status = "not_verified"
        association_type = "none"
        is_inventor_match = False
        relationship = "Faculty association not found"

    return {
        "verification_status": verification_status,
        "association_type": association_type,
        "matched_name": matched_name,
        "patent_number": record.patent_number or normalized_id,
        "application_number": record.application_number,
        "title": record.title,
        "status": record.status,
        "inventors": record.inventors,
        "applicants": record.applicants,
        "current_holder": record.current_holder,
        "filing_date": record.filing_date,
        "grant_date": record.grant_date,
        "publication_date": getattr(record, "publication_date", None),
        "priority_date": getattr(record, "priority_date", None),
        "source_url": getattr(record, "source_url", None),
        "verification_source": source,
        "verified_at": now_iso,
        "patent_found": True,
        "inventor_match": is_inventor_match,
        "association": "verified" if association_type in ("inventor", "applicant", "holder") else "none",
        "relationship": relationship,
    }

