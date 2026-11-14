import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

from app.database import (
    _compute_module_points,
    _compute_total_points,
    compute_category_scores,
    CATEGORY_MAXIMUMS,
    ELIGIBILITY_PERCENTAGE,
)
from app.models import (
    EvaluationModules,
    StudentFeedbackData,
    MOOCCoursesData,
    MOOCCourseEntry,
    DeptActivitiesData,
    DeptActivityEntry,
    InstActivitiesData,
    InstActivityEntry,
    JournalIndexData,
    ConferenceArticlesData,
    ConferenceArticle,
    BookChaptersData,
    BookChapter,
    BooksData,
    BookEntry,
    IPRData,
    IPREntry,
    FundedProjectsData,
    FundedProjectEntry,
    PhDAwardedData,
    PhDAwardedEntry,
    FDPOrganizedData,
    FDPOrganizedEntry,
    TalksData,
    TalkEntry,
    MOUSignedData,
    MOUEntry,
    HODDeanRoleData,
    IndustrialVisitsData,
    IndustrialVisitEntry,
)
from app.routes.evaluations import _validate_modules_for_submit
from app.crud import normalize_doi, normalize_title, check_journal_duplicate


# ============================================================================
# 1. POSITION CATEGORY MAXIMUMS AND 65% ELIGIBILITY THRESHOLDS
# ============================================================================
def test_position_category_maximums_and_thresholds():
    assert CATEGORY_MAXIMUMS["professor"] == {"tlp": 20, "research": 60, "others": 20}
    assert CATEGORY_MAXIMUMS["associate_professor"] == {"tlp": 30, "research": 50, "others": 20}
    assert CATEGORY_MAXIMUMS["assistant_professor"] == {"tlp": 40, "research": 40, "others": 20}
    assert ELIGIBILITY_PERCENTAGE == 0.65

    # Professor thresholds: TLP = 13 (65% of 20), Research = 39 (65% of 60)
    prof = compute_category_scores(13, 39, 10, "professor")
    assert prof["tlp"]["score"] == 13
    assert prof["tlp"]["threshold"] == 13.0
    assert prof["tlp"]["eligible"] is True
    assert prof["research"]["score"] == 39
    assert prof["research"]["threshold"] == 39.0
    assert prof["research"]["eligible"] is True
    assert prof["others"]["eligible"] is True
    assert prof["overall_eligible"] is True

    # Associate Professor: TLP = 19.5 (65% of 30), Research = 32.5 (65% of 50)
    assoc = compute_category_scores(19, 32.5, 0, "associate_professor")
    assert assoc["tlp"]["eligible"] is False  # 19 < 19.5
    assert assoc["research"]["eligible"] is True  # 32.5 >= 32.5
    assert assoc["overall_eligible"] is False

    # Assistant Professor: TLP = 26 (65% of 40), Research = 26 (65% of 40)
    asst = compute_category_scores(26, 25.9, 15, "assistant_professor")
    assert asst["tlp"]["eligible"] is True
    assert asst["research"]["eligible"] is False
    assert asst["overall_eligible"] is False


def test_raw_marks_never_capped_above_category_maximums():
    """
    User example: Associate Professor scoring TLP 45, Research 65, Others 18
    must display exactly those values. TLP and Research are eligible.
    """
    scores = compute_category_scores(45, 65, 18, "associate_professor")
    assert scores["tlp"]["score"] == 45
    assert scores["tlp"]["max"] == 30
    assert scores["tlp"]["eligible"] is True
    assert scores["research"]["score"] == 65
    assert scores["research"]["max"] == 50
    assert scores["research"]["eligible"] is True
    assert scores["others"]["score"] == 18
    assert scores["overall_eligible"] is True
    assert scores["total_score"] == 128


# ============================================================================
# 2. PHASE 1 — TLP SCORING & ENTRY LIMITS
# ============================================================================
def test_tlp_student_feedback_scoring():
    # 80-100% = 30
    m1 = EvaluationModules(student_feedback=StudentFeedbackData(percentage="80"))
    assert _compute_module_points(m1)["student_feedback"] == 30

    m2 = EvaluationModules(student_feedback=StudentFeedbackData(percentage="95"))
    assert _compute_module_points(m2)["student_feedback"] == 30

    # 60 to below 80% = 20
    m3 = EvaluationModules(student_feedback=StudentFeedbackData(percentage="60"))
    assert _compute_module_points(m3)["student_feedback"] == 20

    m4 = EvaluationModules(student_feedback=StudentFeedbackData(percentage="79"))
    assert _compute_module_points(m4)["student_feedback"] == 20

    # below 60% = 0
    m5 = EvaluationModules(student_feedback=StudentFeedbackData(percentage="59"))
    assert _compute_module_points(m5)["student_feedback"] == 0


