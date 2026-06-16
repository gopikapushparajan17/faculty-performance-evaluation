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

# ✅ SAFE TEXT FUNCTION (FIXES YOUR ERROR)
def safe_text(text):
    if text is None:
        return "-"
    return str(text).replace("—", "-").replace("…", "...")

# ─────────────────────────────────────────────────────────────

def _kv(pdf, label: str, value: str):
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(48, 6, f"{label}:", new_x="RIGHT", new_y="LAST")
    pdf.set_font("Helvetica", "", 9)
    pdf.multi_cell(0, 6, safe_text(value), new_x="LMARGIN", new_y="NEXT")


def _section(pdf, title: str):
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_fill_color(219, 234, 254)
    pdf.cell(0, 8, f"  {safe_text(title)}", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def _build_pdf(ev: Evaluation) -> bytes:
    from fpdf import FPDF

    class EvalPDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 13)
            self.set_fill_color(30, 58, 138)
            self.set_text_color(255, 255, 255)
            self.cell(0, 12, "Faculty Performance Evaluation Report", fill=True, align="C", new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0, 0, 0)
            self.ln(2)

        def footer(self):
            self.set_y(-14)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}} | Generated {datetime.now().strftime('%d %b %Y %H:%M')}", align="C")
            self.set_text_color(0, 0, 0)

    pdf = EvalPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    f = ev.faculty
    m = ev.modules

    # ── FACULTY INFO ─────────────────────────
    _section(pdf, "Faculty Information")

    _kv(pdf, "Name", f.employee_name if f else ev.faculty_id)
    _kv(pdf, "Employee ID", f.employee_id if f else None)
    _kv(pdf, "Department", f.department_name if f else None)
    _kv(pdf, "Email", f.official_email if f else None)
    _kv(pdf, "Phone", f.phone_number if f else None)
    _kv(pdf, "ORCID", f.orcid_id if f else None)
    _kv(pdf, "Academic Year", ev.academic_year)
    _kv(pdf, "Status", ev.status)
    _kv(pdf, "Generated", datetime.now().strftime("%d %B %Y, %I:%M %p"))

    # ── POINTS TABLE ─────────────────────────
    _section(pdf, "Points Summary")

    rows = [
        ("Student Feedback", m.student_feedback.points if m.student_feedback else 0, 15),
        ("Conference Articles", m.conference_articles.points if m.conference_articles else 0, 16),
        ("Book Chapters", m.book_chapters.points if m.book_chapters else 0, 24),
    ]

    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(100, 7, "Module", border=1)
    pdf.cell(40, 7, "Points", border=1)
    pdf.cell(0, 7, "Max", border=1, new_x="LMARGIN", new_y="NEXT")

    for label, pts, max_pts in rows:
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(100, 6, safe_text(label), border=1)
        pdf.cell(40, 6, safe_text(pts), border=1)
        pdf.cell(0, 6, safe_text(max_pts), border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.cell(100, 7, "TOTAL", border=1)
    pdf.cell(40, 7, safe_text(ev.total_points), border=1)
    pdf.cell(0, 7, "189+", border=1, new_x="LMARGIN", new_y="NEXT")

    return pdf.output()


# ── ROUTE ─────────────────────────

@router.get("/{eid}")
async def generate_pdf(eid: str, user: User = Depends(get_current_user)):
    ev = get_evaluation(eid)
    if not ev:
        raise HTTPException(404, "Evaluation not found")

    loop = asyncio.get_event_loop()
    pdf_bytes = bytes(await loop.run_in_executor(_executor, _build_pdf, ev))

    fname = f"evaluation_{eid}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )
