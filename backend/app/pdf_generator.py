from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet


def generate_evaluation_pdf(
    filepath,
    evaluation,
    faculty
):
    doc = SimpleDocTemplate(filepath)

    styles = getSampleStyleSheet()

    modules = evaluation.modules

    content = []

    # Title
    content.append(
        Paragraph(
            "Faculty Performance Evaluation Report",
            styles["Title"]
        )
    )

    content.append(Spacer(1, 20))

    # Faculty Details
    content.append(
        Paragraph(
            f"<b>Faculty Name:</b> {faculty.employee_name if faculty else 'N/A'}",
            styles["Normal"]
        )
    )

    content.append(
        Paragraph(
            f"<b>Employee ID:</b> {faculty.employee_id if faculty else 'N/A'}",
            styles["Normal"]
        )
    )

    content.append(
        Paragraph(
            f"<b>Department:</b> {faculty.department_name if faculty else 'N/A'}",
            styles["Normal"]
        )
    )

    content.append(
        Paragraph(
            f"<b>Email:</b> {faculty.official_email if faculty else 'N/A'}",
            styles["Normal"]
        )
    )

    content.append(
        Paragraph(
            f"<b>Phone:</b> {faculty.phone_number if faculty else 'N/A'}",
            styles["Normal"]
        )
    )

    content.append(Spacer(1, 10))

    content.append(
        Paragraph(
            f"<b>Academic Year:</b> {evaluation.academic_year}",
            styles["Normal"]
        )
    )

    content.append(
        Paragraph(
            f"<b>Status:</b> {evaluation.status}",
            styles["Normal"]
        )
    )

    content.append(
        Paragraph(
            f"<b>Total Points:</b> {evaluation.total_points}",
            styles["Normal"]
        )
    )

    content.append(Spacer(1, 20))

    # Score Table
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
        ["Institution Activities", modules.institutional_activities.points],
        ["FDP Organized", modules.fdp_organized.points],
    ]

    table = Table(data, colWidths=[250, 100])

    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        )
    )

    content.append(table)

    content.append(Spacer(1, 40))

    content.append(
        Paragraph(
            "<b>Approved By HOD</b>",
            styles["Heading3"]
        )
    )

    content.append(Spacer(1, 25))

    content.append(
        Paragraph(
            "HOD Signature: ________________________",
            styles["Normal"]
        )
    )

    doc.build(content)