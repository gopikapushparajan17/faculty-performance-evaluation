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
    ConferenceOrganizedData,
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
    mock_user.id = 99
    mock_user.user_id = 99
    mock_user.name = "Dr. Alice Smith"
    mock_user.employee_id = "EMP099"

    db = MagicMock()
    db.query.return_value.all.return_value = [existing_eval]
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


def test_verify_route_blocks_duplicate_and_bypasses_external_verifier():
    from app.routes.publications import verify_publication_route, PublicationVerifyRequest
    from app.models import User

    mock_user = User(id="101", email="user101@demo.com", name="Dr. Bob", role="faculty")
    dup_data = {
        "duplicate": True,
        "faculty_name": "Dr. Alice Smith",
        "employee_id": "EMP099",
    }

    req = PublicationVerifyRequest(
        doi="10.1109/TQC.2024.12345",
        title="Quantum Computing Principles",
        publication_url="https://doi.org/10.1109/TQC.2024.12345",
    )

    with patch("app.routes.publications.get_user_by_id", return_value=mock_user), \
         patch("app.routes.publications.get_faculty_by_user_id", return_value=None), \
         patch("app.routes.publications.check_journal_duplicate", return_value=dup_data), \
         patch("app.routes.publications.verify_publication") as mock_external_verify:
        with pytest.raises(HTTPException) as exc:
            verify_publication_route(req, current_user=mock_user)

        # Must return 409 status code
        assert exc.value.status_code == 409
        # Must contain the exact required message structure
        detail = exc.value.detail
        assert "⚠ Duplicate Publication Detected:" in detail
        assert "Dr. Alice Smith" in detail
        assert "EMP099" in detail
        assert "Duplicate submissions across faculty accounts are not permitted." in detail
        # CRITICAL: External verification MUST NOT be initiated!
        assert not mock_external_verify.called


def test_declaration_checkbox_scoring_sequence():
    # 1. Publication verified, but declaration NOT accepted -> 0 marks
    m_unchecked = EvaluationModules(
        journal_index=JournalIndexData(
            title="Verified Journal",
            scopus_link="https://doi.org/10.1000/182",
            declaration_accepted=False,
            verification={"publication_found": True, "author_match": True, "scopus_status": "indexed"},
        )
    )
    assert _compute_module_points(m_unchecked)["journal_index"] == 0

    # 2. Publication verified, declaration accepted -> 30 marks
    m_checked = EvaluationModules(
        journal_index=JournalIndexData(
            title="Verified Journal",
            scopus_link="https://doi.org/10.1000/182",
            declaration_accepted=True,
            verification={"publication_found": True, "author_match": True, "scopus_status": "indexed"},
        )
    )
    assert _compute_module_points(m_checked)["journal_index"] == 30

    # 3. If faculty unchecks declaration, marks return to 0
    m_checked.journal_index.declaration_accepted = False
    assert _compute_module_points(m_checked)["journal_index"] == 0


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


def test_conferences_organized_dropdown_and_confirmation():
    # 1. General Chair + Confirmed -> 5 marks
    m_gen_confirmed = EvaluationModules(
        conference_organized=ConferenceOrganizedData(role="General Chair", confirmed=True)
    )
    assert _compute_module_points(m_gen_confirmed)["conference_organized"] == 5

    # 2. Session Chair + Confirmed -> 3 marks
    m_sess_confirmed = EvaluationModules(
        conference_organized=ConferenceOrganizedData(role="Session Chair", confirmed=True)
    )
    assert _compute_module_points(m_sess_confirmed)["conference_organized"] == 3

    # 3. Role selected but NOT confirmed -> 0 marks
    m_gen_unconfirmed = EvaluationModules(
        conference_organized=ConferenceOrganizedData(role="General Chair", confirmed=False)
    )
    assert _compute_module_points(m_gen_unconfirmed)["conference_organized"] == 0

    m_sess_unconfirmed = EvaluationModules(
        conference_organized=ConferenceOrganizedData(role="Session Chair", confirmed=False)
    )
    assert _compute_module_points(m_sess_unconfirmed)["conference_organized"] == 0

    # 4. Immediate update of Others category score
    scores_unconfirmed = compute_category_scores(m_gen_unconfirmed, "associate_professor")
    assert scores_unconfirmed["others"]["score"] == 0

    scores_confirmed = compute_category_scores(m_gen_confirmed, "associate_professor")
    assert scores_confirmed["others"]["score"] == 5

    # 5. Existing FDP/Workshop scoring remains unchanged
    m_combined = EvaluationModules(
        fdp_organized=FDPOrganizedData(
            entries=[FDPOrganizedEntry(name="Workshop", days=5, proof_file="/uploads/w.pdf")]
        ),
        conference_organized=ConferenceOrganizedData(role="General Chair", confirmed=True),
    )
    assert _compute_module_points(m_combined)["fdp_organized"] == 5
    assert _compute_module_points(m_combined)["conference_organized"] == 5
    scores_combined = compute_category_scores(m_combined, "associate_professor")
    assert scores_combined["others"]["score"] == 10  # 5 + 5


