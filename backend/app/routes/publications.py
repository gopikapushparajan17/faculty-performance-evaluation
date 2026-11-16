from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.crud import get_user_by_id, get_faculty_by_user_id, check_journal_duplicate
from app.deps import get_current_user
from app.models import User
from app.publication_verifier import verify_publication

router = APIRouter()


class PublicationVerifyRequest(BaseModel):
    publication_url: str | None = None
    title: str | None = None
    issn: str | None = None
    eissn: str | None = None
    doi: str | None = None

    @field_validator("publication_url", "title", "issn", "eissn", "doi")
    @classmethod
    def strip_optional_values(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None




@router.post("/verify")
def verify_publication_route(
    body: PublicationVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    user = get_user_by_id(current_user.id)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Step 1: Check database for duplicate submission across faculty accounts FIRST.
    # If duplicate exists, DO NOT initiate Scopus/WoS or any external verification.
    faculty = get_faculty_by_user_id(user.id)
    faculty_id = str(faculty.id) if faculty else str(user.id)

    dup = check_journal_duplicate(
        faculty_id=faculty_id,
        user_id=user.id,
        doi=body.doi,
        publication_url=body.publication_url,
        title=body.title,
        issn=body.issn,
        eissn=body.eissn,
    )
    if dup and (dup.get("duplicate") or dup.get("is_duplicate")):
        fac_name = dup.get("faculty_name") or "another faculty member"
        emp_id = dup.get("employee_id") or "N/A"
        detail_msg = (
            f"⚠ Duplicate Publication Detected: This publication has already been submitted "
            f"for evaluation by {fac_name} (Employee ID: {emp_id}). "
            f"Duplicate submissions across faculty accounts are not permitted."
        )
        raise HTTPException(status_code=409, detail=detail_msg)

    if body.publication_url:
        return verify_publication(
            body.publication_url,
            faculty=user,
        )

    if body.title and (body.issn or body.eissn):
        return verify_publication(
            None,
            faculty=user,
            title=body.title,
            issn=body.issn,
            eissn=body.eissn,
        )

    raise HTTPException(
        status_code=422,
        detail=(
            "Provide a publication URL/DOI, or a paper title "
            "together with a journal ISSN or e-ISSN."
        ),
    )
