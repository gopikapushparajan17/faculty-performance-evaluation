import os
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    Image,
)
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.units import inch

HEADER_BLUE = colors.HexColor("#1e3a8a")
HEADER_TEXT = colors.white
LABEL_BG = colors.HexColor("#f8fafc")
TOTAL_ROW_BG = colors.HexColor("#dbeafe")
BORDER_COLOR = colors.HexColor("#cbd5e1")

TABLE_FONT_SIZE = 10
TABLE_HEADER_FONT_SIZE = 11
TABLE_PADDING = 5
TABLE_H_PADDING = 8


def _section_heading_style(styles) -> ParagraphStyle:
    return ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontSize=11,
        leading=13,
        spaceBefore=8,
        spaceAfter=4,
        fontName="Helvetica-Bold",
        textColor=HEADER_BLUE,
        alignment=TA_CENTER,
    )


def _detail_table_style() -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_TEXT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), TABLE_HEADER_FONT_SIZE),
            ("FONTSIZE", (0, 1), (-1, -1), TABLE_FONT_SIZE),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, 1), (0, -1), LABEL_BG),
            ("TOPPADDING", (0, 0), (-1, -1), TABLE_PADDING),
            ("BOTTOMPADDING", (0, 0), (-1, -1), TABLE_PADDING),
            ("LEFTPADDING", (0, 0), (-1, -1), TABLE_H_PADDING),
            ("RIGHTPADDING", (0, 0), (-1, -1), TABLE_H_PADDING),
        ]
    )


def _summary_table_style() -> TableStyle:
    return TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), HEADER_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), HEADER_TEXT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), TABLE_HEADER_FONT_SIZE),
            ("FONTSIZE", (0, 1), (-1, -2), TABLE_FONT_SIZE),
            ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("TOPPADDING", (0, 0), (-1, -1), TABLE_PADDING),
            ("BOTTOMPADDING", (0, 0), (-1, -1), TABLE_PADDING),
            ("LEFTPADDING", (0, 0), (-1, -1), TABLE_H_PADDING),
            ("RIGHTPADDING", (0, 0), (-1, -1), TABLE_H_PADDING),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LABEL_BG]),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, -1), (-1, -1), TABLE_HEADER_FONT_SIZE),
            ("BACKGROUND", (0, -1), (-1, -1), TOTAL_ROW_BG),
        ]
    )


def build_title(content, styles) -> None:
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=19,
        leading=22,
        alignment=TA_CENTER,
        spaceAfter=4,
        textColor=HEADER_BLUE,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=12,
        leading=14,
        alignment=TA_CENTER,
        spaceAfter=25,
        textColor=colors.HexColor("#475569"),
        fontName="Helvetica",
    )

    content.append(Paragraph("FACULTY PERFORMANCE EVALUATION REPORT", title_style))
    content.append(Paragraph("Summary Report", subtitle_style))


def build_faculty_details(content, styles, evaluation, faculty) -> None:
    heading = _section_heading_style(styles)
    content.append(Paragraph("<b>Faculty Details</b>", heading))

    data = [
        ["Field", "Value"],
        ["Faculty Name", faculty.employee_name if faculty else "N/A"],
        ["Employee ID", faculty.employee_id if faculty else "N/A"],
        ["Department", faculty.department_name if faculty else "N/A"],
        ["Email", faculty.official_email if faculty else "N/A"],
        ["Phone", faculty.phone_number if faculty else "N/A"],
        ["Academic Year", evaluation.academic_year],
        ["Status", evaluation.status],
    ]

    table = Table(data, colWidths=[1.8 * inch, 4.7 * inch])
    table.setStyle(_detail_table_style())
    content.append(table)
    content.append(Spacer(1, 25))


def build_summary_table(content, styles, modules, total_points) -> None:
    heading = _section_heading_style(styles)
    content.append(Paragraph("<b>Performance Summary</b>", heading))

    data = [
        ["Metric", "Points"],
        ["Student Feedback", modules.student_feedback.points],
        ["Conference Articles", modules.conference_articles.points],
        ["Book Chapters", modules.book_chapters.points],
        ["Books", modules.books.points],
        ["IPR", modules.ipr.points],
        ["Funded Projects", modules.funded_projects.points],
        ["FDP Attended", modules.fdp_attended.points],
        ["Talks Delivered", modules.talks_delivered.points],
        ["Department Activities", modules.departmental_activities.points],
        ["Institutional Activities", modules.institutional_activities.points],
        ["FDP Organized", modules.fdp_organized.points],
        ["Total Points", total_points],
    ]

    table = Table(data, colWidths=[4.2 * inch, 1.3 * inch])
    table.setStyle(_summary_table_style())
    content.append(table)


