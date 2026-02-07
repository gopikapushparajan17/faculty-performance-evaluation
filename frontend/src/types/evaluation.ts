export type EvaluationStatus = 'draft' | 'submitted' | 'faculty_signed' | 'hod_signed' | 'approved'

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

// Module 1: Student Feedback
export interface StudentFeedbackData {
  percentage: string
  points: number
}

// Module 2: Journal Index (disabled)
export interface JournalIndexData {
  value: string
}

// Module 3: Conference Articles (max 4, 4 pts each)
export interface ConferenceArticle {
  title: string
  proof_file?: string
}
export interface ConferenceArticlesData {
  entries: ConferenceArticle[]
  points: number
}

// Module 4: Book Chapters (max 4, 6 pts each)
export interface BookChapter {
  title: string
  proof_file?: string
}
export interface BookChaptersData {
  entries: BookChapter[]
  points: number
}

// Module 5: Authored/Edited Books (max 3)
export interface BookEntry {
  title: string
  type: 'authored' | 'edited'
  proof_file?: string
}
export interface BooksData {
  entries: BookEntry[]
  points: number
}

// Module 6: IPR (unlimited)
export interface IPREntry {
  type: 'patent' | 'copyright' | 'trademark'
  description: string
  proof_file?: string
}
export interface IPRData {
  entries: IPREntry[]
  points: number
}

// Module 7: Funded Projects
export interface FundedProjectEntry {
  amount_lakhs: number
  description: string
  proof_file?: string
}
export interface FundedProjectsData {
  entries: FundedProjectEntry[]
  points: number
}

// Module 8: FDP/Workshops Attended (max 2)
export interface FDPAttendedEntry {
  name: string
  days: number
  proof_file?: string
}
export interface FDPAttendedData {
  entries: FDPAttendedEntry[]
  points: number
}

// Module 9: Talks Delivered (max 2, 5 pts each)
export interface TalkEntry {
  title: string
  proof_file?: string
}
export interface TalksData {
  entries: TalkEntry[]
  points: number
}

// Module 10: Departmental Activities (max 3, 3 pts each)
export interface DeptActivityEntry {
  description: string
  proof_file?: string
}
export interface DeptActivitiesData {
  entries: DeptActivityEntry[]
  points: number
}

// Module 11: Institutional Activities (max 3, 5 pts each)
export interface InstActivityEntry {
  description: string
  proof_file?: string
}
export interface InstActivitiesData {
  entries: InstActivityEntry[]
  points: number
}

// Module 12: FDP/Workshops/Conferences Organized (max 2)
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
  academic_year: string
  status: EvaluationStatus
  modules: EvaluationModules
  total_points: number
  faculty_signature?: string
  hod_signature?: string
  principal_signature?: string
  created_at?: string
  updated_at?: string
}
