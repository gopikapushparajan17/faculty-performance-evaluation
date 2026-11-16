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


def _as_verification(verification) -> dict | None:
    if isinstance(verification, dict):
        return verification
    return None


def _author_verified(verification) -> bool:
    v = _as_verification(verification)
    return bool(
        v
        and v.get("publication_found")
        and v.get("author_match") is True
    )


def _is_any_index_verified(verification) -> bool:
    """True if Scopus, Web of Science, or Crossref confirms the publication."""
    v = _as_verification(verification)
    if not v:
        return False

    # Scopus (article-level status, nested article result, or source list)
    if v.get("scopus_status") in ("indexed", "source_covered"):
        return True

    scopus = v.get("scopus") or {}
    if isinstance(scopus, dict) and scopus.get("status") in (
        "indexed",
        "source_covered",
    ):
        return True

    scopus_source = v.get("scopus_source") or {}
    if (
        isinstance(scopus_source, dict)
        and scopus_source.get("status") == "source_covered"
    ):
        return True

    # Web of Science (nested object used by publication_verifier)
    wos = v.get("web_of_science") or v.get("wos") or {}
    if isinstance(wos, dict):
        if wos.get("indexed") is True:
            return True
        if wos.get("status") in ("indexed", "covered", "source_covered"):
            return True

    if v.get("wos_status") in ("indexed", "covered", "source_covered"):
        return True

    # Crossref: publication_found is set from the Crossref works lookup.
    # Nested/status aliases are accepted if present.
    if v.get("publication_found") is True:
        return True

    if v.get("crossref_status") in ("indexed", "found", "verified", "covered"):
        return True

    crossref = v.get("crossref") or {}
    if isinstance(crossref, dict):
        if crossref.get("found") is True or crossref.get("verified") is True:
            return True
        if crossref.get("status") in ("indexed", "found", "verified", "covered"):
            return True

    return False


def _is_patent_verified_and_inventor_matched(entry) -> bool:
    """
    Returns True ONLY when BOTH conditions are satisfied:
    1. The patent record is successfully found and verified by the patent verification system.
    2. The faculty member's name successfully matches an inventor listed in the verified patent record.
    """
    if isinstance(entry, dict):
        v_status = entry.get("verification_status")
        assoc_type = entry.get("association_type")
        inventor_match = entry.get("inventor_match")
        patent_found = entry.get("patent_found")
        ver = entry.get("verification")
        if isinstance(ver, dict):
            v_status = v_status or ver.get("verification_status")
            assoc_type = assoc_type or ver.get("association_type")
            if inventor_match is None:
                inventor_match = ver.get("inventor_match")
            if patent_found is None:
                patent_found = ver.get("patent_found")
    else:
        v_status = getattr(entry, "verification_status", None)
        assoc_type = getattr(entry, "association_type", None)
        inventor_match = getattr(entry, "inventor_match", None)
        patent_found = getattr(entry, "patent_found", None)
        ver = getattr(entry, "verification", None)
        if isinstance(ver, dict):
            v_status = v_status or ver.get("verification_status")
            assoc_type = assoc_type or ver.get("association_type")
            if inventor_match is None:
                inventor_match = ver.get("inventor_match")
            if patent_found is None:
                patent_found = ver.get("patent_found")

    # 30 points are awarded ONLY when all four conditions are explicitly true:
    # 1. verification_status == "verified"
    # 2. patent_found is True
    # 3. inventor_match is True
    # 4. association_type == "inventor"
    # Missing, None, false, or inconsistent values must always result in False (0 points).
    return (
        v_status == "verified"
        and patent_found is True
        and inventor_match is True
        and assoc_type == "inventor"
    )


def _journal_index_points(journal_index) -> int:
    name = getattr(journal_index, "title", None) or getattr(
        journal_index, "value", None
    )
    link = getattr(journal_index, "scopus_link", None)
    issn = getattr(journal_index, "issn", None)
    eissn = getattr(journal_index, "eissn", None)
    doi = getattr(journal_index, "doi", None)
    verification = getattr(journal_index, "verification", None)
    decl = getattr(journal_index, "declaration_accepted", False)
    if isinstance(journal_index, dict):
        decl = decl or journal_index.get("declaration_accepted", False)
        doi = doi or journal_index.get("doi")
    has_evidence = _has_text(link) or _has_text(issn) or _has_text(eissn) or _has_text(doi)
    if (
        _has_text(name)
        and has_evidence
        and _author_verified(verification)
        and _is_any_index_verified(verification)
        and bool(decl)
    ):
        return 30
    return 0


