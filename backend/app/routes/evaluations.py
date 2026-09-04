from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends

from app.crud import (
    create_evaluation,
    get_evaluation,
    get_faculty,
    update_evaluation,
    list_evaluations_all,
    list_faculty,
    delete_evaluation,
    get_evaluation_by_faculty_and_year,
)

from app.deps import get_current_user, require_role
from fastapi.responses import FileResponse
from app.models import Evaluation, EvaluationModules, User
from app.pdf_generator import generate_evaluation_pdf

router = APIRouter()

SCOPUS_PREFIX = "https://www.scopus.com/"


def _has_text(v: str | None) -> bool:
    return bool(v and v.strip())


def _is_scopus(url: str | None) -> bool:
    return bool(url) and url.startswith(SCOPUS_PREFIX)


def _is_file_proof(url: str | None) -> bool:
    # For file proofs we store either "/uploads/..." or an S3 http(s) URL.
    return bool(url) and isinstance(url, str) and url.strip() != "" and not _is_scopus(url.strip())


def _validate_modules_for_submit(modules: EvaluationModules) -> None:
    missing: list[str] = []

    # Scopus required only for: Journal Index, Conference Articles, Book Chapters
    if _has_text(getattr(modules.journal_index, "title", "")) or _has_text(getattr(modules.journal_index, "value", "")):
        if not _is_scopus(getattr(modules.journal_index, "scopus_link", "")):
            missing.append("Journal Index requires a valid Scopus link.")

    for e in modules.conference_articles.entries:
        if _has_text(e.title):
            if not _is_scopus(e.proof_file):
                missing.append("Conference Articles require Scopus links for filled titles.")
                break

    for e in modules.book_chapters.entries:
        if _has_text(e.title):
            if not _is_scopus(e.proof_file):
                missing.append("Book Chapters require Scopus links for filled titles.")
                break

    # All other metrics require file upload if entry is filled
    for e in modules.books.entries:
        if _has_text(e.title):
            if not _is_file_proof(e.proof_file):
                missing.append("Books require file proof for filled titles.")
                break

    for e in modules.ipr.entries:
        if _has_text(e.description):
            if not _is_file_proof(e.proof_file):
                missing.append("IPR requires file proof for filled entries.")
                break

    for e in modules.funded_projects.entries:
        if _has_text(e.description) or (e.amount_lakhs and e.amount_lakhs > 0):
            if not _is_file_proof(e.proof_file):
                missing.append("Funded Projects require file proof for filled entries.")
                break

    for e in modules.fdp_attended.entries:
        if _has_text(e.name) or (e.days and e.days > 0):
            if not _is_file_proof(e.proof_file):
                missing.append("FDP/Workshops Attended require file proof for filled entries.")
                break

    for e in modules.talks_delivered.entries:
        if _has_text(e.title):
            if not _is_file_proof(e.proof_file):
                missing.append("Talks Delivered require file proof for filled titles.")
                break

    for e in modules.departmental_activities.entries:
        if _has_text(e.description):
            if not _is_file_proof(e.proof_file):
                missing.append("Departmental Activities require file proof for filled entries.")
                break

    for e in modules.institutional_activities.entries:
        if _has_text(e.description):
            if not _is_file_proof(e.proof_file):
                missing.append("Institutional Activities require file proof for filled entries.")
                break

    for e in modules.fdp_organized.entries:
        if _has_text(e.name) or (e.days and e.days > 0):
            if not _is_file_proof(e.proof_file):
                missing.append("FDP/Events Organized require file proof for filled entries.")
                break

    if missing:
        raise HTTPException(status_code=400, detail="; ".join(missing))


@router.get("")
def list_evaluations(user: User = Depends(get_current_user)):
    # Backward-compatible: hod sees all; faculty sees mine.
    evs = list_evaluations_all()
    if user.role == "hod":
        return evs
    if user.role == "faculty":
        return [e for e in evs if e.ef_id == user.id]
    return evs


@router.get("/pending")
def list_pending(_: User = Depends(require_role("hod"))):
    return [e for e in list_evaluations_all() if e.status == "pending"]


@router.get("/approved")
def list_approved(_: User = Depends(require_role("hod"))):
    return [e for e in list_evaluations_all() if e.status == "approved"]

@router.get("/rejected", response_model=list[Evaluation])
def list_rejected(_: User = Depends(require_role("hod"))):
    return [
        e
        for e in list_evaluations_all()
        if e.status == "rejected"
    ]


@router.get("/mine")
def list_my_evaluations(user: User = Depends(require_role("faculty"))):

    faculty = next(
        (
            f for f in list_faculty()
            if str(f.user_id) == str(user.id)
        ),
        None
    )

    if not faculty:
        return []

    return [
        e for e in list_evaluations_all()
        if str(e.faculty_id) == str(faculty.id)
    ]


