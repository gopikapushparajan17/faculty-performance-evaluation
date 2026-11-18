"""
Self-service user settings endpoints.

All routes operate on the *currently authenticated user* only.
No user_id is accepted from the request body or path parameters —
the authenticated identity is always taken from the JWT via get_current_user.
"""

from __future__ import annotations
from sqlalchemy import text

import logging

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import text

from app.crud import get_faculty_by_user_id
from app.deps import get_current_user
from app.models import User
from app.mysql_db import SessionLocal, engine
from app.db_models import UserDB, FacultyDB

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Ensure the display_name column exists in the users table (idempotent).
# This runs once at import time and is safe to call repeatedly.
# ---------------------------------------------------------------------------






# ---------------------------------------------------------------------------
# Password policy
# ---------------------------------------------------------------------------
_MIN_PASSWORD_LENGTH = 8


def _validate_password_policy(password: str) -> bool:
    """Return True if the password satisfies the application policy."""
    return len(password) >= _MIN_PASSWORD_LENGTH


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class ChangeNameRequest(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Name must not be empty")
        return stripped


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


# ---------------------------------------------------------------------------
# GET /api/users/me  — profile info for the settings page
# ---------------------------------------------------------------------------

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the current user's profile (never includes password hash)."""
    result = {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "department": current_user.department,
        "employee_id": None,
    }
    # For faculty, enrich with employee_id from faculty_details
    if current_user.role == "faculty":
        fp = get_faculty_by_user_id(current_user.id)
        if fp:
            result["employee_id"] = fp.employee_id
            result["department"] = fp.department_name or current_user.department
    return result


# ---------------------------------------------------------------------------
# PATCH /api/users/me/name  — change display name
# ---------------------------------------------------------------------------

@router.patch("/me/name")
def change_name(
    body: ChangeNameRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Update the authenticated user's display name.

    - For faculty:        updates faculty_details.name (authoritative name).
    - For HOD/Principal: updates users.display_name (a nullable column added
                         by the startup migration above).

    The user's ID, email/username, employee ID, role, department, and all
    evaluations are unchanged by this operation.
    """
    new_name = body.name  # already stripped and validated by Pydantic

    db = SessionLocal()
    try:
        if current_user.role == "faculty":
            # Faculty: update faculty_details.name
            faculty = db.query(FacultyDB).filter(
                FacultyDB.user_id == int(current_user.id)
            ).first()
            if not faculty:
                raise HTTPException(
                    status_code=404,
                    detail="Faculty profile not found for this account.",
                )
            faculty.name = new_name
            db.commit()
            return {"message": "Name updated successfully.", "name": new_name}

        else:
            # HOD / Principal: update users.display_name
            user_row = db.query(UserDB).filter(
                UserDB.id == int(current_user.id)
            ).first()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found.")

            # Use raw SQL to set display_name (column may not be in the ORM
            # model definition yet — we keep db_models.py untouched and use
            # a raw update to stay safe with or without the column).
            db.execute(
                text(
                    "UPDATE users SET display_name = :name WHERE id = :uid"
                ),
                {"name": new_name, "uid": int(current_user.id)},
            )
            db.commit()
            return {"message": "Name updated successfully.", "name": new_name}

    finally:
        db.close()


# ---------------------------------------------------------------------------
# POST /api/users/me/change-password
# ---------------------------------------------------------------------------

@router.post("/me/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Change the authenticated user's password.

    Security guarantees:
    - Identity is taken from the JWT (never from request body).
    - Current password is verified against the stored bcrypt hash.
    - New password must satisfy the application password policy.
    - New password confirmation must match.
    - New password is stored only as a bcrypt hash.
    - Passwords are never logged.
    """
    # 1. Confirm new passwords match BEFORE touching the database.
    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=422,
            detail="New passwords do not match.",
        )

    # 2. Validate password policy.
    if not _validate_password_policy(body.new_password):
        raise HTTPException(
            status_code=422,
            detail=(
                f"New password does not meet the password requirements. "
                f"Password must be at least {_MIN_PASSWORD_LENGTH} characters long."
            ),
        )

    db = SessionLocal()
    try:
        # 3. Load the user record (with the current password hash).
        user_row = db.query(UserDB).filter(
            UserDB.id == int(current_user.id)
        ).first()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")

        # 4. Verify the current password against the stored bcrypt hash.
        try:
            current_ok = bcrypt.checkpw(
                body.current_password.encode("utf-8"),
                user_row.password_hash.encode("utf-8"),
            )
        except Exception:
            current_ok = False

        if not current_ok:
            raise HTTPException(
                status_code=401,
                detail="Current password is incorrect.",
            )

        # 5. Hash the new password with bcrypt (same mechanism as registration).
        new_hash = bcrypt.hashpw(
            body.new_password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")

        # 6. Persist the new hash.
        user_row.password_hash = new_hash
        db.commit()

        # Note on session behavior:
        # This application uses stateless JWTs with no server-side revocation.
        # After the password change the existing JWT remains valid until it
        # expires (ACCESS_TOKEN_EXPIRE_MINUTES = 24 h by default).  The current
        # session stays alive; the user is NOT forced to re-login.  Future
        # logins will require the new password.

        return {"message": "Password changed successfully."}

    finally:
        db.close()
