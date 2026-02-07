from typing import Any, Optional
from pydantic import BaseModel


class User(BaseModel):
    id: str
    email: str
    name: str
    role: str  # hod | faculty | principal
    department: Optional[str] = None
    password_hash: Optional[str] = None


class FacultyProfile(BaseModel):
    id: str
    department_name: str
    employee_id: str
    employee_name: str
    orcid_id: str = ""
    official_email: str
    phone_number: str


class StudentFeedbackData(BaseModel):
    percentage: str = ""
    points: int = 0


class JournalIndexData(BaseModel):
    value: str = ""


class ConferenceArticle(BaseModel):
    title: str = ""
    proof_file: Optional[str] = None


class ConferenceArticlesData(BaseModel):
    entries: list[ConferenceArticle] = []
    points: int = 0


class BookChapter(BaseModel):
    title: str = ""
    proof_file: Optional[str] = None


class BookChaptersData(BaseModel):
    entries: list[BookChapter] = []
    points: int = 0


class BookEntry(BaseModel):
    title: str = ""
    type: str = "authored"  # authored | edited
    proof_file: Optional[str] = None


class BooksData(BaseModel):
    entries: list[BookEntry] = []
    points: int = 0


class IPREntry(BaseModel):
    type: str = "patent"  # patent | copyright | trademark
    description: str = ""
    proof_file: Optional[str] = None


class IPRData(BaseModel):
    entries: list[IPREntry] = []
    points: int = 0


class FundedProjectEntry(BaseModel):
    amount_lakhs: float = 0
    description: str = ""
    proof_file: Optional[str] = None


class FundedProjectsData(BaseModel):
    entries: list[FundedProjectEntry] = []
    points: int = 0


class FDPAttendedEntry(BaseModel):
    name: str = ""
    days: int = 0
    proof_file: Optional[str] = None


class FDPAttendedData(BaseModel):
    entries: list[FDPAttendedEntry] = []
    points: int = 0


class TalkEntry(BaseModel):
    title: str = ""
    proof_file: Optional[str] = None


class TalksData(BaseModel):
    entries: list[TalkEntry] = []
    points: int = 0


class DeptActivityEntry(BaseModel):
    description: str = ""
    proof_file: Optional[str] = None


class DeptActivitiesData(BaseModel):
    entries: list[DeptActivityEntry] = []
    points: int = 0


class InstActivityEntry(BaseModel):
    description: str = ""
    proof_file: Optional[str] = None


class InstActivitiesData(BaseModel):
    entries: list[InstActivityEntry] = []
    points: int = 0


class FDPOrganizedEntry(BaseModel):
    name: str = ""
    days: int = 0
    proof_file: Optional[str] = None


class FDPOrganizedData(BaseModel):
    entries: list[FDPOrganizedEntry] = []
    points: int = 0


class EvaluationModules(BaseModel):
    student_feedback: StudentFeedbackData = StudentFeedbackData()
    journal_index: JournalIndexData = JournalIndexData()
    conference_articles: ConferenceArticlesData = ConferenceArticlesData()
    book_chapters: BookChaptersData = BookChaptersData()
    books: BooksData = BooksData()
    ipr: IPRData = IPRData()
    funded_projects: FundedProjectsData = FundedProjectsData()
    fdp_attended: FDPAttendedData = FDPAttendedData()
    talks_delivered: TalksData = TalksData()
    departmental_activities: DeptActivitiesData = DeptActivitiesData()
    institutional_activities: InstActivitiesData = InstActivitiesData()
    fdp_organized: FDPOrganizedData = FDPOrganizedData()


class Evaluation(BaseModel):
    id: Optional[str] = None
    faculty_id: str
    faculty: Optional[FacultyProfile] = None
    academic_year: str = ""
    status: str = "draft"  # draft | submitted | faculty_signed | hod_signed | approved
    modules: EvaluationModules = EvaluationModules()
    total_points: int = 0
    faculty_signature: Optional[str] = None
    hod_signature: Optional[str] = None
    principal_signature: Optional[str] = None
