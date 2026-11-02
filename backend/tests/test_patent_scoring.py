"""
Unit and integration tests for corrected patent scoring logic and removal of
patent proof document upload requirements.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.database import (
    _compute_module_points,
    _compute_total_points,
    _is_patent_verified_and_inventor_matched,
)
from app.models import (
    EvaluationModules,
    IPRData,
    IPREntry,
    StudentFeedbackData,
)
from app.routes.evaluations import _validate_modules_for_submit


# ============================================================================
# 1. PATENT FOUND + INVENTOR MATCHED = 30 POINTS
# ============================================================================
def test_patent_found_and_inventor_matched_awards_30_points():
    """Case 1: Patent record found AND faculty matched as inventor -> 30 points."""
    entry = IPREntry(
        type="patent",
        description="Smart Faculty Evaluation System",
        patent_number="IN123456B",
        patent_link="https://patents.google.com/patent/IN123456B/en",
        verification_status="verified",
        association_type="inventor",
        inventor_match=True,
        patent_found=True,
        matched_name="Smith, John",
        proof_file=None,  # No proof file required
    )
    assert _is_patent_verified_and_inventor_matched(entry) is True

    modules = EvaluationModules(
        ipr=IPRData(entries=[entry])
    )
    points = _compute_module_points(modules)
    assert points["ipr"] == 30

    total = _compute_total_points(modules)
    assert total == 30
    assert modules.ipr.points == 30


# ============================================================================
# 2. PATENT FOUND + INVENTOR NOT MATCHED = 0 POINTS
# ============================================================================
def test_patent_found_but_inventor_not_matched_awards_0_points():
    """
    Case 2: Patent found, but faculty is applicant / holder or unmatched.
    Must receive 0 points.
    """
    # 2a: Faculty is Applicant only
    entry_applicant = IPREntry(
        type="patent",
        description="Renewable Energy Device",
        patent_number="IN654321B",
        verification_status="verified",
        association_type="applicant",
        inventor_match=False,
        patent_found=True,
        proof_file="/uploads/dummy_proof.pdf",  # Uploaded file must not grant points
    )
    assert _is_patent_verified_and_inventor_matched(entry_applicant) is False

    modules_app = EvaluationModules(ipr=IPRData(entries=[entry_applicant]))
    points_app = _compute_module_points(modules_app)
    assert points_app["ipr"] == 0

    # 2b: Faculty is Holder only
    entry_holder = IPREntry(
        type="patent",
        description="Solar Cell Array",
        patent_number="IN789101B",
        verification_status="verified",
        association_type="holder",
        inventor_match=False,
        patent_found=True,
    )
    assert _is_patent_verified_and_inventor_matched(entry_holder) is False

    modules_holder = EvaluationModules(ipr=IPRData(entries=[entry_holder]))
    assert _compute_module_points(modules_holder)["ipr"] == 0

    # 2c: Patent found in registry, but faculty association not found
    entry_unmatched = IPREntry(
        type="patent",
        description="Unrelated Innovation",
        patent_number="IN112233B",
        verification_status="not_verified",
        association_type="none",
        inventor_match=False,
        patent_found=True,
    )
    assert _is_patent_verified_and_inventor_matched(entry_unmatched) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[entry_unmatched])))["ipr"] == 0


# ============================================================================
# 3. PATENT NOT FOUND = 0 POINTS
# ============================================================================
def test_patent_not_found_awards_0_points():
    """Case 3: Patent not found in external provider -> 0 points."""
    entry = IPREntry(
        type="patent",
        description="Non-existent patent",
        patent_number="IN999999",
        verification_status="not_found",
        association_type=None,
        patent_found=False,
        inventor_match=False,
        proof_file="/uploads/some_cert.pdf",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False

    modules = EvaluationModules(ipr=IPRData(entries=[entry]))
    assert _compute_module_points(modules)["ipr"] == 0
    assert _compute_total_points(modules) == 0


# ============================================================================
# 4. PROVIDER UNAVAILABLE = 0 POINTS
# ============================================================================
def test_provider_unavailable_awards_0_points():
    """Case 4: Provider unavailable / unable to verify -> 0 points."""
    entry = IPREntry(
        type="patent",
        description="Network failure lookup",
        patent_number="IN202041012345",
        verification_status="unable_to_verify",
        association_type=None,
        proof_file="/uploads/file.pdf",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False

    modules = EvaluationModules(ipr=IPRData(entries=[entry]))
    assert _compute_module_points(modules)["ipr"] == 0


# ============================================================================
# 5. PATENT PENDING / UNVERIFIED = 0 POINTS
# ============================================================================
def test_patent_pending_verification_awards_0_points():
    """Case 5: Patent submitted into form but not yet verified -> 0 points."""
    entry = IPREntry(
        type="patent",
        description="Patent Draft Filing",
        patent_number="IN202311099999",
        patent_link="https://patents.google.com/patent/IN202311099999/en",
        verification_status=None,
        association_type=None,
        proof_file="/uploads/filed_application.pdf",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False

    modules = EvaluationModules(ipr=IPRData(entries=[entry]))
    assert _compute_module_points(modules)["ipr"] == 0
    assert _compute_total_points(modules) == 0


# ============================================================================
# 6. PATENT SUBMITTED WITHOUT PROOF DOCUMENT CAN BE SAVED / SUBMITTED
# ============================================================================
def test_patent_submitted_without_proof_document_validates_successfully():
    """Case 6: Patent without proof document passes _validate_modules_for_submit."""
    modules = EvaluationModules(
        ipr=IPRData(
            entries=[
                IPREntry(
                    type="patent",
                    description="AI for Healthcare",
                    patent_number="IN202141055555",
                    patent_link=None,
                    proof_file=None,  # No document uploaded
                    verification_status="verified",
                    association_type="inventor",
                    inventor_match=True,
                )
            ]
        )
    )

    # Must NOT raise HTTPException
    _validate_modules_for_submit(modules)


def test_patent_without_identifier_or_link_raises_validation_error():
    """Patent requires an identifier or link to be submitted."""
    modules = EvaluationModules(
        ipr=IPRData(
            entries=[
                IPREntry(
                    type="patent",
                    description="Empty patent entry",
                    patent_number=None,
                    application_number=None,
                    patent_link=None,
                    proof_file=None,
                )
            ]
        )
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_modules_for_submit(modules)
    assert "Patent entries require a patent/application number or patent link" in exc_info.value.detail


# ============================================================================
# 7. TRADEMARK AND COPYRIGHT PROOF UPLOADS STILL WORK
# ============================================================================
def test_trademark_and_copyright_proof_uploads_and_scoring():
    """Case 7: Trademark & Copyright still require file proof and award 10 pts each."""
    modules = EvaluationModules(
        ipr=IPRData(
            entries=[
                IPREntry(
                    type="copyright",
                    description="Software Architecture Handbook",
                    proof_file="/uploads/copyright_reg.pdf",
                ),
                IPREntry(
                    type="trademark",
                    description="SmartGrade Logo",
                    proof_file="/uploads/tm_cert.png",
                ),
            ]
        )
    )

    # Validation succeeds because valid file proof is present
    _validate_modules_for_submit(modules)

    # Points computation: 10 + 10 = 20 pts
    points = _compute_module_points(modules)
    assert points["ipr"] == 20
    assert _compute_total_points(modules) == 20


def test_trademark_or_copyright_without_proof_fails_submit_validation():
    """Trademark or copyright without proof file must fail submit validation."""
    modules = EvaluationModules(
        ipr=IPRData(
            entries=[
                IPREntry(
                    type="copyright",
                    description="Software Codebase",
                    proof_file=None,  # Missing proof
                )
            ]
        )
    )
    with pytest.raises(HTTPException) as exc_info:
        _validate_modules_for_submit(modules)
    assert "Copyright requires file proof" in exc_info.value.detail


# ============================================================================
# 8. TOTAL EVALUATION POINTS ARE RECALCULATED CORRECTLY (BACKEND AUTHORITATIVE)
# ============================================================================
def test_total_evaluation_points_authoritative_recalculation():
    """
    Case 9: Total evaluation points recalculate dynamically.
    Frontend points are ignored, and changing verification state immediately updates points.
    """
    verified_patent = IPREntry(
        type="patent",
        description="Smart Grid Patent",
        patent_number="IN202041012345",
        verification_status="verified",
        association_type="inventor",
        inventor_match=True,
        patent_found=True,
    )
    valid_copyright = IPREntry(
        type="copyright",
        description="Course Curriculum Work",
        proof_file="/uploads/course_cr.pdf",
    )

    modules = EvaluationModules(
        student_feedback=StudentFeedbackData(percentage="90", points=999),  # 999 fake points
        ipr=IPRData(entries=[verified_patent, valid_copyright], points=999),  # 999 fake points
    )

    # 1. Recompute authoritative points:
    # student_feedback: 90% -> 15 pts
    # verified patent: 30 pts
    # valid copyright: 10 pts
    # Total: 15 + 30 + 10 = 55 pts
    total = _compute_total_points(modules)
    assert total == 55
    assert modules.student_feedback.points == 15  # Overwritten fake points
    assert modules.ipr.points == 40               # Overwritten fake points

    # 2. Change verified patent to unmatched state:
    verified_patent.association_type = "applicant"
    verified_patent.inventor_match = False

    new_total = _compute_total_points(modules)
    # Patent points must now drop to 0. Total = 15 + 0 + 10 = 25 pts
    assert modules.ipr.points == 10
    assert new_total == 25

    # 3. Change patent verification_status to None (unverified):
    verified_patent.verification_status = None
    assert _compute_total_points(modules) == 25


# ============================================================================
# 9. STRICT ELIGIBILITY TESTS FOR THE 4 EXPLICIT CONDITIONS
# ============================================================================
def test_strict_patent_found_is_none_results_in_zero_points():
    """Condition 1: patent_found is None -> False and 0 points."""
    entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",
        patent_found=None,
        inventor_match=True,
        association_type="inventor",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[entry])))["ipr"] == 0

    # Also test dictionary form
    entry_dict = {
        "type": "patent",
        "verification_status": "verified",
        "patent_found": None,
        "inventor_match": True,
        "association_type": "inventor",
    }
    assert _is_patent_verified_and_inventor_matched(entry_dict) is False


def test_strict_inventor_match_is_none_results_in_zero_points():
    """Condition 2: inventor_match is None -> False and 0 points."""
    entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",
        patent_found=True,
        inventor_match=None,
        association_type="inventor",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[entry])))["ipr"] == 0

    entry_dict = {
        "type": "patent",
        "verification_status": "verified",
        "patent_found": True,
        "inventor_match": None,
        "association_type": "inventor",
    }
    assert _is_patent_verified_and_inventor_matched(entry_dict) is False


def test_strict_patent_found_is_false_results_in_zero_points():
    """Condition 3: patent_found is False -> False and 0 points."""
    entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",
        patent_found=False,
        inventor_match=True,
        association_type="inventor",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[entry])))["ipr"] == 0

    entry_dict = {
        "type": "patent",
        "verification_status": "verified",
        "patent_found": False,
        "inventor_match": True,
        "association_type": "inventor",
    }
    assert _is_patent_verified_and_inventor_matched(entry_dict) is False


def test_strict_inventor_match_is_false_results_in_zero_points():
    """Condition 4: inventor_match is False -> False and 0 points."""
    entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",
        patent_found=True,
        inventor_match=False,
        association_type="inventor",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[entry])))["ipr"] == 0

    entry_dict = {
        "type": "patent",
        "verification_status": "verified",
        "patent_found": True,
        "inventor_match": False,
        "association_type": "inventor",
    }
    assert _is_patent_verified_and_inventor_matched(entry_dict) is False


def test_strict_verification_status_verified_but_association_type_is_applicant():
    """Condition 5: verification_status is verified but association_type is applicant -> False and 0 points."""
    entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",
        patent_found=True,
        inventor_match=False,
        association_type="applicant",
    )
    assert _is_patent_verified_and_inventor_matched(entry) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[entry])))["ipr"] == 0

    # Even if someone erroneously set inventor_match=True while association_type="applicant"
    inconsistent_entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",
        patent_found=True,
        inventor_match=True,
        association_type="applicant",
    )
    assert _is_patent_verified_and_inventor_matched(inconsistent_entry) is False
    assert _compute_module_points(EvaluationModules(ipr=IPRData(entries=[inconsistent_entry])))["ipr"] == 0


def test_strict_all_four_conditions_explicitly_satisfied():
    """Condition 6: All four conditions are explicitly true -> True and 30 points."""
    entry = IPREntry(
        type="patent",
        patent_number="IN123456B",
        verification_status="verified",      # 1. verification_status == "verified"
        patent_found=True,                    # 2. patent_found is True
        inventor_match=True,                  # 3. inventor_match is True
        association_type="inventor",          # 4. association_type == "inventor"
    )
    assert _is_patent_verified_and_inventor_matched(entry) is True

    modules = EvaluationModules(ipr=IPRData(entries=[entry]))
    assert _compute_module_points(modules)["ipr"] == 30
    assert _compute_total_points(modules) == 30

    # Test dictionary form as well
    entry_dict = {
        "type": "patent",
        "verification_status": "verified",
        "patent_found": True,
        "inventor_match": True,
        "association_type": "inventor",
    }
    assert _is_patent_verified_and_inventor_matched(entry_dict) is True