def build_signature_section(content, styles) -> None:
    heading = _section_heading_style(styles)
    content.append(Spacer(1, 35))
    content.append(Paragraph("<b>Approved By HOD</b>", heading))
    content.append(Spacer(1, 10))
    content.append(
        Paragraph(
            "HOD Signature: ________________________",
            styles["Normal"],
        )
    )


def _append_proof_link(content, styles, url):
    if url.startswith("/uploads/"):
        url = f"http://localhost:8000{url}"
    elif url.startswith("uploads/"):
        url = f"http://localhost:8000/{url}"
        
    link_html = f'<link href="{url}" color="blue"><u>View Proof</u></link>'
    content.append(Paragraph(link_html, styles["Normal"]))


def build_detailed_report(content, styles, modules) -> None:
    title_style = ParagraphStyle(
        "DetailedReportTitle",
        parent=styles["Title"],
        fontSize=16,
        leading=18,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=HEADER_BLUE,
        fontName="Helvetica-Bold",
    )
    content.append(Paragraph("Detailed Evaluation Report", title_style))

    module_configs = [
        ("Student Feedback", modules.student_feedback),
        ("Journal Index", getattr(modules, "journal_index", None)),
        ("Conference Articles", modules.conference_articles),
        ("Book Chapters", modules.book_chapters),
        ("Books", modules.books),
        ("IPR", modules.ipr),
        ("Funded Projects", modules.funded_projects),
        ("FDP Attended", modules.fdp_attended),
        ("Talks Delivered", modules.talks_delivered),
        ("Department Activities", modules.departmental_activities),
        ("Institutional Activities", modules.institutional_activities),
        ("FDP Organized", modules.fdp_organized),
    ]

    for title, module_data in module_configs:
        if not module_data:
            continue

        heading = _section_heading_style(styles)
        content.append(Paragraph(f"<b>{title}</b>", heading))
        
        points = getattr(module_data, "points", 0)
        content.append(Paragraph(f"<b>Total Points Awarded:</b> {points}", styles["Normal"]))
        content.append(Spacer(1, 8))
        
        entries = getattr(module_data, "entries", [])
        
        if not entries:
            has_data = False
            data_dict = dict(module_data) if hasattr(module_data, "dict") else vars(module_data)
            for key, val in data_dict.items():
                if key in ["entries", "points"] or val is None or val == "":
                    continue
                key_nice = key.replace("_", " ").title()
                if key in ["proof_file", "screenshot"]:
                    content.append(Paragraph(f"<b>{key_nice}:</b>", styles["Normal"]))
                    content.append(Spacer(1, 4))
                    _append_proof_link(content, styles, val)
                else:
                    content.append(Paragraph(f"<b>{key_nice}:</b> {val}", styles["Normal"]))
                has_data = True
            if has_data:
                content.append(Spacer(1, 15))
            continue
            
        for i, entry in enumerate(entries):
            content.append(Paragraph(f"<u>Entry {i+1}</u>", styles["Normal"]))
            content.append(Spacer(1, 4))
            entry_dict = dict(entry) if hasattr(entry, "dict") else vars(entry)
            for key, val in entry_dict.items():
                if val is None or val == "":
                    continue
                key_nice = key.replace("_", " ").title()
                if key in ["proof_file", "screenshot"]:
                    content.append(Paragraph(f"<b>{key_nice}:</b>", styles["Normal"]))
                    content.append(Spacer(1, 4))
                    _append_proof_link(content, styles, val)
                else:
                    content.append(Paragraph(f"<b>{key_nice}:</b> {val}", styles["Normal"]))
            content.append(Spacer(1, 10))

        content.append(Spacer(1, 10))


def generate_evaluation_pdf(filepath, evaluation, faculty):
    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        leftMargin=0.30 * inch,
        rightMargin=0.30 * inch,
        topMargin=0.25 * inch,
        bottomMargin=0.25 * inch,
    )

    styles = getSampleStyleSheet()
    styles["Normal"].fontSize = 10
    styles["Normal"].leading = 12

    modules = evaluation.modules
    content = []

    build_title(content, styles)
    build_faculty_details(content, styles, evaluation, faculty)
    build_summary_table(content, styles, modules, evaluation.total_points)
    build_signature_section(content, styles)
    content.append(PageBreak())

    build_detailed_report(content, styles, modules)

    doc.build(content)
