import os

import requests
from dotenv import load_dotenv

load_dotenv()

SCOPUS_SEARCH_URL = "https://api.elsevier.com/content/search/scopus"
REQUEST_TIMEOUT_SECONDS = 15


def check_scopus_article(doi: str) -> dict:
    """
    Check whether a specific DOI exists as a record in Scopus.

    Returns article-level Scopus verification.
    """

    api_key = os.getenv("SCOPUS_API_KEY")

    if not api_key:
        return {
            "status": "unavailable",
            "message": "Scopus API key is not configured.",
        }

    doi = doi.strip()

    try:
        response = requests.get(
            SCOPUS_SEARCH_URL,
            params={
                "query": f"DOI({doi})",
                "count": 1,
            },
            headers={
                "X-ELS-APIKey": api_key,
                "Accept": "application/json",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        return {
            "status": "error",
            "message": f"Scopus API request failed: {exc}",
        }

    if response.status_code != 200:
        return {
            "status": "error",
            "message": f"Scopus API returned HTTP {response.status_code}.",
        }

    try:
        data = response.json()
    except ValueError:
        return {
            "status": "error",
            "message": "Scopus API returned an invalid JSON response.",
        }

    search_results = data.get("search-results", {})

    total_results = int(
        search_results.get("opensearch:totalResults", 0) or 0
    )

    entries = search_results.get("entry") or []

    if total_results == 0 or not entries:
        return {
            "status": "not_found",
            "doi": doi,
            "message": "No Scopus record found for this DOI.",
        }

    entry = entries[0]

    return {
        "status": "indexed",
        "doi": entry.get("prism:doi") or doi,
        "eid": entry.get("eid"),
        "title": entry.get("dc:title"),
        "source": entry.get("prism:publicationName"),
        "document_type": entry.get("prism:aggregationType"),
        "scopus_url": (
            f"https://www.scopus.com/record/display.uri"
            f"?eid={entry.get('eid')}"
        )
        if entry.get("eid")
        else None,
    }