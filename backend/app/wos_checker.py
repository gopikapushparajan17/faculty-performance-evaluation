import os
import requests


WOS_API_URL = "https://api.clarivate.com/apis/wos-starter/v1/documents"


def check_web_of_science(doi: str):
    """
    Check whether a publication is available in Web of Science.

    Requires a Web of Science Starter API key.
    """

    api_key = os.getenv("WOS_API_KEY")

    if not api_key:
        return {
            "status": "pending_api_access",
            "message": "Web of Science API access is not available yet."
        }

    if not doi:
        return {
            "status": "invalid_input",
            "message": "DOI is required for Web of Science verification."
        }

    headers = {
        "X-ApiKey": api_key,
        "Accept": "application/json"
    }

    params = {
        "q": f"DO={doi}"
    }

    try:
        response = requests.get(
            WOS_API_URL,
            headers=headers,
            params=params,
            timeout=15
        )

        if response.status_code == 401:
            return {
                "status": "authentication_error",
                "message": "Invalid or unauthorized Web of Science API key."
            }

        if response.status_code == 403:
            return {
                "status": "access_denied",
                "message": "Web of Science API subscription is not active."
            }

        if response.status_code != 200:
            return {
                "status": "api_error",
                "message": f"Web of Science API returned {response.status_code}."
            }

        data = response.json()

        records = data.get("hits", [])

        if records:
            return {
                "status": "indexed",
                "source": "Web of Science",
                "records_found": len(records),
                "data": records[0]
            }

        return {
            "status": "not_found",
            "source": "Web of Science",
            "message": "Publication was not found in Web of Science."
        }

    except requests.RequestException as e:
        return {
            "status": "connection_error",
            "message": str(e)
        }