def test_tlp_mooc_courses_scoring():
    # 5 each, max 2
    entries = [
        MOOCCourseEntry(title=f"Course {i}", proof_file=f"/uploads/c{i}.pdf")
        for i in range(3)
    ]
    m = EvaluationModules(mooc_courses=MOOCCoursesData(entries=entries))
    assert _compute_module_points(m)["mooc_courses"] == 10  # Capped at 2 courses = 10 pts


def test_tlp_dept_and_inst_combined_limit_scoring():
    # Departmental = 3 each, Institutional = 5 each; combined max = 2 entries
    # 1. 2 dept, 0 inst -> 6 pts
    m1 = EvaluationModules(
        departmental_activities=DeptActivitiesData(
            entries=[
                DeptActivityEntry(description="D1", proof_file="/uploads/d1.pdf"),
                DeptActivityEntry(description="D2", proof_file="/uploads/d2.pdf"),
            ]
        )
    )
    p1 = _compute_module_points(m1)
    assert p1["departmental_activities"] == 6
    assert p1["institutional_activities"] == 0

    # 2. 0 dept, 2 inst -> 10 pts
    m2 = EvaluationModules(
        institutional_activities=InstActivitiesData(
            entries=[
                InstActivityEntry(description="I1", proof_file="/uploads/i1.pdf"),
                InstActivityEntry(description="I2", proof_file="/uploads/i2.pdf"),
            ]
        )
    )
    p2 = _compute_module_points(m2)
    assert p2["departmental_activities"] == 0
    assert p2["institutional_activities"] == 10

    # 3. 1 dept, 1 inst -> 8 pts
    m3 = EvaluationModules(
        departmental_activities=DeptActivitiesData(
            entries=[DeptActivityEntry(description="D1", proof_file="/uploads/d1.pdf")]
        ),
        institutional_activities=InstActivitiesData(
            entries=[InstActivityEntry(description="I1", proof_file="/uploads/i1.pdf")]
        ),
    )
    p3 = _compute_module_points(m3)
    assert p3["departmental_activities"] == 3
    assert p3["institutional_activities"] == 5


def test_tlp_combined_limit_validation_blocks_exceeding():
    # 2 dept + 1 inst = 3 entries -> fails submit validation
    m = EvaluationModules(
        departmental_activities=DeptActivitiesData(
            entries=[
                DeptActivityEntry(description="D1", proof_file="/uploads/d1.pdf"),
                DeptActivityEntry(description="D2", proof_file="/uploads/d2.pdf"),
            ]
        ),
        institutional_activities=InstActivitiesData(
            entries=[
                InstActivityEntry(description="I1", proof_file="/uploads/i1.pdf"),
            ]
        ),
    )
    with pytest.raises(HTTPException) as exc:
        _validate_modules_for_submit(m)
    assert "combined maximum of 2 entries" in exc.value.detail.lower()


# ============================================================================
# 3. PHASE 2 — RESEARCH SCORING & VALIDATIONS
# ============================================================================
def test_research_journal_index_scoring():
    # 30 marks per verified paper
    m = EvaluationModules(
        journal_index=JournalIndexData(
            title="Verified Paper",
            doi="10.1016/j.comp.2024.101",
            scopus_link="https://doi.org/10.1016/j.comp.2024.101",
            declaration_accepted=True,
            verification={"publication_found": True, "author_match": True, "scopus_status": "indexed"},
        )
    )
    assert _compute_module_points(m)["journal_index"] == 30


def test_research_journal_declaration_required():
    m = EvaluationModules(
        journal_index=JournalIndexData(
            title="Paper without declaration",
            doi="10.1016/j.comp.2024.102",
            declaration_accepted=False,
            verification={"publication_found": True, "author_match": True, "scopus_status": "indexed"},
        )
    )
    with pytest.raises(HTTPException) as exc:
        _validate_modules_for_submit(m)
    assert "mandatory declaration" in exc.value.detail.lower()


