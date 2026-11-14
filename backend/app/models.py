from typing import Any, Optional, Literal
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
    user_id: str
    department_name: str
    employee_id: str
    employee_name: str
    orcid_id: str = ""
    official_email: str
    phone_number: str


class StudentFeedbackData(BaseModel):
    percentage: str = ""
    points: int = 0


class MOOCCourseEntry(BaseModel):
    title: str = ""
    proof_file: Optional[str] = None


class MOOCCoursesData(BaseModel):
    entries: list[MOOCCourseEntry] = []
    points: int = 0


class JournalIndexData(BaseModel):
    value: str = ""
    title: str = ""
    scopus_link: str = ""
    issn: str = ""
    eissn: str = ""
    doi: Optional[str] = None
    declaration_accepted: bool = False
    verification: Optional[dict] = None
    points: int = 0


class ConferenceArticle(BaseModel):
    title: str = ""
    proof_file: Optional[str] = None
    verification: Optional[dict] = None


class ConferenceArticlesData(BaseModel):
    entries: list[ConferenceArticle] = []
    points: int = 0

class BookChapter(BaseModel):
    title: str = ""
    proof_file: Optional[str] = None
    verification: Optional[dict] = None


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
    patent_number: Optional[str] = None
    application_number: Optional[str] = None
    patent_link: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    inventors: list[str] = []
    applicants: list[str] = []
    current_holder: Optional[str] = None
    filing_date: Optional[str] = None
    grant_date: Optional[str] = None
    verification_status: Optional[str] = None  # verified | not_verified | not_found | unable_to_verify
    association_type: Optional[str] = None     # inventor | applicant | holder | none
    matched_name: Optional[str] = None
    verification_source: Optional[str] = None
    verified_at: Optional[str] = None
    patent_found: Optional[bool] = None
    inventor_match: Optional[bool] = None


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


class PhDAwardedEntry(BaseModel):
    student_name: str = ""
    thesis_title: str = ""
    year: Optional[str] = ""
    proof_file: Optional[str] = None


class PhDAwardedData(BaseModel):
    entries: list[PhDAwardedEntry] = []
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


class MOUEntry(BaseModel):
    organization: str = ""
    date_signed: Optional[str] = ""
    details: Optional[str] = ""
    proof_file: Optional[str] = None


class MOUSignedData(BaseModel):
    entries: list[MOUEntry] = []
    points: int = 0


class HODDeanRoleData(BaseModel):
    held_role: bool = False
    role_title: str = ""
    details: Optional[str] = ""
    proof_file: Optional[str] = None
    points: int = 0


class IndustrialVisitEntry(BaseModel):
    company_name: str = ""
    date: Optional[str] = ""
    details: Optional[str] = ""
    proof_file: Optional[str] = None


class IndustrialVisitsData(BaseModel):
    entries: list[IndustrialVisitEntry] = []
    points: int = 0


class EvaluationParameter(BaseModel):
    id: Optional[str] = None
    parameter_name: str = ""
    max_points: Optional[float] = None
    entered_value: Optional[Any] = None
    evidence_url: Optional[str] = None
    proof_file: Optional[str] = None
    verification_status: Optional[str] = None
    awarded_points: Optional[float] = None
    remarks: Optional[str] = None


class PartAData(BaseModel):
    title: str = "Part A — Teaching, Learning and Professional Development (TLP)"
    parameters: list[EvaluationParameter] = []


class PartBData(BaseModel):
    title: str = "Part B — Research and Academic Contributions"
    parameters: list[EvaluationParameter] = []


class PartCData(BaseModel):
    title: str = "Part C — Others"
    parameters: list[EvaluationParameter] = []


class EvaluationModules(BaseModel):
    student_feedback: StudentFeedbackData = StudentFeedbackData()
    mooc_courses: MOOCCoursesData = MOOCCoursesData()
    journal_index: JournalIndexData = JournalIndexData()
    conference_articles: ConferenceArticlesData = ConferenceArticlesData()
    book_chapters: BookChaptersData = BookChaptersData()
    books: BooksData = BooksData()
    ipr: IPRData = IPRData()
    funded_projects: FundedProjectsData = FundedProjectsData()
    phd_awarded: PhDAwardedData = PhDAwardedData()
    fdp_attended: FDPAttendedData = FDPAttendedData()
    talks_delivered: TalksData = TalksData()
    departmental_activities: DeptActivitiesData = DeptActivitiesData()
    institutional_activities: InstActivitiesData = InstActivitiesData()
    fdp_organized: FDPOrganizedData = FDPOrganizedData()
    mou_signed: MOUSignedData = MOUSignedData()
    hod_dean_role: HODDeanRoleData = HODDeanRoleData()
    industrial_visits: IndustrialVisitsData = IndustrialVisitsData()
    part_a: PartAData = PartAData()
    part_b: PartBData = PartBData()
    part_c: PartCData = PartCData()


class Evaluation(BaseModel):
    id: Optional[str] = None
    faculty_id: str
    faculty: Optional[FacultyProfile] = None
    ef_id: Optional[str] = None
    academic_year: str = ""
    faculty_position: Literal[
        "assistant_professor",
        "associate_professor",
        "professor"
    ] = "associate_professor"
    position: Optional[str] = None
    status: str = "draft"  # draft | pending | hod_approved | approved | rejected
    modules: EvaluationModules = EvaluationModules()
    part_a: Optional[PartAData] = None
    part_b: Optional[PartBData] = None
    part_c: Optional[PartCData] = None
    total_points: int = 0
    approved_at: Optional[str] = None
    approved_by: Optional[str] = None
    reject_reason: Optional[str] = None
    # Revision workflow
    revision_status: str | None = None
    revision_requested: bool = False
    revision_reason: str | None = None
    revision_feedback: str | None = None
    faculty_signature: Optional[str] = None
    hod_signature: Optional[str] = None
    principal_signature: Optional[str] = None
