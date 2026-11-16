from sqlalchemy import select
import secrets
from datetime import datetime, timedelta

from app.mysql_db import SessionLocal
from app.db_models import UserDB, FacultyDB, EvaluationDB, PasswordResetTokenDB
from app.models import User, FacultyProfile, Evaluation, EvaluationModules
from app.database import _compute_total_points
from sqlalchemy import Boolean


def create_password_reset_token(user_id: int, expires_minutes: int = 60, db=None) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=expires_minutes)

    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        record = PasswordResetTokenDB(
            user_id=int(user_id),
            token=token,
            created_at=datetime.utcnow(),
            expires_at=expires_at,
            used=False,
        )
        db.add(record)
        db.commit()
        return token
    finally:
        if should_close:
            db.close()


def verify_password_reset_token(token: str, db=None) -> tuple[bool, str, int | None]:
    if not token or not token.strip():
        return False, "Invalid reset token.", None

    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        record = db.query(PasswordResetTokenDB).filter(PasswordResetTokenDB.token == token.strip()).first()
        if not record:
            return False, "Invalid or unrecognized reset token.", None
        if record.used:
            return False, "This password reset link has already been used.", None
        if record.expires_at < datetime.utcnow():
            return False, "This password reset link has expired.", None
        return True, "Token is valid.", record.user_id
    finally:
        if should_close:
            db.close()


def verify_and_use_password_reset_token(token: str, new_password: str, db=None) -> tuple[bool, str]:
    if not token or not token.strip():
        return False, "Invalid reset token."
    if not new_password or len(new_password) < 6:
        return False, "Password must be at least 6 characters long."

    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        record = db.query(PasswordResetTokenDB).filter(PasswordResetTokenDB.token == token.strip()).first()
        if not record:
            return False, "Invalid or unrecognized reset token."
        if record.used:
            return False, "This password reset link has already been used."
        if record.expires_at < datetime.utcnow():
            return False, "This password reset link has expired."

        user = db.query(UserDB).filter(UserDB.id == record.user_id).first()
        if not user:
            return False, "Associated user account was not found."

        import bcrypt
        hashed = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        user.password_hash = hashed
        record.used = True
        db.commit()
        return True, "Password has been successfully reset. You can now sign in with your new password."
    finally:
        if should_close:
            db.close()


def send_password_reset_email(to_email: str, token: str) -> bool:
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from app.config import (
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USER,
        SMTP_PASSWORD,
        SMTP_FROM_EMAIL,
        SMTP_USE_TLS,
        FRONTEND_URL,
    )

    reset_link = f"{FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    subject = "Password Reset Request — Faculty Performance Evaluation System"
    body = f"""Hello,

We received a request to reset the password for your Faculty Performance Evaluation account.

To choose a new password, please click the link below:
{reset_link}

This link is time-limited and can be used only once.

If you did not request a password reset, please ignore this email. Your password will remain unchanged.

Best regards,
Faculty Evaluation System
"""

    # If SMTP credentials are not configured or host is local/empty, log safely and don't fail
    if not SMTP_USER or not SMTP_PASSWORD or SMTP_HOST in ("localhost", "127.0.0.1", ""):
        print(f"[Password Reset] Link for {to_email}: {reset_link}")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"[Password Reset] Failed sending email to {to_email}: {e}")
        return False


def get_user_by_email(email: str):
    db = SessionLocal()

    try:
        user = db.execute(
            select(UserDB).where(
                UserDB.username == email
            )
        ).scalar_one_or_none()

        if not user:
            return None

        name = user.username

        if user.role == "faculty":
            faculty = db.query(FacultyDB).filter(
                FacultyDB.user_id == user.id
            ).first()

            if faculty:
                name = faculty.name

        return User(
            id=str(user.id),
            email=user.username,
            name=name,
            role=user.role,
            department=user.department,
            password_hash=user.password_hash,
        )

    finally:
        db.close()