# ============================================================================
# 5. JOURNAL DUPLICATE DETECTION — EXHAUSTIVE FORMAT & CROSS-ACCOUNT TESTS
# ============================================================================
def _make_faculty(fid, uid, name, emp_id):
    f = MagicMock()
    f.id = fid
    f.user_id = uid
    f.name = name
    f.employee_id = emp_id
    return f


def _create_test_session(existing_evaluations, faculty_map):
    db = MagicMock()

    def query_se(model):
        q = MagicMock()
        model_name = str(model)
        if "Evaluation" in model_name:
            q.all.return_value = existing_evaluations
            q.filter.return_value.all.return_value = existing_evaluations
        elif "Faculty" in model_name:
            def filter_se(*args, **kwargs):
                fq = MagicMock()
                fid = None
                is_user_id = False
                if args:
                    if hasattr(args[0], "left") and getattr(args[0].left, "name", "") == "user_id":
                        is_user_id = True
                    if hasattr(args[0], "right"):
                        try:
                            fid = int(args[0].right.value)
                        except Exception:
                            pass
                if is_user_id:
                    res = next((f for f in faculty_map.values() if getattr(f, "user_id", None) == fid), None)
                else:
                    res = faculty_map.get(fid)
                fq.first.return_value = res
                return fq
            q.filter.side_effect = filter_se
            q.first.return_value = None
        return q

    db.query.side_effect = query_se
    return db