def test_research_doi_normalization_and_duplicate_check():
    assert normalize_doi("https://doi.org/10.1016/j.jss.2023.100") == "10.1016/j.jss.2023.100"
    assert normalize_doi("doi: 10.1016/j.jss.2023.100 ") == "10.1016/j.jss.2023.100"
    assert normalize_title("Deep Learning in 2026: A Survey!") == "deep learning in 2026 a survey"

    # Mock DB query to verify duplicate detection returns submitting faculty info
    existing_eval = MagicMock()
    existing_eval.faculty_id = 99
    existing_eval.id = 501
    existing_eval.modules = {
        "journal_index": {
            "title": "Quantum Computing Principles",
            "doi": "10.1109/TQC.2024.12345",
        }
    }

    mock_user = MagicMock()
    mock_user.name = "Dr. Alice Smith"
    mock_user.employee_id = "EMP099"

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [existing_eval]
    db.query.return_value.filter.return_value.first.return_value = mock_user

    # Same faculty should not be flagged as external duplicate
    dup_self = check_journal_duplicate(
        db, faculty_id=99, doi="10.1109/TQC.2024.12345", title="Quantum Computing Principles"
    )
    assert dup_self is None

    # Different faculty submitting the same DOI must be detected
    dup_other = check_journal_duplicate(
        db, faculty_id=101, doi="https://doi.org/10.1109/TQC.2024.12345", title="Something Else"
    )
    assert dup_other is not None
    assert dup_other["faculty_name"] == "Dr. Alice Smith"
    assert dup_other["employee_id"] == "EMP099"

    # Different faculty submitting identical normalized title fallback must be detected
    dup_title = check_journal_duplicate(
        db, faculty_id=101, doi=None, title="quantum computing principles!"
    )
    assert dup_title is not None
    assert dup_title["employee_id"] == "EMP099"


def test_research_funded_projects_scoring():
    # >5L = 30; 2-5L = 5; <2L = 0
    entries = [
        FundedProjectEntry(amount_lakhs=6.5, description="Large Grant", proof_file="/uploads/f1.pdf"),
        FundedProjectEntry(amount_lakhs=3.0, description="Medium Grant", proof_file="/uploads/f2.pdf"),
        FundedProjectEntry(amount_lakhs=1.5, description="Small Grant", proof_file="/uploads/f3.pdf"),
    ]
    m = EvaluationModules(funded_projects=FundedProjectsData(entries=entries))
    assert _compute_module_points(m)["funded_projects"] == 35  # 30 + 5 + 0


def test_research_phd_awarded_scoring():
    # 5 pts per student
    entries = [
        PhDAwardedEntry(student_name="Student 1", thesis_title="AI in Healthcare", proof_file="/uploads/s1.pdf"),
        PhDAwardedEntry(student_name="Student 2", thesis_title="Robotics", proof_file="/uploads/s2.pdf"),
        PhDAwardedEntry(student_name="Student 3", thesis_title="Networks", proof_file="/uploads/s3.pdf"),
    ]
    m = EvaluationModules(phd_awarded=PhDAwardedData(entries=entries))
    assert _compute_module_points(m)["phd_awarded"] == 15


# ============================================================================
# 4. PHASE 3 — OTHERS SCORING & VALIDATIONS
# ============================================================================
def test_others_scoring_parameters():
    # 1. FDP Organized: 5d = 5, 3-4d = 4, 1-2d = 3
    fdp_entries = [
        FDPOrganizedEntry(name="5-Day Workshop", days=5, proof_file="/uploads/w1.pdf"),
        FDPOrganizedEntry(name="3-Day Workshop", days=3, proof_file="/uploads/w2.pdf"),
        FDPOrganizedEntry(name="1-Day Seminar", days=1, proof_file="/uploads/w3.pdf"),
    ]
    m_fdp = EvaluationModules(fdp_organized=FDPOrganizedData(entries=fdp_entries))
    assert _compute_module_points(m_fdp)["fdp_organized"] == 12  # 5 + 4 + 3

    # 2. Talks Delivered: 5 each, max 2
    talks = [TalkEntry(title=f"Talk {i}", proof_file=f"/uploads/t{i}.pdf") for i in range(3)]
    m_talks = EvaluationModules(talks_delivered=TalksData(entries=talks))
    assert _compute_module_points(m_talks)["talks_delivered"] == 10  # 2 * 5

    # 3. MOU Signed: 3 each, max 2
    mous = [MOUEntry(organization=f"Org {i}", proof_file=f"/uploads/m{i}.pdf") for i in range(3)]
    m_mou = EvaluationModules(mou_signed=MOUSignedData(entries=mous))
    assert _compute_module_points(m_mou)["mou_signed"] == 6  # 2 * 3

    # 4. Role as HOD / Dean: 2 marks with proof
    m_hod_with_proof = EvaluationModules(
        hod_dean_role=HODDeanRoleData(held_role=True, proof_file="/uploads/hod.pdf")
    )
    assert _compute_module_points(m_hod_with_proof)["hod_dean_role"] == 2

    m_hod_no_proof = EvaluationModules(
        hod_dean_role=HODDeanRoleData(held_role=True, proof_file=None)
    )
    assert _compute_module_points(m_hod_no_proof)["hod_dean_role"] == 0

    # 5. Industrial Visits: 2 each, max 2
    visits = [
        IndustrialVisitEntry(company_name=f"Company {i}", proof_file=f"/uploads/v{i}.pdf")
        for i in range(3)
    ]
    m_visits = EvaluationModules(industrial_visits=IndustrialVisitsData(entries=visits))
    assert _compute_module_points(m_visits)["industrial_visits"] == 4  # 2 * 2