def get_user_by_id(user_id: str):
    db = SessionLocal()

    try:
        user = db.execute(
            select(UserDB).where(
                UserDB.id == int(user_id)
            )
        ).scalar_one_or_none()

        if not user:
            return None

        name = user.username

        if user.role == "faculty":
            faculty = db.query(FacultyDB).filter(
                FacultyDB.user_id == user.id
            ).first()

            if faculty:
                name = faculty.name

        return User(
            id=str(user.id),
            email=user.username,
            name=name,
            role=user.role,
            department=user.department,
            password_hash=user.password_hash,
        )

    finally:
        db.close()

def create_faculty(data: dict):
    db = SessionLocal()

    try:
        faculty = FacultyDB(
            user_id=int(data["user_id"]),
            dept=data["department_name"],
            emp_id=data["employee_id"],
            name=data["employee_name"],
            orcid=data.get("orcid_id", ""),
            email=data["official_email"],
            phone=data["phone_number"]
        )

        db.add(faculty)
        db.commit()
        db.refresh(faculty)

        return FacultyProfile(
            id=str(faculty.id),
            user_id=str(faculty.user_id),
            department_name=faculty.dept,
            employee_id=faculty.emp_id,
            employee_name=faculty.name,
            orcid_id=faculty.orcid or "",
            official_email=faculty.email,
            phone_number=faculty.phone,
        )

    finally:
        db.close()

def create_faculty_account(data: dict, creator_college: str) -> FacultyProfile:
    import bcrypt
    db = SessionLocal()

    try:
        pw_hash = bcrypt.hashpw(
            data["password"].encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        user = UserDB(
            username=data["email"],
            password_hash=pw_hash,
            role="faculty",
            college_name=creator_college,
            department=data["department"]
        )
        db.add(user)
        db.flush()

        faculty = FacultyDB(
            user_id=user.id,
            dept=data["department"],
            emp_id=data["employee_id"],
            name=data["name"],
            orcid=data.get("orcid", ""),
            email=data["email"],
            phone=data["phone"]
        )
        db.add(faculty)
        db.commit()
        db.refresh(faculty)

        return FacultyProfile(
            id=str(faculty.id),
            user_id=str(faculty.user_id),
            department_name=faculty.dept,
            employee_id=faculty.emp_id,
            employee_name=faculty.name,
            orcid_id=faculty.orcid or "",
            official_email=faculty.email,
            phone_number=faculty.phone,
        )

    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

def list_faculty():
    db = SessionLocal()

    try:
        faculty_list = db.query(FacultyDB).all()

        return [
            FacultyProfile(
                id=str(f.id),
                user_id=str(f.user_id),
                department_name=f.dept,
                employee_id=f.emp_id,
                employee_name=f.name,
                orcid_id=f.orcid or "",
                official_email=f.email,
                phone_number=f.phone,
            )
            for f in faculty_list
        ]

    finally:
        db.close()

def get_faculty(fid: str):
    db = SessionLocal()

    try:
        f = db.query(FacultyDB).filter(
            FacultyDB.id == int(fid)
        ).first()

        if not f:
            return None

        return FacultyProfile(
            id=str(f.id),
            user_id=str(f.user_id),
            department_name=f.dept,
            employee_id=f.emp_id,
            employee_name=f.name,
            orcid_id=f.orcid or "",
            official_email=f.email,
            phone_number=f.phone,
        )

    finally:
        db.close()

def update_faculty(fid: str, data: dict):
    db = SessionLocal()

    try:
        faculty = db.query(FacultyDB).filter(
            FacultyDB.id == int(fid)
        ).first()

        if not faculty:
            return None

        faculty.dept = data["department_name"]
        faculty.emp_id = data["employee_id"]
        faculty.name = data["employee_name"]
        faculty.orcid = data.get("orcid_id", "")
        faculty.email = data["official_email"]
        faculty.phone = data["phone_number"]

        db.commit()
        db.refresh(faculty)

        return FacultyProfile(
            id=str(faculty.id),
            user_id=str(faculty.user_id),
            department_name=faculty.dept,
            employee_id=faculty.emp_id,
            employee_name=faculty.name,
            orcid_id=faculty.orcid or "",
            official_email=faculty.email,
            phone_number=faculty.phone,
        )

    finally:
        db.close()

def create_evaluation(data: dict):
    db = SessionLocal()

    try:
        mod = data.get("modules") or {}
        modules = EvaluationModules(**mod)

        total_points = _compute_total_points(modules)

        faculty_position = data.get("faculty_position") or "associate_professor"
        position = data.get("position")
        if not position:
            position = "Professor" if faculty_position == "professor" else "Assistant Professor" if faculty_position == "assistant_professor" else "Associate Professor"

        mod_dict = modules.model_dump()
        mod_dict["faculty_position"] = faculty_position
        mod_dict["position"] = position
        if "part_a" in data and data["part_a"]:
            mod_dict["part_a"] = data["part_a"]
        if "part_b" in data and data["part_b"]:
            mod_dict["part_b"] = data["part_b"]
        if "part_c" in data and data["part_c"]:
            mod_dict["part_c"] = data["part_c"]

        evaluation = EvaluationDB(
            faculty_id=int(data["faculty_id"]),
            ef_id=int(data["ef_id"]),
            academic_year=data.get("academic_year", ""),
            status=data.get("status", "draft"),
            modules=mod_dict,
            total_points=total_points,
        )

        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)

        return Evaluation(
            id=str(evaluation.id),
            faculty_id=str(evaluation.faculty_id),
            ef_id=str(evaluation.ef_id),
            academic_year=evaluation.academic_year,
            faculty_position=faculty_position,
            position=position,
            status=evaluation.status,
            modules=modules,
            part_a=mod_dict.get("part_a"),
            part_b=mod_dict.get("part_b"),
            part_c=mod_dict.get("part_c"),
            total_points=evaluation.total_points,
        )

    finally:
        db.close()

