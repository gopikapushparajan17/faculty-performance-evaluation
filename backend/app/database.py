import uuid
from passlib.context import CryptContext

from app.models import User, FacultyProfile, Evaluation, EvaluationModules

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# In-memory store (replace with DB in production)
users_db: dict[str, User] = {}
faculty_db: dict[str, FacultyProfile] = {}
evaluations_db: dict[str, Evaluation] = {}

# Demo users: hod@demo.com, faculty@demo.com, principal@demo.com / password: demo123
def _seed():
    for u in [
        User(id="1", email="hod@demo.com", name="HOD User", role="hod", department="CSE", password_hash=pwd_context.hash("demo123")),
        User(id="2", email="faculty@demo.com", name="Faculty User", role="faculty", department="CSE", password_hash=pwd_context.hash("demo123")),
        User(id="3", email="principal@demo.com", name="Principal User", role="principal", password_hash=pwd_context.hash("demo123")),
    ]:
        users_db[u.email] = u

_seed()


def get_user_by_email(email: str) -> User | None:
    return users_db.get(email)


def create_faculty(data: dict) -> FacultyProfile:
    fid = str(uuid.uuid4())
    f = FacultyProfile(id=fid, **{k: v for k, v in data.items() if k in FacultyProfile.model_fields})
    faculty_db[fid] = f
    return f


def get_faculty(fid: str) -> FacultyProfile | None:
    return faculty_db.get(fid)


def list_faculty() -> list[FacultyProfile]:
    return list(faculty_db.values())


def update_faculty(fid: str, data: dict) -> FacultyProfile | None:
    f = faculty_db.get(fid)
    if not f:
        return None
    for k, v in data.items():
        if k in FacultyProfile.model_fields and k != "id":
            setattr(f, k, v)
    return f


def create_evaluation(data: dict) -> Evaluation:
    eid = str(uuid.uuid4())
    mod = data.get("modules") or {}
    modules = EvaluationModules(**mod) if isinstance(mod, dict) else mod
    ev = Evaluation(
        id=eid,
        faculty_id=data["faculty_id"],
        academic_year=data.get("academic_year", ""),
        status=data.get("status", "draft"),
        modules=modules,
        total_points=data.get("total_points", 0),
    )
    ev.faculty = faculty_db.get(ev.faculty_id)
    evaluations_db[eid] = ev
    return ev


def get_evaluation(eid: str) -> Evaluation | None:
    ev = evaluations_db.get(eid)
    if ev:
        ev.faculty = faculty_db.get(ev.faculty_id)
    return ev


def update_evaluation(eid: str, data: dict) -> Evaluation | None:
    ev = evaluations_db.get(eid)
    if not ev:
        return None
    for k, v in data.items():
        if k == "modules" and isinstance(v, dict):
            ev.modules = EvaluationModules(**v)
        elif k in Evaluation.model_fields and k not in ("id", "faculty"):
            setattr(ev, k, v)
    ev.faculty = faculty_db.get(ev.faculty_id)
    return ev


def list_evaluations_for_faculty(faculty_id: str) -> list[Evaluation]:
    return [e for e in evaluations_db.values() if e.faculty_id == faculty_id]


def list_evaluations_all() -> list[Evaluation]:
    out = list(evaluations_db.values())
    for e in out:
        e.faculty = faculty_db.get(e.faculty_id)
    return out