def test_duplicate_doi_number_in_one_and_url_in_another():
    """
    Test: One faculty enters DOI number (10.xxxx/xxxxx) and another faculty
    enters DOI URL (https://doi.org/10.xxxx/xxxxx) for the same publication.
    """
    fac1 = _make_faculty(1, 1, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 2, "Dr. Bob Jones", "EMP202")
    faculty_map = {1: fac1, 2: fac2}

    # Faculty 1 submitted with plain DOI number
    ev1 = MagicMock(
        id=11,
        faculty_id=1,
        ef_id=1,
        modules={
            "journal_index": {
                "title": "Quantum Error Correction",
                "doi": "10.1016/j.jss.2023.111876",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # Faculty 2 attempts to verify with full https URL
    dup = check_journal_duplicate(
        db,
        faculty_id=2,
        doi="https://doi.org/10.1016/j.jss.2023.111876",
        title="Quantum Error Correction",
    )
    assert dup is not None
    assert dup["is_duplicate"] is True
    assert dup["matched_by"] == "doi"
    assert dup["faculty_name"] == "Dr. Alice Smith"
    assert dup["employee_id"] == "EMP101"
    assert (
        dup["message"]
        == "⚠ Duplicate Publication Detected: This publication has already been submitted for evaluation by Dr. Alice Smith (Employee ID: EMP101). Duplicate submissions across faculty accounts are not permitted."
    )


def test_duplicate_different_formatting_of_same_doi():
    """
    Test: Different formatting of the same DOI across accounts:
    - http vs https
    - www vs dx.doi.org vs doi.org
    - trailing slashes and dots
    - uppercase vs lowercase
    - 'doi: 10.xxxx' prefix
    """
    fac1 = _make_faculty(1, 1, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 2, "Dr. Charlie Brown", "EMP303")
    faculty_map = {1: fac1, 2: fac2}

    ev1 = MagicMock(
        id=12,
        faculty_id=1,
        ef_id=1,
        modules={
            "journal_index": {
                "title": "Edge Intelligence",
                "doi": "http://dx.doi.org/10.1109/ACCESS.2024.1234567/",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # Variant A: doi: prefix with uppercase and trailing dot
    dup_a = check_journal_duplicate(
        db,
        faculty_id=2,
        doi="doi: 10.1109/access.2024.1234567.",
    )
    assert dup_a is not None
    assert dup_a["is_duplicate"] is True
    assert dup_a["matched_by"] == "doi"

    # Variant B: https://www.doi.org with multiple trailing slashes
    dup_b = check_journal_duplicate(
        db,
        faculty_id=2,
        doi="https://www.doi.org/10.1109/ACCESS.2024.1234567///",
    )
    assert dup_b is not None
    assert dup_b["is_duplicate"] is True

    # Variant C: DOI provided via publication_url parameter
    dup_c = check_journal_duplicate(
        db,
        faculty_id=2,
        publication_url="https://doi.org/10.1109/access.2024.1234567",
    )
    assert dup_c is not None
    assert dup_c["is_duplicate"] is True


def test_duplicate_issn_plus_title():
    """
    Test: Matching publication by title and ISSN (without DOI),
    with different ISSN formatting (hyphenated vs plain).
    """
    fac1 = _make_faculty(1, 1, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 2, "Dr. Dave Miller", "EMP404")
    faculty_map = {1: fac1, 2: fac2}

    ev1 = MagicMock(
        id=13,
        faculty_id=1,
        ef_id=1,
        modules={
            "journal_index": {
                "title": "Advanced Neural Networks for Medical Imaging",
                "issn": "0360-1315",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # Candidate has unhyphenated ISSN and exact title
    dup = check_journal_duplicate(
        db,
        faculty_id=2,
        title="Advanced Neural Networks for Medical Imaging",
        issn="03601315",
    )
    assert dup is not None
    assert dup["is_duplicate"] is True
    assert dup["matched_by"] == "title"
    assert dup["faculty_name"] == "Dr. Alice Smith"
    assert dup["employee_id"] == "EMP101"


def test_duplicate_eissn_plus_title():
    """
    Test: Matching publication by title and e-ISSN (without DOI),
    handling 'X' checksum casing and spacing.
    """
    fac1 = _make_faculty(1, 1, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 2, "Dr. Elena Rostova", "EMP505")
    faculty_map = {1: fac1, 2: fac2}

    ev1 = MagicMock(
        id=14,
        faculty_id=1,
        ef_id=1,
        modules={
            "journal_index": {
                "title": "Cloud Computing Paradigms: A Modern Review",
                "eissn": "1234-567X",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # Candidate has eISSN with spaces and lowercase 'x'
    dup = check_journal_duplicate(
        db,
        faculty_id=2,
        title="Cloud Computing Paradigms: A Modern Review",
        eissn="1234 567x",
    )
    assert dup is not None
    assert dup["is_duplicate"] is True
    assert dup["matched_by"] == "title"


def test_duplicate_same_title_with_different_formatting():
    """
    Test: Same publication title with differences in punctuation, casing,
    and multiple spaces.
    """
    fac1 = _make_faculty(1, 1, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 2, "Dr. Frank Castle", "EMP606")
    faculty_map = {1: fac1, 2: fac2}

    ev1 = MagicMock(
        id=15,
        faculty_id=1,
        ef_id=1,
        modules={
            "journal_index": {
                "title": "Machine Learning in Higher Education: A Comprehensive Study!",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # Candidate title: lowercase, dashes instead of colons, extra spaces, ending dot
    dup = check_journal_duplicate(
        db,
        faculty_id=2,
        title="machine  learning   in higher education - a comprehensive study.",
    )
    assert dup is not None
    assert dup["is_duplicate"] is True
    assert dup["matched_by"] == "title"


def test_two_different_articles_from_same_journal_not_treated_as_duplicate():
    """
    CRITICAL RULE:
    Two different articles from the same journal MUST NOT be treated as duplicates
    just because their ISSN or eISSN matches.
    """
    fac1 = _make_faculty(1, 1, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 2, "Dr. Grace Hopper", "EMP707")
    faculty_map = {1: fac1, 2: fac2}

    # Faculty 1 published Article Alpha in Journal of Systems & Software (ISSN 0164-1212)
    ev1 = MagicMock(
        id=16,
        faculty_id=1,
        ef_id=1,
        modules={
            "journal_index": {
                "title": "Article Alpha: Automated Software Testing in DevOps",
                "doi": "10.1016/j.jss.2023.111001",
                "issn": "0164-1212",
                "eissn": "1873-1228",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # Faculty 2 submits Article Beta in the SAME journal (same ISSN & eISSN),
    # but different DOI and different title
    dup_with_doi = check_journal_duplicate(
        db,
        faculty_id=2,
        doi="10.1016/j.jss.2024.112999",
        title="Article Beta: Static Analysis in Safety Critical Systems",
        issn="0164-1212",
        eissn="1873-1228",
    )
    assert dup_with_doi is None, "Different articles from the same journal must NOT be flagged as duplicates"

    # Faculty 2 submits another article in the same journal without DOI (different title)
    dup_no_doi = check_journal_duplicate(
        db,
        faculty_id=2,
        title="Article Gamma: Architectural Smells in Microservices",
        issn="0164-1212",
        eissn="1873-1228",
    )
    assert dup_no_doi is None, "Different article titles in the same journal must NOT be flagged as duplicates"


def test_duplicate_entered_in_another_faculty_account_and_own_account_allowed():
    """
    Test:
    1. Publication submitted by another faculty account IS detected.
    2. Exact warning message format is validated.
    3. The same faculty member editing or submitting their own publication is NOT blocked.
    """
    fac1 = _make_faculty(1, 10, "Dr. Alice Smith", "EMP101")
    fac2 = _make_faculty(2, 20, "Dr. Bob Jones", "EMP202")
    faculty_map = {1: fac1, 2: fac2}

    ev1 = MagicMock(
        id=17,
        faculty_id=1,
        ef_id=10,
        modules={
            "journal_index": {
                "title": "Cybersecurity in IoT Ecosystems",
                "doi": "10.1109/JIOT.2024.3334444",
            }
        },
    )
    db = _create_test_session([ev1], faculty_map)

    # 1. Other faculty (fac2) checks duplicate -> Detected
    dup_other = check_journal_duplicate(
        db,
        faculty_id=2,
        user_id=20,
        doi="10.1109/JIOT.2024.3334444",
        title="Cybersecurity in IoT Ecosystems",
    )
    assert dup_other is not None
    assert dup_other["is_duplicate"] is True
    assert dup_other["faculty_name"] == "Dr. Alice Smith"
    assert dup_other["employee_id"] == "EMP101"
    expected_msg = (
        "⚠ Duplicate Publication Detected: This publication has already been submitted "
        "for evaluation by Dr. Alice Smith (Employee ID: EMP101). "
        "Duplicate submissions across faculty accounts are not permitted."
    )
    assert dup_other["message"] == expected_msg

    # 2. Own account (fac1 by faculty_id=1) checks duplicate -> NOT flagged (allowed)
    dup_own_by_fac = check_journal_duplicate(
        db,
        faculty_id=1,
        doi="10.1109/JIOT.2024.3334444",
        title="Cybersecurity in IoT Ecosystems",
    )
    assert dup_own_by_fac is None

    # 3. Own account (fac1 by user_id=10) checks duplicate -> NOT flagged (allowed)
    dup_own_by_user = check_journal_duplicate(
        db,
        user_id=10,
        doi="10.1109/JIOT.2024.3334444",
        title="Cybersecurity in IoT Ecosystems",
    )
    assert dup_own_by_user is None

    # 4. Editing the existing evaluation (evaluation_id=17) -> NOT flagged (allowed)
    dup_same_eval = check_journal_duplicate(
        db,
        current_evaluation_id=17,
        doi="10.1109/JIOT.2024.3334444",
        title="Cybersecurity in IoT Ecosystems",
    )
    assert dup_same_eval is None