def get_evaluation(eid: str):
    db = SessionLocal()

    try:
        e = db.query(EvaluationDB).filter(
            EvaluationDB.id == int(eid)
        ).first()

        if not e:
            return None

        faculty = get_faculty(str(e.faculty_id))

        mod_dict = dict(e.modules or {})

        # Handle legacy evaluations with null Part A/B/C data
        for part in ("part_a", "part_b", "part_c"):
            if mod_dict.get(part) is None:
                mod_dict[part] = {}

        pos = mod_dict.get("faculty_position") or "associate_professor"
        position_name = mod_dict.get("position")
        return Evaluation(
            id=str(e.id),
            faculty_id=str(e.faculty_id),
            faculty=faculty,
            ef_id=str(e.ef_id),
            academic_year=e.academic_year or "",
            faculty_position=pos,
            position=position_name,
            status=e.status or "draft",
            modules=EvaluationModules(**mod_dict),
            part_a=mod_dict.get("part_a"),
            part_b=mod_dict.get("part_b"),
            part_c=mod_dict.get("part_c"),
            total_points=e.total_points or 0,
            approved_at=e.approved_at,
            approved_by=e.approved_by,
            reject_reason=e.reject_reason,
            revision_requested=e.revision_requested,
            revision_reason=e.revision_reason,
            revision_status=e.revision_status,
            revision_feedback=e.revision_feedback,
            faculty_signature=e.faculty_signature,
            hod_signature=e.hod_signature,
            principal_signature=e.principal_signature,
        )

    finally:
        db.close()
def get_evaluation_by_faculty_and_year(faculty_id: int, academic_year: str):
    db = SessionLocal()

    try:
        return (
            db.query(EvaluationDB)
            .filter(
                EvaluationDB.faculty_id == faculty_id,
                EvaluationDB.academic_year == academic_year,
            )
            .first()
        )
    finally:
        db.close()


def list_evaluations_all():
    db = SessionLocal()

    try:
        evaluations = db.query(EvaluationDB).all()

        result = []

        for e in evaluations:
            faculty = get_faculty(str(e.faculty_id))
            modules_data = dict(e.modules or {})

            for part in ("part_a", "part_b", "part_c"):
                if modules_data.get(part) is None:
                    modules_data[part] = {}

            result.append(
                Evaluation(
                    id=str(e.id),
                    faculty_id=str(e.faculty_id),
                    faculty=faculty,
                    ef_id=str(e.ef_id),
                    academic_year=e.academic_year or "",
                    status=e.status or "draft",
                    modules=EvaluationModules(**modules_data),
                    total_points=e.total_points or 0,
                    approved_at=e.approved_at,
                    approved_by=e.approved_by,
                    reject_reason=e.reject_reason,
                    revision_requested=e.revision_requested,
                    revision_reason=e.revision_reason,
                    revision_status=e.revision_status,
                    revision_feedback=e.revision_feedback,
                    faculty_signature=e.faculty_signature,
                    hod_signature=e.hod_signature,
                    principal_signature=e.principal_signature,
                )
            )

        return result

    finally:
        db.close()
