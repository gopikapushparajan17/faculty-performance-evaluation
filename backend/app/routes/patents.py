from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from app.crud import get_user_by_id
from app.deps import get_current_user
from app.models import User
from app.patent_verifier import (
    extract_patent_identifier_from_url,
    is_safe_patent_url,
    normalize_patent_identifier,
    verify_patent,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class PatentVerifyRequest(BaseModel):
    patent_number: Optional[str] = None
    patent_link: Optional[str] = None
    faculty_id: Optional[str] = None
    faculty_name: Optional[str] = None

    @field_validator("patent_number", "patent_link", "faculty_id", "faculty_name")
    @classmethod
    def strip_optional_values(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


@router.post("/verify")
def verify_patent_route(
    body: PatentVerifyRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Verify patent existence and verify faculty member association
    (distinguishing inventor match, applicant/holder match, no faculty match,
    patent not found, or unable to verify).
    """
    if current_user.role not in ("faculty", "hod", "principal"):
        raise HTTPException(status_code=403, detail="Unauthorized role")

    # At least one must be provided
    if not body.patent_number and not body.patent_link:
        raise HTTPException(
            status_code=422,
            detail="Provide at least a patent number or a patent URL.",
        )

    # Determine faculty name to check association
    if current_user.role == "faculty":
        faculty_name = current_user.name
    else:
        # HOD or Principal can specify faculty_id or faculty_name
        if body.faculty_id:
            target_user = get_user_by_id(body.faculty_id)
            faculty_name = target_user.name if target_user else (body.faculty_name or current_user.name)
        elif body.faculty_name:
            faculty_name = body.faculty_name
        else:
            faculty_name = current_user.name

    # Validate inputs and SSRF protection
    if body.patent_link:
        if not is_safe_patent_url(body.patent_link):
            raise HTTPException(
                status_code=422,
                detail="Invalid patent URL or unsupported patent provider domain.",
            )
        extracted = extract_patent_identifier_from_url(body.patent_link)
        if not extracted:
            raise HTTPException(
                status_code=422,
                detail="Could not extract a valid patent identifier from the URL.",
            )

    if body.patent_number:
        p_num = body.patent_number
        if p_num.lower().startswith(("http://", "https://")):
            if not is_safe_patent_url(p_num):
                raise HTTPException(
                    status_code=422,
                    detail="Invalid patent URL or unsupported patent provider domain.",
                )
            extracted = extract_patent_identifier_from_url(p_num)
            if not extracted:
                raise HTTPException(
                    status_code=422,
                    detail="Could not extract a valid patent identifier from the URL.",
                )
        else:
            normalized = normalize_patent_identifier(p_num)
            if not normalized:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid patent number or application number format.",
                )

    try:
        result = verify_patent(
            patent_number=body.patent_number,
            patent_link=body.patent_link,
            faculty_name=faculty_name,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except HTTPException:
        raise
    except Exception:
        logger.exception("Unexpected error occurred during patent verification")
        raise HTTPException(
            status_code=500,
            detail="Internal server error occurred during patent verification.",
        )
