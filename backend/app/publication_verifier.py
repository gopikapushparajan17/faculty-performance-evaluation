"""Verify a faculty-submitted publication against the public Crossref REST API.

This module only checks whether Crossref has a matching work for a DOI.
A successful match does not prove Scopus (or any other) indexing.
"""

import os
import re
from urllib.parse import parse_qs, unquote, quote, urlparse
from app.scopus_checker import check_scopus_source
from app.wos_checker import check_web_of_science

import requests

CROSSREF_WORKS_URL = "https://api.crossref.org/works/{doi}"
REQUEST_TIMEOUT_SECONDS = 15

# DOI prefix 10.NNNN (4–9 digits) plus the suffix. See Crossref DOI display guidelines.
DOI_PATTERN = re.compile(
    r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+",
    re.IGNORECASE,
)

# Scopus document EID, e.g. 2-s2.0-85123456789. Never treated as a DOI.
SCOPUS_EID_PATTERN = re.compile(r"2-s2\.0-\d+", re.IGNORECASE)


def _empty_result(*, doi=None, scopus_eid=None, source_url=None, error=None):
    return {
        "publication_found": False,
        "doi": doi,
        "scopus_eid": scopus_eid,
        "title": None,
        "authors": [],
        "journal": None,
        "publisher": None,
        "source_url": source_url,
        "error": error,
    }


def extract_doi(value):
    """Return a normalized DOI string from a URL, doi.org link, or raw DOI.

    Returns None when no DOI can be extracted.
    """
    if not value or not isinstance(value, str):
        return None

    text = unquote(value.strip())
    if not text:
        return None

    # Prefer the path after doi.org / dx.doi.org when present.
    lowered = text.lower()
    for marker in ("doi.org/", "dx.doi.org/"):
        idx = lowered.find(marker)
        if idx != -1:
            text = text[idx + len(marker) :]
            break

    # Drop a leading "doi:" prefix.
    if text.lower().startswith("doi:"):
        text = text[4:].strip()

    match = DOI_PATTERN.search(text)
    if not match:
        return None

    doi = match.group(0).rstrip(".,;)]}>")
    return doi


def extract_scopus_eid(value):
    """Return a Scopus EID (e.g. 2-s2.0-...) from a URL or raw EID.

    Does not interpret an EID as a DOI.
    """
    if not value or not isinstance(value, str):
        return None

    text = unquote(value.strip())
    if not text:
        return None

    parsed = urlparse(text)
    if parsed.query:
        params = parse_qs(parsed.query)
        for key, values in params.items():
            if key.lower() != "eid" or not values:
                continue
            match = SCOPUS_EID_PATTERN.search(values[0].strip())
            if match:
                return match.group(0)

    match = SCOPUS_EID_PATTERN.search(text)
    if not match:
        return None
    return match.group(0)


def _user_agent():
    mailto = (os.environ.get("CROSSREF_MAILTO") or "").strip()
    if mailto:
        return f"FacultyPerformanceEvaluation/1.0 (mailto:{mailto})"
    return "FacultyPerformanceEvaluation/1.0 (publication verification; set CROSSREF_MAILTO)"


def _crossref_headers():
    mailto = (os.environ.get("CROSSREF_MAILTO") or "").strip()
    headers = {
        "User-Agent": _user_agent(),
        "Accept": "application/json",
    }
    if mailto:
        headers["mailto"] = mailto
    return headers


def _author_full_name(given, family):
    parts = [p for p in (given, family) if p]
    return " ".join(parts) if parts else None


def _author_affiliations(author):
    affiliations = []
    raw = author.get("affiliation") or []
    if not isinstance(raw, list):
        return affiliations
    for item in raw:
        if isinstance(item, dict):
            name = item.get("name")
            if name:
                affiliations.append(name)
        elif isinstance(item, str) and item.strip():
            affiliations.append(item.strip())
    return affiliations


def _orcid_from_author(author):
    orcid = author.get("ORCID") or author.get("orcid")
    if not orcid or not isinstance(orcid, str):
        return None
    orcid = orcid.strip()
    return orcid or None


def _first_text(value):
    """Crossref often returns title/container-title as a list of strings."""
    if isinstance(value, list):
        for item in value:
            if isinstance(item, str) and item.strip():
                return item.strip()
        return None
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _parse_work_message(message, *, doi, scopus_eid, source_url):
    if not isinstance(message, dict):
        return _empty_result(
            doi=doi,
            scopus_eid=scopus_eid,
            source_url=source_url,
            error="Malformed Crossref response: missing work metadata.",
        )

    authors = []
    raw_authors = message.get("author") or []
    if isinstance(raw_authors, list):
        for author in raw_authors:
            if not isinstance(author, dict):
                continue
            given = author.get("given") or None
            family = author.get("family") or None
            name = author.get("name")
            full_name = _author_full_name(given, family) or (name if isinstance(name, str) else None)
            authors.append(
                {
                    "given": given,
                    "family": family,
                    "full_name": full_name,
                    "orcid": _orcid_from_author(author),
                    "affiliations": _author_affiliations(author),
                }
            )

    resolved_doi = message.get("DOI") or doi
    if isinstance(resolved_doi, str):
        resolved_doi = resolved_doi.strip() or doi
    else:
        resolved_doi = doi

    return {
    "publication_found": True,
    "doi": resolved_doi,
    "scopus_eid": scopus_eid,
    "publication_type": message.get("type"),
    "is_conference_paper": message.get("type") == "proceedings-article",
    "title": _first_text(message.get("title")),
    "authors": authors,
    "journal": _first_text(message.get("container-title")),
    "issn": _first_text(message.get("ISSN")),
    "isbn": _first_text(message.get("ISBN")),
    "publisher": message.get("publisher") if isinstance(message.get("publisher"), str) else None,
    "source_url": source_url,
    "error": None,
}

