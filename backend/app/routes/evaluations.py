from fastapi import APIRouter, HTTPException, Depends
from app.database import (
    create_evaluation,
    get_evaluation,
    update_evaluation,
    list_evaluations_all,
    list_evaluations_for_faculty,
)
from app.models import Evaluation, EvaluationModules

router = APIRouter()


def _get_current_user_id():
    """Placeholder: in real app decode JWT and return user id/role."""
    return "1"


@router.get("")
def list_evaluations():
    """HOD: department evaluations (all for demo)."""
    return list_evaluations_all()


@router.get("/mine")
def list_my_evaluations():
    """Faculty: own evaluations (by faculty_id linked to current user)."""
    return list_evaluations_all()  # Filter by current user's faculty_id in real app


@router.get("/all")
def list_all_evaluations():
    """Principal: all evaluations."""
    return list_evaluations_all()


@router.get("/{eid}")
def get_eval(eid: str):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    return ev


@router.post("", response_model=Evaluation)
def create_eval(body: dict):
    mod = body.get("modules") or {}
    body["modules"] = mod
    return create_evaluation(body)


@router.put("/{eid}")
def update_eval(eid: str, body: dict):
    ev = update_evaluation(eid, body)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    return ev


@router.post("/{eid}/submit")
def submit_eval(eid: str):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    ev.status = "submitted"
    return {"status": "submitted"}


@router.post("/{eid}/faculty-sign")
def faculty_sign(eid: str):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if ev.status != "submitted":
        raise HTTPException(400, "Evaluation must be submitted first")
    ev.status = "faculty_signed"
    ev.faculty_signature = "signed"
    return {"status": "faculty_signed"}


@router.post("/{eid}/hod-sign")
def hod_sign(eid: str):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if ev.status != "faculty_signed":
        raise HTTPException(400, "Faculty must sign first")
    ev.status = "hod_signed"
    ev.hod_signature = "signed"
    return {"status": "hod_signed"}


@router.post("/{eid}/approve")
def principal_approve(eid: str):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if ev.status != "hod_signed":
        raise HTTPException(400, "HOD must sign first")
    ev.status = "approved"
    ev.principal_signature = "signed"
    return {"status": "approved"}
