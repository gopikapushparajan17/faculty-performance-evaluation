import os
import re
import threading
import time
from urllib.parse import urljoin

import pandas as pd
import requests

from app.scopus_checker import (
    CURRENT_SCOPUS_FILE,
    reload_scopus_sources,
)


SCOPUS_PAGE_URL = "https://www.elsevier.com/products/scopus/content"

CHECK_INTERVAL_SECONDS = 24 * 60 * 60

_download_lock = threading.Lock()


def get_current_scopus_download_url():
    response = requests.get(
        SCOPUS_PAGE_URL,
        headers={
            "User-Agent": "FacultyPerformanceEvaluationSystem/1.0"
        },
        timeout=30,
    )
    response.raise_for_status()

    links = re.findall(
        r'href=["\']([^"\']+\.xlsx[^"\']*)["\']',
        response.text,
        flags=re.IGNORECASE,
    )

    for link in links:
        full_url = urljoin(SCOPUS_PAGE_URL, link)

        if "ext_list" in full_url.lower():
            return full_url

    raise RuntimeError(
        "Could not find the Scopus Source Title List download link."
    )


def download_scopus_file(download_url):
    os.makedirs(
        os.path.dirname(CURRENT_SCOPUS_FILE),
        exist_ok=True,
    )

    temp_file = CURRENT_SCOPUS_FILE + ".tmp"

    response = requests.get(
        download_url,
        headers={
            "User-Agent": "FacultyPerformanceEvaluationSystem/1.0"
        },
        timeout=60,
    )
    response.raise_for_status()

    with open(temp_file, "wb") as file:
        file.write(response.content)

    # Validate the downloaded Excel file before replacing
    # the currently working database.
    df = pd.read_excel(temp_file)

    required_columns = {
        "Source Title",
        "ISSN",
        "EISSN",
        "Active or Inactive",
        "Coverage",
        "Source Type",
    }

    missing_columns = required_columns - set(df.columns)

    if missing_columns:
        os.remove(temp_file)

        raise RuntimeError(
            f"Downloaded Scopus file is missing columns: {missing_columns}"
        )

    os.replace(temp_file, CURRENT_SCOPUS_FILE)


def update_scopus_source_list():
    if not _download_lock.acquire(blocking=False):
        return False

    try:
        download_url = get_current_scopus_download_url()

        print(
            f"[Scopus updater] Current source list: {download_url}"
        )

        download_scopus_file(download_url)

        reload_scopus_sources()

        print(
            "[Scopus updater] Scopus Source Title List updated successfully."
        )

        return True

    except Exception as exc:
        print(
            f"[Scopus updater] Update failed: {exc}"
        )

        return False

    finally:
        _download_lock.release()


def start_scopus_updater():
    def updater_loop():
        # Check once when the backend starts.
        update_scopus_source_list()

        while True:
            time.sleep(CHECK_INTERVAL_SECONDS)
            update_scopus_source_list()

    thread = threading.Thread(
        target=updater_loop,
        daemon=True,
        name="scopus-updater",
    )

    thread.start()

if __name__ == "__main__":
    update_scopus_source_list()