def normalize_name(name):
    return " ".join(str(name).strip().lower().split())

def verify_publication(publication_input, faculty=None):
    """Look up a publication URL or DOI on Crossref.

    Returns a dictionary with publication_found, metadata fields, and error.
    Does not assert Scopus indexing or any database other than Crossref.
    """
    source_url = publication_input.strip() if isinstance(publication_input, str) else publication_input
    source_url_out = source_url if isinstance(source_url, str) else None

    doi = extract_doi(publication_input)
    scopus_eid = extract_scopus_eid(publication_input)

    if not doi:
        if scopus_eid:
            return _empty_result(
                scopus_eid=scopus_eid,
                source_url=source_url_out,
                error=(
                    "Scopus EID detected, but no DOI was found. "
                    "Crossref lookup was not performed; a DOI is required to verify the publication on Crossref. "
                    "This result does not confirm Scopus indexing."
                ),
            )
        return _empty_result(
            source_url=source_url_out,
            error="No valid DOI found in the provided URL or text.",
        )

    encoded_doi = quote(doi, safe="")
    url = CROSSREF_WORKS_URL.format(doi=encoded_doi)
    if source_url_out and not source_url_out.lower().startswith(("http://", "https://")):
        source_url_out = f"https://doi.org/{doi}"

    try:
        response = requests.get(
            url,
            headers=_crossref_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return _empty_result(
            doi=doi,
            scopus_eid=scopus_eid,
            source_url=source_url_out,
            error=f"Network error while contacting Crossref: {exc}",
        )

    if response.status_code == 404:
        return _empty_result(
            doi=doi,
            scopus_eid=scopus_eid,
            source_url=source_url_out,
            error="Publication not found in Crossref for this DOI.",
        )

    if response.status_code != 200:
        return _empty_result(
            doi=doi,
            scopus_eid=scopus_eid,
            source_url=source_url_out,
            error=f"Crossref returned HTTP {response.status_code}.",
        )

    try:
        payload = response.json()
    except ValueError:
        return _empty_result(
            doi=doi,
            scopus_eid=scopus_eid,
            source_url=source_url_out,
            error="Malformed Crossref response: body is not valid JSON.",
        )

    if not isinstance(payload, dict):
        return _empty_result(
            doi=doi,
            scopus_eid=scopus_eid,
            source_url=source_url_out,
            error="Malformed Crossref response: expected a JSON object.",
        )

    result = _parse_work_message(
        payload.get("message"),
        doi=doi,
        scopus_eid=scopus_eid,
        source_url=source_url_out,
    )


    if faculty is not None:
        faculty_name = getattr(faculty, "name", None)

        if faculty_name:
            target_name = normalize_name(faculty_name)
            matched_author = None

            for author in result.get("authors", []):
                author_names = [
                    normalize_name(author.get("full_name", "")),
                    normalize_name(author.get("given", "")),
                    normalize_name(author.get("family", "")),
                ]

                if target_name in author_names:
                    matched_author = author
                    break

            result["author_match"] = matched_author is not None
            result["matched_author"] = matched_author.get("full_name") if matched_author else None

            if matched_author is None:
                result["author_match_error"] = (
                    f"Publication author could not be matched to faculty "
                    f"member '{faculty_name}'."
                )
    scopus_evidence = get_scopus_evidence(result.get("doi"))

    result["scopus_status"] = scopus_evidence["scopus_status"]
    result["scopus_evidence_url"] = scopus_evidence["scopus_evidence_url"]

    scopus_result = check_scopus_source(
        issn=result.get("issn"),
        eissn=result.get("eissn"),
        source_title=result.get("journal"),
    )

    result["scopus_status"] = scopus_result.get("status")
    result["scopus_source"] = scopus_result
    result["web_of_science"] = check_web_of_science(
        result.get("doi")
    )

    return result

def get_scopus_evidence(doi):
    """
    Generate a Scopus search URL for manual verification.
    No Scopus API is required.
    """

    if not doi:
        return {
            "scopus_status": "not_available",
            "scopus_evidence_url": None,
        }

    scopus_url = (
        "https://www.scopus.com/results/results.uri"
        "?sort=plf-f"
        "&src=s"
        "&st1="
        + doi
    )

    return {
        "scopus_status": "manual_verification_required",
        "scopus_evidence_url": scopus_url,
    }