def list_evaluations_paginated(
    page: int = 1,
    page_size: int = 25,
    status: str | None = None,
    search: str | None = None,
    include_final_approved: bool = False,
):
    db = SessionLocal()

    try:
        page = max(page, 1)
        page_size = min(max(page_size, 1), 100)

        query = (
            db.query(EvaluationDB)
            .join(FacultyDB, EvaluationDB.faculty_id == FacultyDB.id)
        )

        if status == "hod_approved" and include_final_approved:
            query = query.filter(
                EvaluationDB.status.in_(
                    ["hod_approved", "approved"]
                )
            )
        elif status:
            query = query.filter(
                EvaluationDB.status == status
            )

        if search:
            search_term = f"%{search.strip()}%"
            query = query.filter(
                (FacultyDB.name.ilike(search_term))
                | (FacultyDB.emp_id.ilike(search_term))
            )

        total = query.count()

        evaluations = (
            query
            .add_columns(FacultyDB)
            .order_by(EvaluationDB.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        result = []

        for e, faculty_db in evaluations:
            faculty = FacultyProfile(
                id=str(faculty_db.id),
                user_id=str(faculty_db.user_id),
                department_name=faculty_db.dept,
                employee_id=faculty_db.emp_id,
                employee_name=faculty_db.name,
                orcid=faculty_db.orcid,
                official_email=faculty_db.email,
                phone_number=faculty_db.phone,
            )

            modules_data = dict(e.modules or {})

            # Older database records may contain NULL for these fields.
            for part in ("part_a", "part_b", "part_c"):
                if modules_data.get(part) is None:
                    modules_data[part] = {}

            result.append(
                Evaluation(
                    id=str(e.id),
                    faculty_id=str(e.faculty_id),
                    faculty=faculty,
                    ef_id=str(e.ef_id),
                    academic_year=e.academic_year or "",
                    status=e.status or "draft",
                    modules=EvaluationModules(**modules_data),
                    total_points=e.total_points or 0,
                    approved_at=e.approved_at,
                    approved_by=e.approved_by,
                    reject_reason=e.reject_reason,
                    revision_requested=e.revision_requested,
                    revision_reason=e.revision_reason,
                    revision_status=e.revision_status,
                    revision_feedback=e.revision_feedback,
                    faculty_signature=e.faculty_signature,
                    hod_signature=e.hod_signature,
                    principal_signature=e.principal_signature,
                )
            )

        pages = max((total + page_size - 1) // page_size, 1)

        return {
            "items": result,
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": pages,
        }

    finally:
        db.close()

def get_evaluation_counts():
    db = SessionLocal()

    try:
        pending = (
            db.query(EvaluationDB)
            .filter(EvaluationDB.status == "pending")
            .count()
        )

        approved = (
            db.query(EvaluationDB)
            .filter(
                EvaluationDB.status.in_(
                    ["hod_approved", "approved"]
                )
            )
            .count()
        )

        rejected = (
            db.query(EvaluationDB)
            .filter(EvaluationDB.status == "rejected")
            .count()
        )

        total = db.query(EvaluationDB).count()

        return {
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "total": total,
        }

    finally:
        db.close()
def get_principal_evaluation_counts():
    db = SessionLocal()

    try:
        awaiting_review = (
            db.query(EvaluationDB)
            .filter(EvaluationDB.status == "hod_approved")
            .count()
        )

        final_approved = (
            db.query(EvaluationDB)
            .filter(EvaluationDB.status == "approved")
            .count()
        )

        rejected = (
            db.query(EvaluationDB)
            .filter(EvaluationDB.status == "rejected")
            .count()
        )

        total = db.query(EvaluationDB).count()

        return {
            "awaiting_review": awaiting_review,
            "final_approved": final_approved,
            "rejected": rejected,
            "total": total,
        }

    finally:
        db.close()

def update_evaluation(eid: str, data: dict):
    db = SessionLocal()

    try:
        e = db.query(EvaluationDB).filter(
            EvaluationDB.id == int(eid)
        ).first()

        if not e:
            return None

        if "modules" in data:
            modules = EvaluationModules(**data["modules"])
            e.total_points = _compute_total_points(modules)
            mod_dict = modules.model_dump()
            existing_mod = e.modules or {}
            faculty_pos = data.get("faculty_position") or existing_mod.get("faculty_position") or "associate_professor"
            pos_name = data.get("position") or existing_mod.get("position")
            mod_dict["faculty_position"] = faculty_pos
            if pos_name:
                mod_dict["position"] = pos_name
            if "part_a" in data:
                mod_dict["part_a"] = data["part_a"]
            elif "part_a" in existing_mod:
                mod_dict["part_a"] = existing_mod["part_a"]
            if "part_b" in data:
                mod_dict["part_b"] = data["part_b"]
            elif "part_b" in existing_mod:
                mod_dict["part_b"] = existing_mod["part_b"]
            if "part_c" in data:
                mod_dict["part_c"] = data["part_c"]
            elif "part_c" in existing_mod:
                mod_dict["part_c"] = existing_mod["part_c"]
            e.modules = mod_dict

        for field in [
            "status",
            "academic_year",
            "approved_at",
            "approved_by",
            "reject_reason",
            "revision_requested",
            "revision_reason",
            "revision_status",
            "revision_feedback",
            "faculty_signature",
            "hod_signature",
            "principal_signature",
        ]:
            if field in data:
                setattr(e, field, data[field])

        db.commit()
        db.refresh(e)

        return get_evaluation(str(e.id))

    finally:
        db.close()


def get_faculty_by_email(email: str):
    db = SessionLocal()
    try:
        f = db.query(FacultyDB).filter(FacultyDB.email == email).first()
        if not f:
            return None
        return FacultyProfile(
            id=str(f.id),
            user_id=str(f.user_id),
            department_name=f.dept,
            employee_id=f.emp_id,
            employee_name=f.name,
            orcid_id=f.orcid or "",
            official_email=f.email,
            phone_number=f.phone,
        )
    finally:
        db.close()

def get_faculty_by_emp_id(emp_id: str):
    db = SessionLocal()
    try:
        f = db.query(FacultyDB).filter(FacultyDB.emp_id == emp_id).first()
        if not f:
            return None
        return FacultyProfile(
            id=str(f.id),
            user_id=str(f.user_id),
            department_name=f.dept,
            employee_id=f.emp_id,
            employee_name=f.name,
            orcid_id=f.orcid or "",
            official_email=f.email,
            phone_number=f.phone,
        )
    finally:
        db.close()

def get_faculty_by_user_id(user_id: str):
    db = SessionLocal()
    try:
        f = db.query(FacultyDB).filter(FacultyDB.user_id == int(user_id)).first()
        if not f:
            return None
        return FacultyProfile(
            id=str(f.id),
            user_id=str(f.user_id),
            department_name=f.dept,
            employee_id=f.emp_id,
            employee_name=f.name,
            orcid_id=f.orcid or "",
            official_email=f.email,
            phone_number=f.phone,
        )
    finally:
        db.close()

def delete_evaluation(eid: str):
    db = SessionLocal()

    try:
        e = db.query(EvaluationDB).filter(
            EvaluationDB.id == int(eid)
        ).first()

        if not e:
            return False

        db.delete(e)
        db.commit()

        return True

    finally:
        db.close()


import re

def normalize_doi(doi: str | None) -> str | None:
    if not doi or not isinstance(doi, str):
        return None
    d = doi.strip().lower()
    # Remove enclosing quotes, brackets, whitespace
    d = re.sub(r"^[\s\"'<(\[]+|[\s\"'>)\]]+$", "", d)
    # Remove URL prefixes: https://, http://, www., dx.doi.org, doi.org
    d = re.sub(r"^https?://", "", d)
    d = re.sub(r"^(www\.)?(dx\.)?doi\.org/", "", d)
    d = re.sub(r"^doi:\s*", "", d)
    # Extract pattern 10.xxxx/...
    match = re.search(r"(10\.\d{4,9}/[^\s\"'<>]+)", d)
    if match:
        d = match.group(1)
    # Strip any trailing slashes, dots, punctuation, whitespace
    d = d.rstrip("/.,;: ")
    return d if (d.startswith("10.") and "/" in d) else (d if d else None)


def normalize_issn(issn: str | None) -> str | None:
    if not issn or not isinstance(issn, str):
        return None
    cleaned = re.sub(r"[^0-9xX]", "", issn.strip()).upper()
    return cleaned if cleaned else None


def normalize_title(title: str | None) -> str | None:
    if not title or not isinstance(title, str):
        return None
    cleaned = re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()
    return cleaned if len(cleaned) >= 5 else None


def check_journal_duplicate(
    *args,
    faculty_id: str | int | None = None,
    user_id: str | int | None = None,
    doi: str | None = None,
    publication_url: str | None = None,
    title: str | None = None,
    issn: str | None = None,
    eissn: str | None = None,
    current_evaluation_id: str | int | None = None,
    db=None,
    **kwargs,
) -> dict | None:
    if args:
        if hasattr(args[0], "query"):
            db = args[0]
            if len(args) > 1 and faculty_id is None:
                faculty_id = args[1]
            if len(args) > 2 and doi is None:
                doi = args[2]
            if len(args) > 3 and title is None:
                title = args[3]
            if len(args) > 4 and current_evaluation_id is None:
                current_evaluation_id = args[4]
        else:
            if faculty_id is None:
                faculty_id = args[0]
            if len(args) > 1 and doi is None:
                doi = args[1]
            if len(args) > 2 and title is None:
                title = args[2]
            if len(args) > 3 and current_evaluation_id is None:
                current_evaluation_id = args[3]

    session = db
    should_close = False
    eval_id = current_evaluation_id

    # Candidate publication identifiers
    candidate_doi = (
        normalize_doi(doi)
        or normalize_doi(publication_url)
        or normalize_doi(kwargs.get("scopus_link"))
    )
    candidate_title = normalize_title(title)
    candidate_issn = normalize_issn(issn)
    candidate_eissn = normalize_issn(eissn)
    cand_issns = {candidate_issn, candidate_eissn} - {None}

    # If neither DOI nor title is provided, cannot identify paper duplicate
    if not candidate_doi and not candidate_title:
        return None

    if session is None:
        try:
            session = SessionLocal()
            should_close = True
        except Exception:
            return None

    try:
        # Resolve all identifiers belonging to the current faculty member
        own_faculty_ids = set()
        own_user_ids = set()

        if faculty_id is not None and str(faculty_id).strip():
            try:
                fid = int(faculty_id)
                own_faculty_ids.add(fid)
                fac_row = session.query(FacultyDB).filter(FacultyDB.id == fid).first()
                if fac_row:
                    own_user_ids.add(fac_row.user_id)
                else:
                    fac_by_u = session.query(FacultyDB).filter(FacultyDB.user_id == fid).first()
                    if fac_by_u:
                        own_faculty_ids.add(fac_by_u.id)
                        own_user_ids.add(fid)
            except (ValueError, TypeError):
                pass

        if user_id is not None and str(user_id).strip():
            try:
                uid = int(user_id)
                own_user_ids.add(uid)
                fac_by_u = session.query(FacultyDB).filter(FacultyDB.user_id == uid).first()
                if fac_by_u:
                    own_faculty_ids.add(fac_by_u.id)
            except (ValueError, TypeError):
                pass

        query = session.query(EvaluationDB)
        rows = query.all()

        for item in rows:
            ev = item[0] if isinstance(item, tuple) else item
            fac = item[1] if isinstance(item, tuple) and len(item) > 1 else None

            # Skip evaluations belonging to the same evaluation being edited
            if eval_id is not None and getattr(ev, "id", None) is not None:
                try:
                    if int(ev.id) == int(eval_id):
                        continue
                except (ValueError, TypeError):
                    pass

            # Skip evaluations belonging to the same faculty member
            if getattr(ev, "faculty_id", None) is not None:
                try:
                    if int(ev.faculty_id) in own_faculty_ids:
                        continue
                except (ValueError, TypeError):
                    pass

            if getattr(ev, "ef_id", None) is not None:
                try:
                    if int(ev.ef_id) in own_user_ids:
                        continue
                except (ValueError, TypeError):
                    pass

            mods = getattr(ev, "modules", {}) or {}
            journal = mods.get("journal_index") or {}
            if not isinstance(journal, dict):
                continue

            j_ver = journal.get("verification") or {}
            if not isinstance(j_ver, dict):
                j_ver = {}

            # Extract existing DOI
            j_doi = (
                normalize_doi(journal.get("doi"))
                or normalize_doi(j_ver.get("doi"))
                or normalize_doi(journal.get("scopus_link"))
                or normalize_doi(journal.get("publication_url"))
                or normalize_doi(journal.get("value"))
            )

            # Extract existing Title
            j_title = (
                normalize_title(journal.get("title"))
                or normalize_title(j_ver.get("title"))
                or normalize_title(journal.get("value"))
            )

            # Extract existing ISSNs
            j_issns = {
                normalize_issn(journal.get("issn")),
                normalize_issn(journal.get("eissn")),
                normalize_issn(j_ver.get("issn")),
                normalize_issn(j_ver.get("eissn")),
            } - {None}

            matched_by = None

            # Match Rule 1: DOI is the primary unique identifier
            if candidate_doi and j_doi:
                if candidate_doi == j_doi:
                    matched_by = "doi"

            # Match Rule 2: Fallback title match when DOI is not matched or unavailable
            elif candidate_title and j_title:
                if candidate_title == j_title:
                    # Supporting journal metadata check:
                    # If both candidate and existing paper explicitly specify ISSN/eISSN
                    # and they are completely different journals, do not match.
                    if cand_issns and j_issns and not (cand_issns & j_issns):
                        matched_by = None
                    else:
                        matched_by = "title"

            if matched_by:
                fac_name = "Another Faculty Member"
                raw_emp_id = ""

                if fac:
                    fac_name = getattr(fac, "name", fac_name)
                    raw_emp_id = getattr(fac, "employee_id", None) or getattr(fac, "emp_id", "")
                elif getattr(ev, "faculty_id", None):
                    try:
                        fac_obj = session.query(FacultyDB).filter(FacultyDB.id == ev.faculty_id).first()
                        if fac_obj:
                            fac_name = getattr(fac_obj, "name", fac_name)
                            raw_emp_id = getattr(fac_obj, "employee_id", None) or getattr(fac_obj, "emp_id", "")
                        elif getattr(ev, "ef_id", None):
                            fac_by_ef = session.query(FacultyDB).filter(FacultyDB.user_id == ev.ef_id).first()
                            if fac_by_ef:
                                fac_name = getattr(fac_by_ef, "name", fac_name)
                                raw_emp_id = getattr(fac_by_ef, "employee_id", None) or getattr(fac_by_ef, "emp_id", "")
                            else:
                                u_obj = session.query(UserDB).filter(UserDB.id == ev.ef_id).first()
                                if u_obj:
                                    fac_name = getattr(u_obj, "username", fac_name)
                    except Exception:
                        pass

                emp_str = str(raw_emp_id).strip() if raw_emp_id else ""
                if emp_str:
                    formatted_emp = emp_str if emp_str.upper().startswith("EMP") else f"EMP{emp_str}"
                else:
                    formatted_emp = f"EMP{getattr(ev, 'faculty_id', '0000')}"

                warning_msg = (
                    f"⚠ Duplicate Publication Detected: This publication has already been submitted "
                    f"for evaluation by {fac_name} (Employee ID: {formatted_emp}). "
                    f"Duplicate submissions across faculty accounts are not permitted."
                )

                return {
                    "duplicate": True,
                    "is_duplicate": True,
                    "faculty_name": fac_name,
                    "employee_id": formatted_emp,
                    "evaluation_id": getattr(ev, "id", None),
                    "matched_by": matched_by,
                    "message": warning_msg,
                }

        return None
    except Exception:
        return None
    finally:
        if should_close and session is not None:
            session.close()