CATEGORY_MAXIMUMS = {
    "professor": {"tlp": 20, "research": 60, "others": 20},
    "associate_professor": {"tlp": 30, "research": 50, "others": 20},
    "assistant_professor": {"tlp": 40, "research": 40, "others": 20},
}
ELIGIBILITY_PERCENTAGE = 0.65


def _compute_module_points(modules: EvaluationModules) -> dict[str, int]:
  from app.models import (
      StudentFeedbackData,
      MOOCCoursesData,
      ConferenceArticlesData,
      BookChaptersData,
      BooksData,
      IPRData,
      FundedProjectsData,
      PhDAwardedData,
      FDPAttendedData,
      TalksData,
      DeptActivitiesData,
      InstActivitiesData,
      FDPOrganizedData,
      ConferenceOrganizedData,
      MOUSignedData,
      HODDeanRoleData,
      IndustrialVisitsData,
  )

  m = modules

  # 1. Student Feedback: 80–100% = 30; 60–below 80% = 20; below 60% = 0
  sf = 0
  if isinstance(m.student_feedback, StudentFeedbackData):
      try:
          pct = float(m.student_feedback.percentage or 0)
      except ValueError:
          pct = 0
      if pct >= 80:
          sf = 30
      elif pct >= 60:
          sf = 20
      else:
          sf = 0

  # 2. MOOC Courses: 5 each, maximum 2
  mooc = 0
  if getattr(m, "mooc_courses", None) and isinstance(m.mooc_courses, MOOCCoursesData):
      valid_mooc = [
          e for e in m.mooc_courses.entries
          if _has_text(e.title) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      mooc = min(len(valid_mooc), 2) * 5

  # 3. Departmental Activities (3 each) & 4. Institutional Activities (5 each)
  # Combined maximum = 2 entries. Allow 2 departmental, 2 institutional or 1 of each.
  dept_valid = []
  if isinstance(m.departmental_activities, DeptActivitiesData):
      dept_valid = [
          e for e in m.departmental_activities.entries
          if _has_text(e.description) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]

  inst_valid = []
  if isinstance(m.institutional_activities, InstActivitiesData):
      inst_valid = [
          e for e in m.institutional_activities.entries
          if _has_text(e.description) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]

  # Allocate up to 2 entries combined, prioritizing institutional (5 pts > 3 pts) if exceeding 2
  effective_inst = min(len(inst_valid), 2)
  effective_dept = min(len(dept_valid), 2 - effective_inst)
  departmental = effective_dept * 3
  institutional = effective_inst * 5

  # RESEARCH MODULES
  # 1. Journal Index: 30 marks per verified paper
  ji = _journal_index_points(m.journal_index)

  # 2. Conference Articles: 5 each, maximum 2; preserve verification
  conf = 0
  if isinstance(m.conference_articles, ConferenceArticlesData):
    valid = [
        e for e in m.conference_articles.entries
        if (
            _has_text(e.title)
            and _has_text(e.proof_file)
            and _author_verified(e.verification)
            and _is_any_index_verified(e.verification)
        )
    ]
    conf = min(len(valid), 2) * 5

  # 3. Book Chapters: 5 each, maximum 2; preserve verification
  bc = 0
  if isinstance(m.book_chapters, BookChaptersData):
      valid = [
          e for e in m.book_chapters.entries
          if _has_text(e.title)
          and (
              _is_valid_scopus(e.proof_file)
              or (
                  _has_text(e.proof_file)
                  and _author_verified(e.verification)
                  and _is_any_index_verified(e.verification)
              )
          )
      ]
      bc = min(len(valid), 2) * 5

  # 4. Authored/Edited Books: 5 each, maximum 2
  books = 0
  if isinstance(m.books, BooksData):
      valid = [
          e for e in m.books.entries
          if _has_text(e.title) and _has_text(e.proof_file) and not _is_valid_scopus(e.proof_file)
      ]
      books = min(len(valid), 2) * 5

  # 5. IPR: 5 each, maximum 2; preserve verification
  ipr = 0
  if isinstance(m.ipr, IPRData):
      valid_ipr = 0
      for e in m.ipr.entries:
          if e.type == "patent":
              if _is_patent_verified_and_inventor_matched(e):
                  valid_ipr += 1
          elif e.type in ("copyright", "trademark"):
              if _has_text(e.description) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file)):
                  valid_ipr += 1
      ipr = min(valid_ipr, 2) * 5

  # 6. Funded Projects/Consultancy:
  #    - ₹2–5 lakh = 5 marks
  #    - Above ₹5 lakh = 30 marks
  #    - Below ₹2 lakh = 0
  funded = 0
  if isinstance(m.funded_projects, FundedProjectsData):
      for e in m.funded_projects.entries:
          if not _has_text(e.description) or not (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file)):
              continue
          amt = float(e.amount_lakhs or 0)
          if amt > 5:
              funded += 30
          elif amt >= 2:
              funded += 5

  # 7. PhD Awarded: 5 per student; PDF proof required
  phd = 0
  if getattr(m, "phd_awarded", None) and isinstance(m.phd_awarded, PhDAwardedData):
      valid_phd = [
          e for e in m.phd_awarded.entries
          if _has_text(e.student_name) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      phd = len(valid_phd) * 5

  # OTHERS MODULES
  # 1. Organising FDPs/Workshops:
  #    - 5 days = 5 marks
  #    - 3–4 days = 4 marks
  #    - 1–2 days = 3 marks
  fdp_organized = 0
  if isinstance(m.fdp_organized, FDPOrganizedData):
      valid = [
          e for e in m.fdp_organized.entries
          if _has_text(e.name) and e.days and e.days > 0 and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      for e in valid:
          days = e.days or 0
          if days >= 5:
              fdp_organized += 5
          elif days >= 3:
              fdp_organized += 4
          elif days >= 1:
              fdp_organized += 3

  # Factor 2: Conferences Organised
  # - General Chair = 5 marks
  # - Session Chair = 3 marks
  # Marks awarded only after confirmation checkbox is selected; if unchecked = 0
  conf_organized = 0
  if getattr(m, "conference_organized", None) and isinstance(m.conference_organized, ConferenceOrganizedData):
      if m.conference_organized.confirmed:
          role = (m.conference_organized.role or "").strip()
          if role == "General Chair":
              conf_organized = 5
          elif role == "Session Chair":
              conf_organized = 3

  # 2. Invited Talks/Resource Person: 5 each, maximum 2
  talks = 0
  if isinstance(m.talks_delivered, TalksData):
      valid = [
          e for e in m.talks_delivered.entries
          if _has_text(e.title) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      talks = min(len(valid), 2) * 5

  # 3. MOU Signed: 3 each, maximum 2
  mou = 0
  if getattr(m, "mou_signed", None) and isinstance(m.mou_signed, MOUSignedData):
      valid_mou = [
          e for e in m.mou_signed.entries
          if _has_text(e.organization) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      mou = min(len(valid_mou), 2) * 3

  # 4. HOD/Dean: 2 marks
  hod_dean = 0
  if getattr(m, "hod_dean_role", None) and isinstance(m.hod_dean_role, HODDeanRoleData):
      if m.hod_dean_role.held_role and _has_text(m.hod_dean_role.proof_file):
          hod_dean = 2

  # 5. Organising Industrial Visits: 2 each, maximum 2
  visits = 0
  if getattr(m, "industrial_visits", None) and isinstance(m.industrial_visits, IndustrialVisitsData):
      valid_visits = [
          e for e in m.industrial_visits.entries
          if _has_text(e.company_name) and (_has_text(e.proof_file) and not _is_valid_scopus(e.proof_file))
      ]
      visits = min(len(valid_visits), 2) * 2

  # Legacy FDP Attended (preserved if present)
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

  return {
      "student_feedback": sf,
      "mooc_courses": mooc,
      "departmental_activities": departmental,
      "institutional_activities": institutional,
      "journal_index": ji,
      "conference_articles": conf,
      "book_chapters": bc,
      "books": books,
      "ipr": ipr,
      "funded_projects": funded,
      "phd_awarded": phd,
      "fdp_organized": fdp_organized,
      "conference_organized": conf_organized,
      "talks_delivered": talks,
      "mou_signed": mou,
      "hod_dean_role": hod_dean,
      "industrial_visits": visits,
      "fdp_attended": fdp_attended,
  }


def _sync_module_points(modules: EvaluationModules) -> int:
    points = _compute_module_points(modules)

    modules.student_feedback.points = points.get("student_feedback", 0)
    if hasattr(modules, "mooc_courses") and modules.mooc_courses:
        modules.mooc_courses.points = points.get("mooc_courses", 0)
    modules.journal_index.points = points.get("journal_index", 0)
    modules.conference_articles.points = points.get("conference_articles", 0)
    modules.book_chapters.points = points.get("book_chapters", 0)
    modules.books.points = points.get("books", 0)
    modules.ipr.points = points.get("ipr", 0)
    modules.funded_projects.points = points.get("funded_projects", 0)
    if hasattr(modules, "phd_awarded") and modules.phd_awarded:
        modules.phd_awarded.points = points.get("phd_awarded", 0)
    modules.fdp_attended.points = points.get("fdp_attended", 0)
    modules.talks_delivered.points = points.get("talks_delivered", 0)
    modules.departmental_activities.points = points.get("departmental_activities", 0)
    modules.institutional_activities.points = points.get("institutional_activities", 0)
    modules.fdp_organized.points = points.get("fdp_organized", 0)
    if hasattr(modules, "conference_organized") and modules.conference_organized:
        modules.conference_organized.points = points.get("conference_organized", 0)
    if hasattr(modules, "mou_signed") and modules.mou_signed:
        modules.mou_signed.points = points.get("mou_signed", 0)
    if hasattr(modules, "hod_dean_role") and modules.hod_dean_role:
        modules.hod_dean_role.points = points.get("hod_dean_role", 0)
    if hasattr(modules, "industrial_visits") and modules.industrial_visits:
        modules.industrial_visits.points = points.get("industrial_visits", 0)

    # Return uncapped sum of actual marks
    return sum(points.values())


def compute_category_scores(
    tlp_or_modules,
    research_or_pos: float | str | None = None,
    others: float | None = None,
    faculty_position: str | None = "associate_professor",
) -> dict:
    from app.models import EvaluationModules

    if isinstance(tlp_or_modules, EvaluationModules):
        points = _compute_module_points(tlp_or_modules)
        tlp_actual = (
            points.get("student_feedback", 0)
            + points.get("mooc_courses", 0)
            + points.get("departmental_activities", 0)
            + points.get("institutional_activities", 0)
        )
        research_actual = (
            points.get("journal_index", 0)
            + points.get("conference_articles", 0)
            + points.get("book_chapters", 0)
            + points.get("books", 0)
            + points.get("ipr", 0)
            + points.get("funded_projects", 0)
            + points.get("phd_awarded", 0)
        )
        others_actual = (
            points.get("fdp_organized", 0)
            + points.get("conference_organized", 0)
            + points.get("talks_delivered", 0)
            + points.get("mou_signed", 0)
            + points.get("hod_dean_role", 0)
            + points.get("industrial_visits", 0)
            + points.get("fdp_attended", 0)
        )
        pos = str(research_or_pos) if isinstance(research_or_pos, str) else (faculty_position or "associate_professor")
    else:
        tlp_actual = float(tlp_or_modules or 0)
        research_actual = float(research_or_pos or 0) if isinstance(research_or_pos, (int, float)) else 0.0
        others_actual = float(others or 0)
        pos = str(faculty_position or "associate_professor")
        points = {}

    # NEVER cap actual marks: raw display
    grand_total = tlp_actual + research_actual + others_actual

    pos_key = pos.lower() if pos else "associate_professor"
    maxes = CATEGORY_MAXIMUMS.get(pos_key, CATEGORY_MAXIMUMS["associate_professor"])

    tlp_max = maxes["tlp"]
    research_max = maxes["research"]
    others_max = maxes["others"]

    tlp_threshold = round(tlp_max * ELIGIBILITY_PERCENTAGE, 1)
    research_threshold = round(research_max * ELIGIBILITY_PERCENTAGE, 1)

    is_tlp_eligible = tlp_actual >= tlp_threshold
    is_research_eligible = research_actual >= research_threshold
    is_overall_eligible = is_tlp_eligible and is_research_eligible

    return {
        "tlp": {
            "score": tlp_actual,
            "max": tlp_max,
            "threshold": tlp_threshold,
            "eligible": is_tlp_eligible,
        },
        "research": {
            "score": research_actual,
            "max": research_max,
            "threshold": research_threshold,
            "eligible": is_research_eligible,
        },
        "others": {
            "score": others_actual,
            "max": others_max,
            "threshold": 0.0,
            "eligible": True,
        },
        "overall_eligible": is_overall_eligible,
        "total_score": grand_total,
        # Flat keys for convenience
        "tlp_actual": tlp_actual,
        "research_actual": research_actual,
        "others_actual": others_actual,
        "grand_total": grand_total,
        "tlp_max": tlp_max,
        "research_max": research_max,
        "others_max": others_max,
        "tlp_threshold": tlp_threshold,
        "research_threshold": research_threshold,
        "is_tlp_eligible": is_tlp_eligible,
        "is_research_eligible": is_research_eligible,
        "is_overall_eligible": is_overall_eligible,
        "module_points": points,
    }


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
