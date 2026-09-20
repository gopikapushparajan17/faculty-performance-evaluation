import ast
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

RAW_VERIFICATION_FIELD_NAMES = frozenset({
    "data",
    "raw_data",
    "response",
    "raw_response",
    "verification_data",
})


def _is_raw_verification_field(field_name) -> bool:
    return str(field_name).strip().lower() in RAW_VERIFICATION_FIELD_NAMES


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
        ["Faculty Position", {
            "assistant_professor": "Assistant Professor",
            "associate_professor": "Associate Professor",
            "professor": "Professor",
        }.get(getattr(evaluation, "faculty_position", None) or "associate_professor", "Associate Professor")],
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
        ["Journal Index", modules.journal_index.points],
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

    detail_label_style = ParagraphStyle(
        "DetailLabel",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=12,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#1e293b"),
    )

    detail_value_style = ParagraphStyle(
        "DetailValue",
        parent=styles["Normal"],
        fontSize=9.5,
        leading=12,
        fontName="Helvetica",
        textColor=colors.HexColor("#334155"),
    )

    content.append(Paragraph("Detailed Evaluation Report", title_style))

    def proof_paragraph(url):
        if not url:
            return ""

        url = str(url)

        if url.startswith("/uploads/"):
            url = f"http://localhost:8000{url}"
        elif url.startswith("uploads/"):
            url = f"http://localhost:8000/{url}"

        return Paragraph(
            f'<link href="{url}" color="blue"><u>View Proof</u></link>',
            detail_value_style,
        )

    def clean_value(value):
        if value is None:
            return ""
        return str(value)

    def make_table(rows):
        if not rows:
            return

        table_rows = []

        for label, value in rows:
            if value is None or value == "":
                continue

            if not isinstance(value, Paragraph):
                value = Paragraph(clean_value(value), detail_value_style)

            table_rows.append([
                Paragraph(clean_value(label), detail_label_style),
                value,
            ])

        if not table_rows:
            return

        table = Table(
            table_rows,
            colWidths=[1.75 * inch, 5.35 * inch],
            hAlign="LEFT",
        )

        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, -1), LABEL_BG),
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))

        content.append(table)
        content.append(Spacer(1, 12))

    def to_plain_object(value):
        """
        Convert Pydantic/model objects and dictionary-looking strings
        into normal Python dictionaries/lists where possible.
        """
        if hasattr(value, "model_dump"):
            return value.model_dump()

        if hasattr(value, "dict"):
            return value.dict()

        if isinstance(value, dict):
            return value

        if isinstance(value, list):
            return [to_plain_object(item) for item in value]

        if isinstance(value, str):
            text = value.strip()

            if (
                (text.startswith("{") and text.endswith("}"))
                or (text.startswith("[") and text.endswith("]"))
            ):
                try:
                    parsed = ast.literal_eval(text)
                    return to_plain_object(parsed)
                except (ValueError, SyntaxError):
                    pass

        return value

    def verification_rows(verification):
        if not verification:
            return []

        data = to_plain_object(verification)

        if not isinstance(data, dict):
            return []

        rows = []

        preferred_order = [
            "publication_found",
            "doi",
            "title",
            "journal",
            "publisher",
            "authors",
            "author_match",
            "matched_author",
            "scopus_status",
            "scopus_source",
            "coverage",
            "active",
            "source_type",
            "issn",
            "eissn",
            "publication_type",
            "is_conference_paper",
            "source_url",
            "scopus_evidence_url",
            "web_of_science",
            "web_of_science_status",
            "web_of_science_source",
            "author_match_error",
            "error",
        ]

        def add_row(label, value, field_key=None):
            key_to_check = field_key if field_key is not None else str(label).replace(" ", "_")
            if _is_raw_verification_field(key_to_check):
                return

            if value is None or value == "":
                return

            value = to_plain_object(value)

            # Authors: show only readable author names instead of
            # printing each author dictionary.
            if label.lower() == "authors" and isinstance(value, list):
                names = []

                for author in value:
                    author = to_plain_object(author)

                    if isinstance(author, dict):
                        name = author.get("full_name")

                        if not name:
                            given = author.get("given", "")
                            family = author.get("family", "")
                            name = f"{given} {family}".strip()

                        if name:
                            names.append(str(name))
                    else:
                        names.append(str(author))

                if names:
                    rows.append(("Authors", ", ".join(names)))

                return

            # Scopus Source / Web of Science are expanded into
            # individual rows instead of displaying a dictionary.
            if isinstance(value, dict):
                for nested_key, nested_value in value.items():
                    if _is_raw_verification_field(nested_key):
                        continue

                    if nested_value is None or nested_value == "":
                        continue

                    nested_value = to_plain_object(nested_value)
                    nested_label = str(nested_key).replace("_", " ").title()

                    if isinstance(nested_value, list):
                        if all(isinstance(item, dict) for item in nested_value):
                            nested_value = ", ".join(
                                str(item.get("full_name", item))
                                for item in nested_value
                            )
                        else:
                            nested_value = ", ".join(map(str, nested_value))

                    elif isinstance(nested_value, dict):
                        nested_value = str(nested_value)

                    # For nested verification objects, use clean field names:
                    # Status, Source Title, ISSN, EISSN, etc.
                    if label.lower() in ["scopus source", "web of science"]:
                        final_label = nested_label
                    else:
                        final_label = f"{label} {nested_label}"

                    rows.append((final_label, nested_value))

                return

            if isinstance(value, list):
                value = ", ".join(map(str, value))

            rows.append((label, value))

        used = set()

        for key in preferred_order:
            if key not in data or _is_raw_verification_field(key):
                continue

            used.add(key)
            label = key.replace("_", " ").title()
            add_row(label, data[key], key)

        # Render any extra fields without losing them.
        for key, value in data.items():
            if key in used or _is_raw_verification_field(key):
                continue

            label = str(key).replace("_", " ").title()
            add_row(label, value, key)

        return rows

    def module_dict(module_data):
        if hasattr(module_data, "model_dump"):
            return module_data.model_dump()

        if hasattr(module_data, "dict"):
            return module_data.dict()

        if hasattr(module_data, "__dict__"):
            return vars(module_data)

        return {}

    def add_module(title, module_data):
        if not module_data:
            return

        heading = _section_heading_style(styles)
        content.append(Paragraph(f"<b>{title}</b>", heading))

        points = getattr(module_data, "points", 0)
        make_table([("Total Points Awarded", points)])

        # Student Feedback
        if title == "Student Feedback":
            percentage = getattr(module_data, "percentage", None)

            if percentage is not None and percentage != "":
                make_table([("Percentage", percentage)])

            return

        # Journal Index
        if title == "Journal Index":
            rows = []

            if getattr(module_data, "title", ""):
                rows.append(("Title", module_data.title))

            if getattr(module_data, "scopus_link", ""):
                rows.append(("Scopus Link", module_data.scopus_link))

            make_table(rows)

            verification = getattr(module_data, "verification", None)

            if verification:
                make_table(verification_rows(verification))

            return

        # All remaining modules have entries.
        entries = getattr(module_data, "entries", []) or []

        for i, entry in enumerate(entries):
            entry_data = module_dict(entry)

            rows = [("Entry", i + 1)]

            for key, value in entry_data.items():
                if value is None or value == "":
                    continue

                # Verification is rendered separately below.
                if key == "verification":
                    continue

                key_nice = key.replace("_", " ").title()

                if key in ["proof_file", "screenshot"]:
                    rows.append((key_nice, proof_paragraph(value)))
                else:
                    value = to_plain_object(value)

                    # Avoid printing nested dictionaries for normal entry data.
                    if isinstance(value, dict):
                        for nested_key, nested_value in value.items():
                            nested_label = (
                                f"{key_nice} "
                                f"{str(nested_key).replace('_', ' ').title()}"
                            )
                            rows.append((nested_label, nested_value))
                    elif isinstance(value, list):
                        rows.append((
                            key_nice,
                            ", ".join(map(str, value)),
                        ))
                    else:
                        rows.append((key_nice, value))

            make_table(rows)

            verification = entry_data.get("verification")

            if verification:
                make_table(verification_rows(verification))

    # Every detailed module uses the SAME aligned two-column table layout.
    add_module("Student Feedback", modules.student_feedback)
    add_module("Journal Index", getattr(modules, "journal_index", None))
    add_module("Conference Articles", modules.conference_articles)
    add_module("Book Chapters", modules.book_chapters)
    add_module("Books", modules.books)
    add_module("IPR", modules.ipr)
    add_module("Funded Projects", modules.funded_projects)
    add_module("FDP Attended", modules.fdp_attended)
    add_module("Talks Delivered", modules.talks_delivered)
    add_module("Department Activities", modules.departmental_activities)
    add_module("Institutional Activities", modules.institutional_activities)
    add_module("FDP Organized", modules.fdp_organized)

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
