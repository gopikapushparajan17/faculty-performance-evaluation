import uuid
import bcrypt

from app.models import User, FacultyProfile, Evaluation, EvaluationModules

# In-memory store (replace with DB in production)
users_db: dict[str, User] = {}  # keyed by email
users_by_id: dict[str, User] = {}  # keyed by id
faculty_db: dict[str, FacultyProfile] = {}
evaluations_db: dict[str, Evaluation] = {}


def _is_valid_scopus(url: str | None) -> bool:
  return bool(url) and isinstance(url, str) and url.startswith("https://www.scopus.com/")


def _has_text(v: str | None) -> bool:
  return bool(v and v.strip())


def _journal_index_points(journal_index) -> int:
    verification = journal_index.verification
    if isinstance(verification, dict) and verification.get("scopus_status") == "source_covered":
        return 4
    return 0


def _compute_module_points(modules: EvaluationModules) -> dict[str, int]:
  from app.models import (
      StudentFeedbackData,
      ConferenceArticlesData,
      BookChaptersData,
      BooksData,
      IPRData,
      FundedProjectsData,
      FDPAttendedData,
      TalksData,
      DeptActivitiesData,
      InstActivitiesData,
      FDPOrganizedData,
  )

  m = modules

  sf = 0
  if isinstance(m.student_feedback, StudentFeedbackData):
      try:
          pct = float(m.student_feedback.percentage or 0)
      except ValueError:
          pct = 0
      if pct >= 85:
          sf = 15
      elif pct >= 70:
          sf = 10
      elif pct >= 60:
          sf = 7
      elif pct > 0:
          sf = 5

  ji = _journal_index_points(m.journal_index)

  conf = 0
  if isinstance(m.conference_articles, ConferenceArticlesData):
    valid = [
        e for e in m.conference_articles.entries
        if _has_text(e.title) and _is_valid_scopus(e.proof_file)
    ]
    conf = min(len(valid), 4) * 4

  bc = 0
  if isinstance(m.book_chapters, BookChaptersData):
      valid = [
          e for e in m.book_chapters.entries
          if _has_text(e.title) and _is_valid_scopus(e.proof_file)
      ]
      bc = min(len(valid), 4) * 6

  books = 0
  if isinstance(m.books, BooksData):
      valid = [
          e for e in m.books.entries
          if _has_text(e.title) and _has_text(e.proof_file) and not _is_valid_scopus(e.proof_file)
      ]
      for entry in valid[:3]:
          books += 20 if entry.type == "authored" else 10

  ipr = 0
  if isinstance(m.ipr, IPRData):
      for e in m.ipr.entries:
          if not _has_text(e.description) or not (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file)):
              continue
          if e.type == "patent":
              ipr += 30
          elif e.type in ("copyright", "trademark"):
              ipr += 10

  funded = 0
  if isinstance(m.funded_projects, FundedProjectsData):
      for e in m.funded_projects.entries:
          if not _has_text(e.description) or not (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file)):
              continue
          amt = float(e.amount_lakhs or 0)
          if amt > 5:
              funded += 20
          elif amt >= 3:
              funded += 15
          elif amt >= 2:
              funded += 12
          elif amt >= 1:
              funded += 10
          elif amt > 0:
              funded += 5

  fdp_attended = 0
  if isinstance(m.fdp_attended, FDPAttendedData):
      valid = [
          e for e in m.fdp_attended.entries
          if _has_text(e.name) and e.days and e.days > 0 and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      for e in valid[:2]:
          days = e.days or 0
          if days >= 14:
              fdp_attended += 10
          elif days >= 5:
              fdp_attended += 5
          elif days >= 3:
              fdp_attended += 3

  talks = 0
  if isinstance(m.talks_delivered, TalksData):
      valid = [
          e for e in m.talks_delivered.entries
          if _has_text(e.title) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      talks = min(len(valid), 2) * 5

  departmental = 0
  if isinstance(m.departmental_activities, DeptActivitiesData):
      valid = [
          e for e in m.departmental_activities.entries
          if _has_text(e.description) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      departmental = min(len(valid), 3) * 3

  institutional = 0
  if isinstance(m.institutional_activities, InstActivitiesData):
      valid = [
          e for e in m.institutional_activities.entries
          if _has_text(e.description) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      institutional = min(len(valid), 3) * 5

  fdp_organized = 0
  if isinstance(m.fdp_organized, FDPOrganizedData):
      valid = [
          e for e in m.fdp_organized.entries
          if _has_text(e.name) and e.days and e.days > 0 and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      for e in valid[:2]:
          days = e.days or 0
          if days >= 5:
              fdp_organized += 10
          elif days >= 3:
              fdp_organized += 5
          elif days >= 1:
              fdp_organized += 2

  return {
      "student_feedback": sf,
      "journal_index": ji,
      "conference_articles": conf,
      "book_chapters": bc,
      "books": books,
      "ipr": ipr,
      "funded_projects": funded,
      "fdp_attended": fdp_attended,
      "talks_delivered": talks,
      "departmental_activities": departmental,
      "institutional_activities": institutional,
      "fdp_organized": fdp_organized,
  }


def _sync_module_points(modules: EvaluationModules) -> int:
    points = _compute_module_points(modules)

    modules.student_feedback.points = points["student_feedback"]
    modules.journal_index.points = points["journal_index"]
    modules.conference_articles.points = points["conference_articles"]
    modules.book_chapters.points = points["book_chapters"]
    modules.books.points = points["books"]
    modules.ipr.points = points["ipr"]
    modules.funded_projects.points = points["funded_projects"]
    modules.fdp_attended.points = points["fdp_attended"]
    modules.talks_delivered.points = points["talks_delivered"]
    modules.departmental_activities.points = points["departmental_activities"]
    modules.institutional_activities.points = points["institutional_activities"]
    modules.fdp_organized.points = points["fdp_organized"]

    return sum(points.values())


def _compute_total_points(modules: EvaluationModules) -> int:
  return _sync_module_points(modules)

# Demo users: hod@demo.com, faculty@demo.com, principal@demo.com / password: demo123
def _seed():
    def _hash(pw: str) -> str:
        return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    for u in [
        User(id="1", email="hod@demo.com", name="HOD User", role="hod", department="CSE", password_hash=_hash("demo123")),
        User(id="2", email="faculty@demo.com", name="G. Kucsko", role="faculty", department="CSE", password_hash=_hash("demo123")),
        User(id="3", email="principal@demo.com", name="Principal User", role="principal", password_hash=_hash("demo123")),
        User(id="4", email="facul3@demo.com", name="G. Kucsko", role="faculty", department="CSE", password_hash=_hash("demo123")),
    ]:
        users_db[u.email] = u
        users_by_id[u.id] = u

_seed()

# Seed demo faculty profile
faculty_user = users_db.get("faculty@demo.com")

if faculty_user and not faculty_db:
    faculty_db["demo-faculty"] = FacultyProfile(
        id="demo-faculty",
        user_id=str(faculty_user.id),
        department_name=faculty_user.department or "CSE",
        employee_id="FAC001",
        employee_name=faculty_user.name,
        orcid_id="",
        official_email=faculty_user.email,
        phone_number="9999999999",
    )

kucsko_user = users_db.get("facul3@demo.com")

if kucsko_user:
    faculty_db["kucsko-faculty"] = FacultyProfile(
        id="kucsko-faculty",
        user_id=str(kucsko_user.id),
        department_name=kucsko_user.department or "CSE",
        employee_id="FAC002",
        employee_name=kucsko_user.name,
        orcid_id="",
        official_email=kucsko_user.email,
        phone_number="9999999999",
    )
def get_user_by_email(email: str) -> User | None:
    return users_db.get(email)

def get_user_by_name(name: str) -> User | None:
    name = name.strip().lower()

    for user in users_by_id.values():
        if user.name.strip().lower() == name:
            return user

    return None
def get_user_by_id(uid: str) -> User | None:
    return users_by_id.get(uid)


def create_faculty(data: dict) -> FacultyProfile:
    fid = str(uuid.uuid4())
    f = FacultyProfile(id=fid, **{k: v for k, v in data.items() if k in FacultyProfile.model_fields})
    faculty_db[fid] = f
    return f


def get_faculty(fid: str) -> FacultyProfile | None:
    return faculty_db.get(fid)

def get_faculty_by_user_id(user_id: str) -> FacultyProfile | None:
    for faculty in faculty_db.values():
        if faculty.user_id == user_id:
            return faculty
    return None

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
    eid = str(len(evaluations_db) + 1)

    mod = data.get("modules") or {}
    modules = EvaluationModules(**mod) if isinstance(mod, dict) else mod

    total_points = _compute_total_points(modules)

    ev = Evaluation(
        id=eid,
        faculty_id=data["faculty_id"],
        ef_id=data.get("ef_id"),
        academic_year=data.get("academic_year", ""),
        status=data.get("status", "draft"),
        modules=modules,
        total_points=total_points,
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
        elif k in Evaluation.model_fields and k not in ("id", "faculty", "total_points"):
            setattr(ev, k, v)
    ev.total_points = _compute_total_points(ev.modules)
    ev.faculty = faculty_db.get(ev.faculty_id)
    return ev


def list_evaluations_for_faculty(faculty_id: str) -> list[Evaluation]:
    return [e for e in evaluations_db.values() if e.faculty_id == faculty_id]


def list_evaluations_all() -> list[Evaluation]:
    out = list(evaluations_db.values())
    for e in out:
        e.faculty = faculty_db.get(e.faculty_id)
    return out