@router.get("/all")
def list_all_evaluations(_: User = Depends(require_role("hod"))):
    return list_evaluations_all()


@router.get("/{eid}")
def get_eval(eid: str, user: User = Depends(get_current_user)):
    print("========== GET_EVAL HIT ==========")
    ev = get_evaluation(eid)

    print("USER ID =", user.id)
    print("USER ROLE =", user.role)

    if ev:
        print("EV EF_ID =", ev.ef_id)
        print("EV FACULTY_ID =", ev.faculty_id)

    if not ev:
        raise HTTPException(404, "Evaluation not found")
    
    if user.role == "faculty" and int(ev.ef_id) != int(user.id):
        raise HTTPException(403, "Access denied")
    
    return ev

@router.post("", response_model=Evaluation)
def create_eval(body: dict, user: User = Depends(require_role("faculty"))):
    mod = body.get("modules") or {}
    body["modules"] = mod
    body["ef_id"] = user.id
    body["status"] = "pending"

    existing = get_evaluation_by_faculty_and_year(
        int(body["faculty_id"]),
        body["academic_year"],
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Evaluation already exists for this academic year.",
        )

    return create_evaluation(body)


@router.put("/{eid}")
def update_eval(eid: str, body: dict, user: User = Depends(require_role("faculty"))):
    existing = get_evaluation(eid)
    if not existing:
        raise HTTPException(404, "Evaluation not found")
    if existing.ef_id != user.id:
        raise HTTPException(403, "Access denied")
    if existing.status != "draft":
        raise HTTPException(400, "Only draft evaluations can be edited")
    ev = update_evaluation(eid, body)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    return ev


@router.post("/{eid}/submit")
def submit_eval(eid: str, user: User = Depends(require_role("faculty"))):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if ev.ef_id != user.id:
        raise HTTPException(403, "Access denied")
    if ev.status != "draft":
        raise HTTPException(400, "Only draft evaluations can be submitted")

    _validate_modules_for_submit(ev.modules)
    update_evaluation(eid, {"status": "pending"})
    return {"status": "pending"}


@router.post("/{eid}/approve")
def hod_approve(eid: str, user: User = Depends(require_role("hod"))):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Invalid evaluation ID")
    if ev.status == "approved":
        raise HTTPException(409, "This evaluation was already approved.")
    if ev.status != "pending":
        raise HTTPException(400, "Evaluation is not pending approval")

    # Validate proofs again server-side before approving
    _validate_modules_for_submit(ev.modules)
    update_evaluation(
        eid,
        {
            "status": "approved",
            "approved_at": datetime.utcnow().isoformat(),
            "approved_by": user.id,
        },
    )
    return {"status": "approved"}


@router.post("/{eid}/reject")
def hod_reject(eid: str, body: dict, user: User = Depends(require_role("hod"))):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Invalid evaluation ID")
    if ev.status == "approved":
        raise HTTPException(409, "This evaluation was already approved.")
    if ev.status != "pending":
        raise HTTPException(400, "Evaluation is not pending approval")
    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Reject reason is required")
    update_evaluation(
        eid,
        {
            "status": "rejected",
            "approved_at": datetime.utcnow().isoformat(),
            "approved_by": user.id,
            "reject_reason": reason,
        },
    )
    return {"status": "rejected"}

@router.get("/{eid}/pdf")
def generate_pdf(eid: str):

    ev = get_evaluation(eid)

    if not ev:
        raise HTTPException(404, "Evaluation not found")

    faculty = get_faculty(ev.faculty_id)

    print("FACULTY =", faculty)
    print("FACULTY NAME =", faculty.employee_name if faculty else None)

    filename = f"evaluation_{eid}.pdf"

    generate_evaluation_pdf(
        filename,
        ev,
        faculty
    )

    return FileResponse(
        filename,
        media_type="application/pdf",
        filename=filename
    )

@router.delete("/{eid}")
def delete_eval(eid: str, _: User = Depends(require_role("hod"))):
    success = delete_evaluation(eid)

    if not success:
        raise HTTPException(404, "Evaluation not found")

    return {"message": "Evaluation deleted successfully"}

@router.post("/{eid}/reject")
def hod_reject(
    eid: str,
    body: dict,
    user: User = Depends(require_role("hod")),
):
    ev = get_evaluation(eid)

    if not ev:
        raise HTTPException(404, "Invalid evaluation ID")

    if ev.status == "approved":
        raise HTTPException(400, "Approved evaluations cannot be rejected")

    if ev.status == "rejected":
        raise HTTPException(409, "Evaluation is already rejected")

    if ev.status != "pending":
        raise HTTPException(400, "Only pending evaluations can be rejected")

    reason = body.get("reason", "").strip()

    if not reason:
        raise HTTPException(400, "Rejection reason is required")

    update_evaluation(
        eid,
        {
            "status": "rejected",
            "reject_reason": reason,
        },
    )

    return {"status": "rejected"}