import os
import pandas as pd


SCOPUS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "data",
    "ext_list_Jul_2026.xlsx",
)


def load_scopus_sources():
    """Load the official Scopus Source Title List."""
    return pd.read_excel(SCOPUS_FILE)


def normalize_issn(issn):
    if not issn:
        return ""

    return str(issn).replace("-", "").replace(" ", "").upper()


def check_scopus_source(issn=None, eissn=None, source_title=None):
    df = load_scopus_sources()

    df["issn_normalized"] = df["ISSN"].apply(normalize_issn)
    df["eissn_normalized"] = df["EISSN"].apply(normalize_issn)

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
            df["Source Title"]
            .astype(str)
            .str.strip()
            .str.lower()
            .eq(normalized_title)
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