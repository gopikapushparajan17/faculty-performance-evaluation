export type EvaluationStatus =
  | 'draft'
  | 'pending'
  | 'hod_approved'
  | 'approved'
  | 'rejected'
  export type RevisionStatus =
  | 'none'
  | 'pending'
  | 'approved'
  | 'rejected'

  export type FacultyPosition =
  | 'assistant_professor'
  | 'associate_professor'
  | 'professor'

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

export interface MOOCCourseEntry {
  title: string
  proof_file?: string
}

export interface MOOCCoursesData {
  entries: MOOCCourseEntry[]
  points: number
}

export interface JournalIndexVerification {
  publication_found?: boolean
  submission_method?: string
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
  web_of_science?: {
    status?: string
    source?: string
    records_found?: number
    message?: string
    data?: unknown
  }
}


export interface JournalIndexData {
  value: string
  title?: string
  scopus_link?: string
  issn?: string
  eissn?: string
  doi?: string
  declaration_accepted?: boolean
  points?: number
  verification?: JournalIndexVerification
}


// Module 3: Conference Articles (max 4, 4 pts each)
export interface ConferenceArticle {
  title: string
  proof_file?: string
  verification?: JournalIndexVerification
}
export interface ConferenceArticlesData {
  entries: ConferenceArticle[]
  points: number
}

// Module 4: Book Chapters (max 4, 6 pts each)
export interface BookChapter {
  title: string
  proof_file?: string
  verification?: JournalIndexVerification
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

export interface PatentVerificationResult {
  verification_status: 'verified' | 'not_verified' | 'not_found' | 'unable_to_verify'
  association_type: 'inventor' | 'applicant' | 'holder' | 'none' | null
  matched_name: string | null
  patent_number: string | null
  application_number: string | null
  title: string | null
  status: string | null
  inventors: string[]
  applicants: string[]
  current_holder: string | null
  filing_date: string | null
  grant_date: string | null
  verification_source: string | null
  verified_at: string | null
  patent_found?: boolean
  inventor_match?: boolean
}

// Module 6: IPR (unlimited)
export interface IPREntry {
  type: 'patent' | 'copyright' | 'trademark'
  description: string
  proof_file?: string
  patent_number?: string | null
  application_number?: string | null
  patent_link?: string | null
  title?: string | null
  status?: string | null
  inventors?: string[]
  applicants?: string[]
  current_holder?: string | null
  filing_date?: string | null
  grant_date?: string | null
  verification_status?: 'verified' | 'not_verified' | 'not_found' | 'unable_to_verify' | null
  association_type?: 'inventor' | 'applicant' | 'holder' | 'none' | null
  matched_name?: string | null
  verification_source?: string | null
  verified_at?: string | null
  patent_found?: boolean | null
  inventor_match?: boolean | null
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

export interface PhDAwardedEntry {
  student_name: string
  thesis_title: string
  year?: string
  proof_file?: string
}
export interface PhDAwardedData {
  entries: PhDAwardedEntry[]
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

// Factor 2: Conferences Organised
export interface ConferenceOrganizedData {
  role: 'General Chair' | 'Session Chair' | ''
  confirmed: boolean
  details?: string
  proof_file?: string
  points: number
}

export interface MOUEntry {
  organization: string
  date_signed?: string
  details?: string
  proof_file?: string
}
export interface MOUSignedData {
  entries: MOUEntry[]
  points: number
}

export interface HODDeanRoleData {
  held_role: boolean
  role_title?: string
  details?: string
  proof_file?: string
  points: number
}

export interface IndustrialVisitEntry {
  company_name: string
  date?: string
  details?: string
  proof_file?: string
}
export interface IndustrialVisitsData {
  entries: IndustrialVisitEntry[]
  points: number
}

export interface EvaluationParameter {
  id?: string
  parameter_name: string
  max_points?: number
  entered_value?: any
  evidence_url?: string
  proof_file?: string
  verification_status?: string
  awarded_points?: number
  remarks?: string
}

export interface PartAData {
  title?: string
  parameters: EvaluationParameter[]
}

export interface PartBData {
  title?: string
  parameters: EvaluationParameter[]
}

export interface PartCData {
  title?: string
  parameters: EvaluationParameter[]
}

export interface EvaluationModules {
  student_feedback: StudentFeedbackData
  mooc_courses?: MOOCCoursesData
  journal_index: JournalIndexData
  conference_articles: ConferenceArticlesData
  book_chapters: BookChaptersData
  books: BooksData
  ipr: IPRData
  funded_projects: FundedProjectsData
  phd_awarded?: PhDAwardedData
  fdp_attended: FDPAttendedData
  talks_delivered: TalksData
  departmental_activities: DeptActivitiesData
  institutional_activities: InstActivitiesData
  fdp_organized: FDPOrganizedData
  conference_organized?: ConferenceOrganizedData
  mou_signed?: MOUSignedData
  hod_dean_role?: HODDeanRoleData
  industrial_visits?: IndustrialVisitsData
  part_a?: PartAData
  part_b?: PartBData
  part_c?: PartCData
}

export interface Evaluation {
  id: string
  faculty_id: string
  faculty?: FacultyProfile
  faculty_position?: FacultyPosition
  position?: string
  ef_id?: string
  academic_year: string
  status: EvaluationStatus
  modules: EvaluationModules
  part_a?: PartAData
  part_b?: PartBData
  part_c?: PartCData
  total_points: number
  approved_at?: string
  approved_by?: string
  reject_reason?: string
  revision_requested?: boolean
  revision_reason?: string | null
  revision_status?: RevisionStatus
  revision_feedback?: string | null
  faculty_signature?: string
  hod_signature?: string
  created_at?: string
  updated_at?: string
}
