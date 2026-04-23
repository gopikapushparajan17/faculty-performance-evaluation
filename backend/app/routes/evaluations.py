from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends

from app.database import (
    create_evaluation,
    get_evaluation,
    update_evaluation,
    list_evaluations_all,
)
from app.deps import get_current_user, require_role
from app.models import Evaluation, EvaluationModules, User

router = APIRouter()

SCOPUS_PREFIX = "https://www.scopus.com/"


def _has_text(v: str | None) -> bool:
    return bool(v and v.strip())


def _is_scopus(url: str | None) -> bool:
    return bool(url) and url.startswith(SCOPUS_PREFIX)


def _is_file_proof(url: str | None) -> bool:
    return bool(url) and isinstance(url, str) and url.strip() != "" and not _is_scopus(url.strip())


def _validate_modules_for_submit(modules: EvaluationModules) -> None:
    missing: list[str] = []

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


# ── List endpoints ─────────────────────────────────────────────────────────────

@router.get("")
def list_evaluations(user: User = Depends(get_current_user)):
    evs = list_evaluations_all()
    if user.role == "faculty":
        return [e for e in evs if e.ef_id == user.id]
    return evs


@router.get("/pending")
def list_pending(_: User = Depends(require_role("hod"))):
    """HOD sees evaluations approved by faculty, waiting for HOD review."""
    return [e for e in list_evaluations_all() if e.status == "faculty_approved"]


@router.get("/approved")
def list_hod_approved(_: User = Depends(require_role("hod"))):
    """HOD sees evaluations they have already approved (forwarded to principal)."""
    return [e for e in list_evaluations_all() if e.status in ("hod_approved", "principal_approved")]


@router.get("/hod-pending")
def list_hod_pending_for_principal(_: User = Depends(require_role("principal"))):
    """Principal sees evaluations approved by HOD, waiting for principal review."""
    return [e for e in list_evaluations_all() if e.status == "hod_approved"]


@router.get("/fully-approved")
def list_fully_approved(_: User = Depends(require_role("principal"))):
    """Principal sees fully approved evaluations."""
    return [e for e in list_evaluations_all() if e.status == "principal_approved"]


@router.get("/mine")
def list_my_evaluations(user: User = Depends(require_role("faculty"))):
    return [e for e in list_evaluations_all() if e.ef_id == user.id]


@router.get("/all")
def list_all_evaluations(_: User = Depends(require_role("hod", "principal"))):
    return list_evaluations_all()


@router.get("/{eid}")
def get_eval(eid: str, user: User = Depends(get_current_user)):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if user.role == "faculty" and ev.ef_id != user.id:
        raise HTTPException(403, "Access denied")
    return ev


# ── Create / update ────────────────────────────────────────────────────────────

@router.post("", response_model=Evaluation)
def create_eval(body: dict, user: User = Depends(require_role("faculty"))):
    body["modules"] = body.get("modules") or {}
    body["ef_id"] = user.id
    body["status"] = "draft"
    return create_evaluation(body)


@router.put("/{eid}")
def update_eval(eid: str, body: dict, user: User = Depends(require_role("faculty"))):
    existing = get_evaluation(eid)
    if not existing:
        raise HTTPException(404, "Evaluation not found")
    if existing.ef_id != user.id:
        raise HTTPException(403, "Access denied")
    if existing.status == "principal_approved":
        raise HTTPException(400, "Fully approved evaluations cannot be modified")
    if existing.status != "draft":
        raise HTTPException(400, "Only draft evaluations can be edited")
    ev = update_evaluation(eid, body)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    return ev


# ── Approve (multi-role) ───────────────────────────────────────────────────────

@router.post("/{eid}/approve")
def approve_eval(eid: str, body: dict, user: User = Depends(get_current_user)):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    signature = str(body.get("signature") or user.name or "").strip()
    signature_image = str(body.get("signature_image") or "").strip()
    now = datetime.utcnow().isoformat()

    def _approval_entry():
        entry: dict = {"name": signature or user.name, "signed_at": now}
        if signature_image:
            entry["image"] = signature_image
        return entry

    if user.role == "faculty":
        if ev.ef_id != user.id:
            raise HTTPException(403, "Access denied")
        if ev.status != "draft":
            raise HTTPException(400, "Only draft evaluations can be approved by faculty")
        if not (ev.pdf_viewed_by or {}).get("faculty"):
            raise HTTPException(400, "You must generate and view the PDF before approving.")
        _validate_modules_for_submit(ev.modules)
        approvals = dict(ev.approvals or {})
        approvals["faculty"] = _approval_entry()
        update_evaluation(eid, {
            "status": "faculty_approved",
            "approvals": approvals,
            "faculty_signature": signature,
        })
        return {"status": "faculty_approved"}

    elif user.role == "hod":
        if ev.status != "faculty_approved":
            raise HTTPException(400, "Evaluation has not been approved by faculty yet")
        if not (ev.pdf_viewed_by or {}).get("hod"):
            raise HTTPException(400, "You must generate and view the PDF before approving.")
        if not signature_image:
            raise HTTPException(400, "A drawn signature is required for HOD approval.")
        approvals = dict(ev.approvals or {})
        approvals["hod"] = _approval_entry()
        update_evaluation(eid, {
            "status": "hod_approved",
            "approvals": approvals,
            "approved_at": now,
            "approved_by": user.id,
            "hod_signature": signature,
        })
        return {"status": "hod_approved"}

    elif user.role == "principal":
        if ev.status != "hod_approved":
            raise HTTPException(400, "Evaluation has not been approved by HOD yet")
        if not (ev.pdf_viewed_by or {}).get("principal"):
            raise HTTPException(400, "You must generate and view the PDF before approving.")
        if not signature_image:
            raise HTTPException(400, "A drawn signature is required for Principal approval.")
        approvals = dict(ev.approvals or {})
        approvals["principal"] = _approval_entry()
        update_evaluation(eid, {
            "status": "principal_approved",
            "approvals": approvals,
            "principal_signature": signature,
        })
        return {"status": "principal_approved"}

    else:
        raise HTTPException(403, "Access denied")


# ── Reject (HOD or Principal) ──────────────────────────────────────────────────

@router.post("/{eid}/reject")
def reject_eval(eid: str, body: dict, user: User = Depends(get_current_user)):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    reason = str(body.get("reason") or "").strip()
    if not reason:
        raise HTTPException(400, "Reject reason is required")

    if user.role == "hod":
        if ev.status != "faculty_approved":
            raise HTTPException(400, "Can only reject faculty-approved evaluations")
    elif user.role == "principal":
        if ev.status != "hod_approved":
            raise HTTPException(400, "Can only reject HOD-approved evaluations")
    else:
        raise HTTPException(403, "Access denied")

    update_evaluation(eid, {
        "status": "rejected",
        "reject_reason": reason,
        "approved_at": datetime.utcnow().isoformat(),
        "approved_by": user.id,
    })
    return {"status": "rejected"}
