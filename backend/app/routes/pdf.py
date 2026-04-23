import base64
import io
import re
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Response

from app.database import get_evaluation, update_evaluation
from app.deps import get_current_user
from app.models import User, Evaluation, EvaluationModules

router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=2)
SCOPUS_PFX = "https://www.scopus.com/"

_TITLE_RE = re.compile(
    r'\b(dr|prof|professor|mr|mrs|ms|phd|ph\.d|m\.tech|b\.tech|m\.e|b\.e|er)\b\.?\s*',
    re.IGNORECASE,
)

# Keywords expected on a genuine Scopus author-profile page
_PROFILE_KW = [
    "h-index", "h index", "documents", "citations", "co-authors",
    "author details", "affiliation history", "subject area",
    "scopus author", "cited by", "orcid", "metrics",
]
# Keywords that indicate a search-results page (not a profile)
_SEARCH_KW = [
    "search results", "refine results", "sort by relevance",
    "search within results", "no results",
]


def _match_faculty_name(faculty_name: str, page_text: str) -> tuple[bool, str]:
    """Require at least 2 significant name tokens to match (or full-name substring).
    Returns (verified, detail_message).
    """
    clean = _TITLE_RE.sub("", faculty_name).strip()
    tokens = [t for t in re.split(r"[\s,\.]+", clean) if len(t) >= 3]

    if not tokens:
        return False, "Name too short to verify"

    page_lower = page_text.lower()

    # Full-name substring check (most reliable)
    full = " ".join(tokens).lower()
    if full in page_lower:
        return True, f"Full name matched"

    matched = [t for t in tokens if t.lower() in page_lower]
    need = min(2, len(tokens))  # need ≥2 tokens, or all if only 1

    if len(matched) >= need:
        return True, f"{len(matched)}/{len(tokens)} tokens matched: {', '.join(matched)}"

    return False, f"Only {len(matched)}/{len(tokens)} tokens found (need ≥{need})"


def _check_scopus_structure(page_text: str) -> tuple[bool, str]:
    """Return (is_valid_author_profile, reason)."""
    low = page_text.lower()
    profile_hits = sum(1 for kw in _PROFILE_KW if kw in low)
    search_hits  = sum(1 for kw in _SEARCH_KW  if kw in low)

    if search_hits:
        return False, "Looks like a search-results page, not an author profile"
    if profile_hits >= 2:
        return True, f"Author profile confirmed ({profile_hits} indicators)"
    if profile_hits == 1:
        return True, "Author profile likely (1 indicator)"
    return False, "No Scopus author-profile indicators detected"


# ── Scopus verification ────────────────────────────────────────────────────────

def _verify_scopus(url: str, faculty_name: str = "") -> dict:
    """Headless-browse url, screenshot it, verify structure + name.
    Returns {screenshot, verified, name_matched, name_detail, profile_ok, profile_detail, accessible}
    """
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            screenshot = page.screenshot(clip={"x": 0, "y": 0, "width": 1280, "height": 900})
            try:
                body_text = page.inner_text("body")
            except Exception:
                body_text = ""
            browser.close()

        profile_ok, profile_detail = _check_scopus_structure(body_text)
        name_ok, name_detail = (False, "No faculty name provided") if not faculty_name else \
                               _match_faculty_name(faculty_name, body_text)

        verified = profile_ok and name_ok
        return {
            "screenshot":     screenshot,
            "verified":       verified,
            "name_matched":   name_ok,
            "name_detail":    name_detail,
            "profile_ok":     profile_ok,
            "profile_detail": profile_detail,
            "accessible":     True,
        }
    except Exception as exc:
        print(f"[pdf] scopus verify failed for {url}: {exc}")
        return {
            "screenshot": None, "verified": False,
            "name_matched": False, "name_detail": "Verification error",
            "profile_ok": False, "profile_detail": str(exc),
            "accessible": False,
        }


def _collect_and_verify(m: EvaluationModules, faculty_name: str) -> dict:
    """Return {url: verification_result} for every Scopus URL in all modules."""
    urls: set[str] = set()
    for e in (m.conference_articles.entries if m.conference_articles else []):
        if e.proof_file and e.proof_file.startswith(SCOPUS_PFX):
            urls.add(e.proof_file)
    for e in (m.book_chapters.entries if m.book_chapters else []):
        if e.proof_file and e.proof_file.startswith(SCOPUS_PFX):
            urls.add(e.proof_file)
    if m.journal_index and m.journal_index.scopus_link:
        urls.add(m.journal_index.scopus_link)

    results: dict = {}
    for url in urls:
        results[url] = _verify_scopus(url, faculty_name)
    return results


