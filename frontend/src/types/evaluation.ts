export type EvaluationStatus =
  | 'draft'
  | 'faculty_approved'
  | 'hod_approved'
  | 'principal_approved'
  | 'rejected'

export interface ApprovalEntry {
  name: string
  signed_at: string
}

export interface Approvals {
  faculty?: ApprovalEntry
  hod?: ApprovalEntry
  principal?: ApprovalEntry
}

export interface FacultyProfile {
  id: string
  department_name: string
  employee_id: string
  employee_name: string
  orcid_id: string
  official_email: string
  phone_number: string
  created_at?: string
}

export interface StudentFeedbackData {
  percentage: string
  points: number
}

export interface JournalIndexData {
  value: string
  title?: string
  scopus_link?: string
}

export interface ConferenceArticle {
  title: string
  proof_file?: string
}
export interface ConferenceArticlesData {
  entries: ConferenceArticle[]
  points: number
}

export interface BookChapter {
  title: string
  proof_file?: string
}
export interface BookChaptersData {
  entries: BookChapter[]
  points: number
}

export interface BookEntry {
  title: string
  type: 'authored' | 'edited'
  proof_file?: string
}
export interface BooksData {
  entries: BookEntry[]
  points: number
}

export interface IPREntry {
  type: 'patent' | 'copyright' | 'trademark'
  description: string
  proof_file?: string
}
export interface IPRData {
  entries: IPREntry[]
  points: number
}

export interface FundedProjectEntry {
  amount_lakhs: number
  description: string
  proof_file?: string
}
export interface FundedProjectsData {
  entries: FundedProjectEntry[]
  points: number
}

export interface FDPAttendedEntry {
  name: string
  days: number
  proof_file?: string
}
export interface FDPAttendedData {
  entries: FDPAttendedEntry[]
  points: number
}

export interface TalkEntry {
  title: string
  proof_file?: string
}
export interface TalksData {
  entries: TalkEntry[]
  points: number
}

export interface DeptActivityEntry {
  description: string
  proof_file?: string
}
export interface DeptActivitiesData {
  entries: DeptActivityEntry[]
  points: number
}

export interface InstActivityEntry {
  description: string
  proof_file?: string
}
export interface InstActivitiesData {
  entries: InstActivityEntry[]
  points: number
}

export interface FDPOrganizedEntry {
  name: string
  days: number
  proof_file?: string
}
export interface FDPOrganizedData {
  entries: FDPOrganizedEntry[]
  points: number
}

export interface EvaluationModules {
  student_feedback: StudentFeedbackData
  journal_index: JournalIndexData
  conference_articles: ConferenceArticlesData
  book_chapters: BookChaptersData
  books: BooksData
  ipr: IPRData
  funded_projects: FundedProjectsData
  fdp_attended: FDPAttendedData
  talks_delivered: TalksData
  departmental_activities: DeptActivitiesData
  institutional_activities: InstActivitiesData
  fdp_organized: FDPOrganizedData
}

export interface Evaluation {
  id: string
  faculty_id: string
  faculty?: FacultyProfile
  ef_id?: string
  academic_year: string
  status: EvaluationStatus
  modules: EvaluationModules
  total_points: number
  approved_at?: string
  approved_by?: string
  reject_reason?: string
  faculty_signature?: string
  hod_signature?: string
  principal_signature?: string
  approvals?: Approvals
  pdf_viewed_by?: Record<string, { user_id: string; viewed_at: string }>
  created_at?: string
  updated_at?: string
}
