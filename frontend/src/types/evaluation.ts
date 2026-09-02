export type EvaluationStatus = 'draft' | 'pending' | 'approved' | 'rejected'

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

export interface JournalIndexVerification {
  publication_found?: boolean
  doi?: string
  scopus_eid?: string
  publication_type?: string
  is_conference_paper?: boolean

  title?: string

  authors?: Array<{
    given?: string
    family?: string
    full_name?: string
    orcid?: string
    affiliations?: string[]
  }>

  journal?: string
  issn?: string
  eissn?: string
  isbn?: string
  publisher?: string
  source_url?: string

  error?: string | null

  author_match?: boolean
  matched_author?: string | null
  author_match_error?: string

  scopus_status?: string
  scopus_evidence_url?: string | null

  scopus_source?: {
    status?: string
    source_title?: string
    issn?: string
    eissn?: string
    coverage?: string
    active?: boolean
    source_type?: string
    matched_by?: string
    message?: string
  }
}

export interface JournalIndexData {
  value: string
  title?: string
  scopus_link?: string
  verification?: JournalIndexVerification
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
  created_at?: string
  updated_at?: string
}