# ── PDF helpers ────────────────────────────────────────────────────────────────

def _kv(pdf, label: str, value: str):
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(48, 6, f"{label}:", new_x="RIGHT", new_y="LAST")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 6, value or "—", new_x="LMARGIN", new_y="NEXT")


def _section(pdf, title: str):
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_fill_color(219, 234, 254)
    pdf.cell(0, 8, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def _verified_badge(v: dict) -> str:
    if not v.get("accessible"):
        return "⚠ Not accessible"
    if v.get("verified"):
        return f"✓ Verified ({v.get('name_detail', '')})"
    if not v.get("profile_ok"):
        return f"✗ Not a profile page ({v.get('profile_detail', '')})"
    return f"✗ Name mismatch ({v.get('name_detail', '')})"


def _embed_scopus(pdf, url: str, v: dict):
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(30, 64, 175)
    display = url if len(url) <= 90 else url[:87] + "..."
    pdf.multi_cell(0, 5, f"  Link: {display}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    # Verification badge
    pdf.set_font("Helvetica", "B", 8)
    ok = v.get("verified", False)
    accessible = v.get("accessible", False)
    pdf.set_text_color(0, 140, 0) if ok else (
        pdf.set_text_color(200, 100, 0) if not accessible else pdf.set_text_color(180, 0, 0)
    )
    pdf.cell(0, 5, f"  Verification: {_verified_badge(v)}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    screenshot = v.get("screenshot")
    if screenshot:
        try:
            buf = io.BytesIO(screenshot)
            if pdf.get_y() + 80 > pdf.h - 20:
                pdf.add_page()
            pdf.image(buf, w=pdf.epw)
            pdf.ln(3)
        except Exception as exc:
            pdf.set_font("Helvetica", "I", 8)
            pdf.cell(0, 5, f"  [Screenshot embed error: {exc}]", new_x="LMARGIN", new_y="NEXT")
    else:
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(0, 5, "  [Screenshot unavailable]", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)


def _embed_file(pdf, proof: str):
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(80, 80, 80)
    display = proof if len(proof) <= 90 else proof[:87] + "..."
    pdf.cell(0, 5, f"  Proof file: {display}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)


# ── PDF builder ────────────────────────────────────────────────────────────────

def _build_pdf(ev: Evaluation) -> bytes:
    from fpdf import FPDF

    class EvalPDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 13)
            self.set_fill_color(30, 58, 138)
            self.set_text_color(255, 255, 255)
            self.cell(0, 12, "Faculty Performance Evaluation Report", fill=True,
                      align="C", new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0, 0, 0)
            self.ln(2)

        def footer(self):
            self.set_y(-14)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}}  |  Generated {datetime.now().strftime('%d %b %Y %H:%M')}", align="C")
            self.set_text_color(0, 0, 0)

    pdf = EvalPDF(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    f = ev.faculty
    m = ev.modules
    approvals: dict = ev.approvals or {}
    faculty_name = f.employee_name if f else ""

    # ── Pre-compute all Scopus verifications ───────────────────────────────────
    scopus_results = _collect_and_verify(m, faculty_name)

    # ── PAGE 1: FACULTY INFO ───────────────────────────────────────────────────
    _section(pdf, "Faculty Information")
    _kv(pdf, "Name",          f.employee_name if f else ev.faculty_id)
    _kv(pdf, "Employee ID",   f.employee_id if f else "—")
    _kv(pdf, "Department",    f.department_name if f else "—")
    _kv(pdf, "Email",         f.official_email if f else "—")
    _kv(pdf, "Phone",         f.phone_number if f else "—")
    _kv(pdf, "ORCID",         f.orcid_id if f else "—")
    _kv(pdf, "Academic Year", ev.academic_year or "—")
    _kv(pdf, "Status",        ev.status.replace("_", " ").title())
    _kv(pdf, "Generated",     datetime.now().strftime("%d %B %Y, %I:%M %p"))

    if ev.reject_reason:
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(254, 226, 226)
        pdf.set_text_color(153, 27, 27)
        pdf.cell(0, 7, f"  Rejection Reason: {ev.reject_reason}", fill=True,
                 new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

    # ── POINTS TABLE ───────────────────────────────────────────────────────────
    _section(pdf, "Points Summary")
    rows = [
        ("Student Feedback",        m.student_feedback.points if m.student_feedback else 0,         15),
        ("Journal Index (Scopus)",  0,                                                               "—"),
        ("Conference Articles",     m.conference_articles.points if m.conference_articles else 0,    16),
        ("Book Chapters",           m.book_chapters.points if m.book_chapters else 0,                24),
        ("Books (Authored/Edited)", m.books.points if m.books else 0,                               60),
        ("IPR",                     m.ipr.points if m.ipr else 0,                                   "—"),
        ("Funded Projects",         m.funded_projects.points if m.funded_projects else 0,            "—"),
        ("FDP/Workshops Attended",  m.fdp_attended.points if m.fdp_attended else 0,                  20),
        ("Talks Delivered",         m.talks_delivered.points if m.talks_delivered else 0,            10),
        ("Departmental Activities", m.departmental_activities.points if m.departmental_activities else 0, 9),
        ("Institutional Activities",m.institutional_activities.points if m.institutional_activities else 0, 15),
        ("FDP/Workshops Organized", m.fdp_organized.points if m.fdp_organized else 0,                20),
    ]
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(30, 58, 138); pdf.set_text_color(255, 255, 255)
    pdf.cell(110, 7, "Module",        border=1, fill=True)
    pdf.cell(40,  7, "Points Earned", border=1, fill=True, align="C")
    pdf.cell(0,   7, "Max",           border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)
    for i, (label, pts, max_pts) in enumerate(rows):
        pdf.set_fill_color(245, 249, 255) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(110, 6, label,        border=1, fill=True)
        pdf.cell(40,  6, str(pts),     border=1, fill=True, align="C")
        pdf.cell(0,   6, str(max_pts), border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "B", 9); pdf.set_fill_color(219, 234, 254)
    pdf.cell(110, 7, "TOTAL",                  border=1, fill=True)
    pdf.cell(40,  7, str(ev.total_points),     border=1, fill=True, align="C")
    pdf.cell(0,   7, "189+",                   border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")

    # ── PROOF / UPLOAD VERIFICATION SUMMARY ───────────────────────────────────
    _section(pdf, "Proof & Verification Summary")
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(30, 58, 138); pdf.set_text_color(255, 255, 255)
    pdf.cell(55, 6, "Module",       border=1, fill=True)
    pdf.cell(65, 6, "Entry",        border=1, fill=True)
    pdf.cell(22, 6, "Type",         border=1, fill=True, align="C")
    pdf.cell(0,  6, "Verified",     border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(0, 0, 0)

    def _summary_row(pdf, module: str, entry_label: str, proof: str | None):
        if not proof:
            return
        if proof.startswith(SCOPUS_PFX):
            v = scopus_results.get(proof, {"verified": False, "accessible": False})
            type_label = "Scopus"
            if v.get("verified"):
                ver_label = "✓ Verified"
                color = (0, 120, 0)
            elif not v.get("accessible"):
                ver_label = "⚠ N/A"
                color = (180, 100, 0)
            else:
                ver_label = "✗ Unverified"
                color = (180, 0, 0)
        else:
            type_label = "File"
            ver_label = "— (file)"
            color = (80, 80, 80)

        i = getattr(_summary_row, "_count", 0)
        _summary_row._count = i + 1
        pdf.set_fill_color(245, 249, 255) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        pdf.set_font("Helvetica", "", 7)
        mod_disp = module[:22] + "…" if len(module) > 22 else module
        ent_disp = entry_label[:28] + "…" if len(entry_label) > 28 else entry_label
        pdf.cell(55, 5, mod_disp,   border=1, fill=True)
        pdf.cell(65, 5, ent_disp,   border=1, fill=True)
        pdf.cell(22, 5, type_label, border=1, fill=True, align="C")
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*color)
        pdf.cell(0,  5, ver_label,  border=1, fill=True, align="C", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(0, 0, 0)

    _summary_row._count = 0

    if m.journal_index and m.journal_index.scopus_link:
        _summary_row(pdf, "Journal Index", m.journal_index.title or "—", m.journal_index.scopus_link)
    for e in (m.conference_articles.entries if m.conference_articles else []):
        if e.title or e.proof_file:
            _summary_row(pdf, "Conference Articles", e.title or "—", e.proof_file)
    for e in (m.book_chapters.entries if m.book_chapters else []):
        if e.title or e.proof_file:
            _summary_row(pdf, "Book Chapters", e.title or "—", e.proof_file)
    for e in (m.books.entries if m.books else []):
        if e.title or e.proof_file:
            _summary_row(pdf, "Books", e.title or "—", e.proof_file)
    for e in (m.ipr.entries if m.ipr else []):
        if e.description or e.proof_file:
            _summary_row(pdf, "IPR", e.description or "—", e.proof_file)
    for e in (m.funded_projects.entries if m.funded_projects else []):
        if e.description or e.proof_file:
            _summary_row(pdf, "Funded Projects", e.description or "—", e.proof_file)
    for e in (m.fdp_attended.entries if m.fdp_attended else []):
        if e.name or e.proof_file:
            _summary_row(pdf, "FDP Attended", e.name or "—", e.proof_file)
    for e in (m.talks_delivered.entries if m.talks_delivered else []):
        if e.title or e.proof_file:
            _summary_row(pdf, "Talks Delivered", e.title or "—", e.proof_file)
    for e in (m.departmental_activities.entries if m.departmental_activities else []):
        if e.description or e.proof_file:
            _summary_row(pdf, "Dept Activities", e.description or "—", e.proof_file)
    for e in (m.institutional_activities.entries if m.institutional_activities else []):
        if e.description or e.proof_file:
            _summary_row(pdf, "Inst Activities", e.description or "—", e.proof_file)
    for e in (m.fdp_organized.entries if m.fdp_organized else []):
        if e.name or e.proof_file:
            _summary_row(pdf, "FDP Organized", e.name or "—", e.proof_file)

    if _summary_row._count == 0:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No proof files or Scopus links uploaded.", new_x="LMARGIN", new_y="NEXT")

    # ── SIGNATURES ─────────────────────────────────────────────────────────────
    _section(pdf, "Signatures & Approvals")
    pdf.ln(4)

    roles = [
        ("Faculty",            "faculty"),
        ("Head of Department", "hod"),
        ("Principal",          "principal"),
    ]
    col_w = pdf.epw / 3

    # Role header row
    for label, _ in roles:
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(col_w, 6, label, align="C")
    pdf.ln(7)

    # Signature image or typed name
    y_sig = pdf.get_y()
    for i, (_, key) in enumerate(roles):
        a = approvals.get(key) or {}
        x_pos = pdf.l_margin + i * col_w
        if a.get("image"):
            try:
                img_data = a["image"]
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                img_bytes = base64.b64decode(img_data)
                buf = io.BytesIO(img_bytes)
                pdf.image(buf, x=x_pos + 3, y=y_sig, w=col_w - 6, h=14)
            except Exception:
                pdf.set_xy(x_pos, y_sig)
                pdf.set_font("Helvetica", "I", 9)
                pdf.cell(col_w, 14, a.get("name", ""), align="C")
        elif a.get("name"):
            pdf.set_xy(x_pos, y_sig)
            pdf.set_font("Helvetica", "I", 10)
            pdf.cell(col_w, 14, a["name"], align="C")
    pdf.set_y(y_sig + 16)

    # Underline
    for i in range(3):
        x0 = pdf.l_margin + i * col_w + 5
        x1 = pdf.l_margin + (i + 1) * col_w - 5
        pdf.line(x0, pdf.get_y(), x1, pdf.get_y())
    pdf.ln(6)

    # Approved / pending labels
    for _, key in roles:
        a = approvals.get(key) or {}
        if a:
            try:
                date_str = datetime.fromisoformat(a.get("signed_at", "")).strftime("%d %b %Y")
            except Exception:
                date_str = a.get("signed_at", "")
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(0, 140, 0)
            pdf.cell(col_w, 5, f"Approved: {date_str}", align="C")
            pdf.set_text_color(0, 0, 0)
        else:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(160, 160, 160)
            pdf.cell(col_w, 5, "Pending", align="C")
            pdf.set_text_color(0, 0, 0)
    pdf.ln(10)

    # ── DETAILED MODULES ───────────────────────────────────────────────────────
    _add_module_pages(pdf, m, scopus_results)

    return bytes(pdf.output())


def _add_entry_proof(pdf, proof: str | None, scopus_results: dict):
    if not proof:
        return
    if proof.startswith(SCOPUS_PFX):
        v = scopus_results.get(proof, {"verified": False, "accessible": False, "screenshot": None})
        _embed_scopus(pdf, proof, v)
    else:
        _embed_file(pdf, proof)


def _add_module_pages(pdf, m: EvaluationModules, scopus_results: dict):

    # Module 1
    pdf.add_page()
    _section(pdf, "Module 1 — Student Feedback")
    sf = m.student_feedback
    _kv(pdf, "Feedback %", (str(sf.percentage) + "%") if sf and sf.percentage else "—")
    _kv(pdf, "Points", str(sf.points) if sf else "0")

    # Module 2
    _section(pdf, "Module 2 — Journal Index (Scopus)")
    ji = m.journal_index
    if ji and (ji.title or ji.scopus_link):
        _kv(pdf, "Title", ji.title or "—")
        if ji.scopus_link:
            _add_entry_proof(pdf, ji.scopus_link, scopus_results)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")

    # Module 3
    pdf.add_page()
    _section(pdf, "Module 3 — Conference Articles")
    entries = m.conference_articles.entries if m.conference_articles else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.title or '—'}", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.conference_articles.points if m.conference_articles else 0))

    # Module 4
    pdf.add_page()
    _section(pdf, "Module 4 — Book Chapters")
    entries = m.book_chapters.entries if m.book_chapters else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.title or '—'}", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.book_chapters.points if m.book_chapters else 0))

    # Module 5
    pdf.add_page()
    _section(pdf, "Module 5 — Authored/Edited Books")
    entries = m.books.entries if m.books else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.title or '—'}  [{e.type}]", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.books.points if m.books else 0))

    # Module 6
    _section(pdf, "Module 6 — IPR (Patents / Copyright / Trademark)")
    entries = m.ipr.entries if m.ipr else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.type.title()}: {e.description or '—'}", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.ipr.points if m.ipr else 0))

    # Module 7
    _section(pdf, "Module 7 — Funded Projects")
    entries = m.funded_projects.entries if m.funded_projects else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.description or '—'} — {e.amount_lakhs} Lakhs", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.funded_projects.points if m.funded_projects else 0))

    # Module 8
    pdf.add_page()
    _section(pdf, "Module 8 — FDP/Workshops Attended")
    entries = m.fdp_attended.entries if m.fdp_attended else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.name or '—'} — {e.days} days", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.fdp_attended.points if m.fdp_attended else 0))

    # Module 9
    _section(pdf, "Module 9 — Talks Delivered")
    entries = m.talks_delivered.entries if m.talks_delivered else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.title or '—'}", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.talks_delivered.points if m.talks_delivered else 0))

    # Module 10
    _section(pdf, "Module 10 — Departmental Activities")
    entries = m.departmental_activities.entries if m.departmental_activities else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.description or '—'}", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.departmental_activities.points if m.departmental_activities else 0))

    # Module 11
    _section(pdf, "Module 11 — Institutional Activities")
    entries = m.institutional_activities.entries if m.institutional_activities else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.description or '—'}", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.institutional_activities.points if m.institutional_activities else 0))

    # Module 12
    pdf.add_page()
    _section(pdf, "Module 12 — FDP/Workshops Organized")
    entries = m.fdp_organized.entries if m.fdp_organized else []
    if entries:
        for i, e in enumerate(entries, 1):
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(0, 6, f"  {i}. {e.name or '—'} — {e.days} days", new_x="LMARGIN", new_y="NEXT")
            _add_entry_proof(pdf, e.proof_file, scopus_results)
            pdf.ln(1)
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 6, "No entries.", new_x="LMARGIN", new_y="NEXT")
    _kv(pdf, "Total Points", str(m.fdp_organized.points if m.fdp_organized else 0))


# ── Route ──────────────────────────────────────────────────────────────────────

@router.get("/{eid}")
async def generate_pdf(eid: str, user: User = Depends(get_current_user)):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")
    if user.role == "faculty" and ev.ef_id != user.id:
        raise HTTPException(403, "Access denied")

    loop = asyncio.get_event_loop()
    pdf_bytes = await loop.run_in_executor(_executor, _build_pdf, ev)

    # Record that this role has viewed the PDF
    viewed_by = dict(ev.pdf_viewed_by or {})
    viewed_by[user.role] = {"user_id": user.id, "viewed_at": datetime.utcnow().isoformat()}
    update_evaluation(eid, {"pdf_viewed_by": viewed_by})

    fname = f"evaluation_{(ev.faculty.employee_id if ev.faculty else eid[:8])}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )
