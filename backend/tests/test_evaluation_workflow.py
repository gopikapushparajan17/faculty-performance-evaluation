import pytest
from unittest.mock import MagicMock, patch
from app.models import (
    Evaluation,
    EvaluationModules,
    EvaluationParameter,
    PartAData,
    PartBData,
    PartCData,
    JournalIndexData,
    IPRData,
    IPREntry,
)
from app.crud import create_evaluation, get_evaluation, update_evaluation


def test_position_selection_stored_in_evaluation():
    db = MagicMock()
    created_rows = []

    def mock_add(row):
        row.id = 101
        created_rows.append(row)

    db.add.side_effect = mock_add
    db.refresh.side_effect = lambda row: None

    payload = {
        "faculty_id": "5",
        "ef_id": "2",
        "academic_year": "2026-2027",
        "faculty_position": "professor",
        "position": "Professor",
        "status": "draft",
        "modules": {},
    }

    with patch("app.crud.SessionLocal", return_value=db):
        res = create_evaluation(payload)

    assert len(created_rows) == 1
    row = created_rows[0]
    assert row.modules["faculty_position"] == "professor"
    assert row.modules["position"] == "Professor"
    assert res.faculty_position == "professor"
    assert res.position == "Professor"


def test_position_selection_associate_and_assistant():
    db = MagicMock()
    created_rows = []

    def mock_add(row):
        row.id = 102
        created_rows.append(row)

    db.add.side_effect = mock_add
    db.refresh.side_effect = lambda row: None

    payload_assoc = {
        "faculty_id": "5",
        "ef_id": "2",
        "academic_year": "2026-2027",
        "faculty_position": "associate_professor",
        "position": "Associate Professor",
        "status": "draft",
        "modules": {},
    }

    with patch("app.crud.SessionLocal", return_value=db):
        res_assoc = create_evaluation(payload_assoc)

    assert res_assoc.faculty_position == "associate_professor"
    assert res_assoc.position == "Associate Professor"

    payload_asst = {
        "faculty_id": "5",
        "ef_id": "2",
        "academic_year": "2026-2027",
        "faculty_position": "assistant_professor",
        "position": "Assistant Professor",
        "status": "draft",
        "modules": {},
    }

    with patch("app.crud.SessionLocal", return_value=db):
        res_asst = create_evaluation(payload_asst)

    assert res_asst.faculty_position == "assistant_professor"
    assert res_asst.position == "Assistant Professor"


def test_part_a_b_c_extensible_containers_stored():
    db = MagicMock()
    created_rows = []

    def mock_add(row):
        row.id = 103
        created_rows.append(row)

    db.add.side_effect = mock_add
    db.refresh.side_effect = lambda row: None

    param_a = EvaluationParameter(
        parameter_name="TLP Parameter 1",
        max_points=20.0,
        entered_value="Sample value",
        verification_status="pending",
    )

    payload = {
        "faculty_id": "5",
        "ef_id": "2",
        "academic_year": "2026-2027",
        "faculty_position": "professor",
        "position": "Professor",
        "part_a": {"parameters": [param_a.model_dump()]},
        "part_b": {"parameters": []},
        "part_c": {"parameters": []},
        "status": "draft",
        "modules": {},
    }

    with patch("app.crud.SessionLocal", return_value=db):
        res = create_evaluation(payload)

    row = created_rows[0]
    assert "part_a" in row.modules
    assert len(row.modules["part_a"]["parameters"]) == 1
    assert row.modules["part_a"]["parameters"][0]["parameter_name"] == "TLP Parameter 1"
    assert res.part_a.parameters[0].parameter_name == "TLP Parameter 1"


def test_existing_research_scoring_preserved_in_evaluation_shell():
    db = MagicMock()
    created_rows = []

    def mock_add(row):
        row.id = 104
        created_rows.append(row)

    db.add.side_effect = mock_add
    db.refresh.side_effect = lambda row: None

    # Journal with verified title & crossref and accepted declaration
    journal_data = JournalIndexData(
        title="Verified Journal Paper",
        value="Verified Journal Paper",
        scopus_link="https://doi.org/10.1234/sample",
        declaration_accepted=True,
        verification={
            "publication_found": True,
            "author_match": True,
            "scopus_status": "indexed",
        },
    )

    # Patent with verified inventor match
    patent_data = IPRData(
        entries=[
            IPREntry(
                type="patent",
                patent_number="IN123456",
                verification_status="verified",
                patent_found=True,
                inventor_match=True,
                association_type="inventor",
            )
        ]
    )

    payload = {
        "faculty_id": "5",
        "ef_id": "2",
        "academic_year": "2026-2027",
        "faculty_position": "professor",
        "position": "Professor",
        "status": "draft",
        "modules": {
            "journal_index": journal_data.model_dump(),
            "ipr": patent_data.model_dump(),
        },
    }

    with patch("app.crud.SessionLocal", return_value=db):
        res = create_evaluation(payload)

    row = created_rows[0]
    # Journal = 30 points, Patent (verified inventor) = 5 points -> Total = 35
    assert row.modules["journal_index"]["points"] == 30
    assert row.modules["ipr"]["points"] == 5
    assert row.total_points == 35
    assert res.total_points == 35
