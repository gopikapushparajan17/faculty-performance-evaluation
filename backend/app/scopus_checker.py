import os
import pandas as pd


SCOPUS_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "data",
)

LEGACY_SCOPUS_FILE = os.path.join(
    SCOPUS_DATA_DIR,
    "ext_list_Jul_2026.xlsx",
)

CURRENT_SCOPUS_FILE = os.path.join(
    SCOPUS_DATA_DIR,
    "scopus_source_list_current.xlsx",
)

SCOPUS_FILE = (
    CURRENT_SCOPUS_FILE
    if os.path.exists(CURRENT_SCOPUS_FILE)
    else LEGACY_SCOPUS_FILE
)


def normalize_issn(issn):
    if not issn:
        return ""

    return str(issn).replace("-", "").replace(" ", "").upper()


def load_scopus_sources(file_path=None):
    """Load and normalize the official Scopus Source Title List."""
    file_path = file_path or SCOPUS_FILE

    df = pd.read_excel(file_path)
    df["issn_normalized"] = df["ISSN"].apply(normalize_issn)
    df["eissn_normalized"] = df["EISSN"].apply(normalize_issn)

    df["title_normalized"] = (
        df["Source Title"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    return df

SCOPUS_DF = load_scopus_sources()
# Load the Scopus database once when the module is imported.
def reload_scopus_sources():
    global SCOPUS_DF

    SCOPUS_DF = load_scopus_sources(
        CURRENT_SCOPUS_FILE
        if os.path.exists(CURRENT_SCOPUS_FILE)
        else LEGACY_SCOPUS_FILE
    )


def check_scopus_source(issn=None, eissn=None, source_title=None):
    df = SCOPUS_DF

    matches = pd.DataFrame()

    if issn:
        normalized_issn = normalize_issn(issn)

        matches = df[
            (df["issn_normalized"] == normalized_issn)
            | (df["eissn_normalized"] == normalized_issn)
        ]

    if matches.empty and eissn:
        normalized_eissn = normalize_issn(eissn)

        matches = df[
            (df["issn_normalized"] == normalized_eissn)
            | (df["eissn_normalized"] == normalized_eissn)
        ]

    if matches.empty and source_title:
        normalized_title = str(source_title).strip().lower()

        matches = df[
            df["title_normalized"] == normalized_title
        ]

    if matches.empty:
        return {
            "status": "not_found",
            "source_title": source_title,
            "message": "Source not found in Scopus Source Title List."
        }

    row = matches.iloc[0]

    return {
        "status": "source_covered",
        "source_title": row["Source Title"],
        "issn": row["ISSN"],
        "eissn": row["EISSN"],
        "active": row["Active or Inactive"],
        "coverage": row["Coverage"],
        "source_type": row["Source Type"],
    }


if __name__ == "__main__":
    result = check_scopus_source(issn="0028-0836")
    print(result)