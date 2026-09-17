from sqlalchemy import select

from app.mysql_db import SessionLocal
from app.db_models import UserDB, FacultyDB, EvaluationDB
from app.models import User, FacultyProfile, Evaluation, EvaluationModules
from app.database import _compute_total_points


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

        evaluation = EvaluationDB(
            faculty_id=int(data["faculty_id"]),
            ef_id=int(data["ef_id"]),
            academic_year=data.get("academic_year", ""),
            status=data.get("status", "draft"),
            modules=modules.model_dump(),
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
            status=evaluation.status,
            modules=modules,
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

        return Evaluation(
            id=str(e.id),
            faculty_id=str(e.faculty_id),
            faculty=faculty,
            ef_id=str(e.ef_id),
            academic_year=e.academic_year or "",
            status=e.status or "draft",
            modules=EvaluationModules(**(e.modules or {})),
            total_points=e.total_points or 0,
            approved_at=e.approved_at,
            approved_by=e.approved_by,
            reject_reason=e.reject_reason,
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

            result.append(
                Evaluation(
                    id=str(e.id),
                    faculty_id=str(e.faculty_id),
                    faculty=faculty,
                    ef_id=str(e.ef_id),
                    academic_year=e.academic_year or "",
                    status=e.status or "draft",
                    modules=EvaluationModules(**(e.modules or {})),
                    total_points=e.total_points or 0,
                    approved_at=e.approved_at,
                    approved_by=e.approved_by,
                    reject_reason=e.reject_reason,
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

            result.append(
                Evaluation(
                    id=str(e.id),
                    faculty_id=str(e.faculty_id),
                    faculty=faculty,
                    ef_id=str(e.ef_id),
                    academic_year=e.academic_year or "",
                    status=e.status or "draft",
                    modules=EvaluationModules(**(e.modules or {})),
                    total_points=e.total_points or 0,
                    approved_at=e.approved_at,
                    approved_by=e.approved_by,
                    reject_reason=e.reject_reason,
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
            e.modules = modules.model_dump()
            e.total_points = _compute_total_points(modules)

        for field in [
            "status",
            "academic_year",
            "approved_at",
            "approved_by",
            "reject_reason",
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