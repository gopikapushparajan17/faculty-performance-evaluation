import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { api, verifyPatent } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ModuleCard from '../components/ModuleCard'
import ProofUpload from '../components/ProofUpload'
import {
  studentFeedbackPoints,
  moocCoursesPoints,
  computeDeptAndInstPoints,
  journalIndexPoints,
  conferencePoints,
  bookChaptersPoints,
  booksPoints,
  iprPoints,
  fundedPoints,
  phdAwardedPoints,
  fdpOrganizedPoints,
  talksPoints,
  mouSignedPoints,
  hodDeanPoints,
  industrialVisitsPoints,
  fdpAttendedPoints,
} from '../lib/pointRules'
import { getPositionTitle, calculateEligibility } from '../lib/positionRules'
import type {
  Evaluation,
  EvaluationModules,
  FacultyPosition,
  FacultyProfile,
  JournalIndexVerification,
} from '../types/evaluation'

const defaultModules: EvaluationModules = {
  student_feedback: { percentage: '', points: 0 },
  mooc_courses: { entries: [], points: 0 },
  departmental_activities: { entries: [], points: 0 },
  institutional_activities: { entries: [], points: 0 },
  journal_index: { value: '', title: '', scopus_link: '', issn: '', eissn: '', doi: '', declaration_accepted: false, points: 0 },
  conference_articles: { entries: [], points: 0 },
  book_chapters: { entries: [], points: 0 },
  books: { entries: [], points: 0 },
  ipr: { entries: [], points: 0 },
  funded_projects: { entries: [], points: 0 },
  phd_awarded: { entries: [], points: 0 },
  fdp_organized: { entries: [], points: 0 },
  talks_delivered: { entries: [], points: 0 },
  mou_signed: { entries: [], points: 0 },
  hod_dean_role: { held_role: false, role_title: '', proof_file: '', points: 0 },
  industrial_visits: { entries: [], points: 0 },
  fdp_attended: { entries: [], points: 0 },
}

const SCOPUS_REGEX = /^https:\/\/www\.scopus\.com\/.*/i
const isValidScopus = (url?: string) =>
  !!url && SCOPUS_REGEX.test(url.trim())

const hasText = (v?: string) => !!v && v.trim().length > 0
const isValidPublicationUrl = (url?: string) =>
  !!url && (/^https?:\/\/.+/i.test(url.trim()) || /^10\.\d{4,9}\/\S+$/i.test(url.trim()))
const isValidFileProof = (url?: string) => !!url && url.trim().length > 0 && !isValidPublicationUrl(url)

function authorVerified(verification?: JournalIndexVerification): boolean {
  return !!verification?.publication_found && verification.author_match === true
}

function isAnyIndexVerified(
  verification?: JournalIndexVerification,
): boolean {
  if (!verification) return false

  // Crossref
  if (verification.publication_found === true) {
    return true
  }

  // Scopus article-level verification
  if (verification.scopus_status === 'indexed') {
    return true
  }

  // Scopus source-level verification
  if (verification.scopus_source?.status === 'source_covered') {
    return true
  }

  // Web of Science article-level verification
  if (verification.web_of_science?.status === 'indexed') {
    return true
  }

  return false
}

function isVerifiedPublication(verification?: JournalIndexVerification): boolean {
  if (!authorVerified(verification)) {
    return false
  }

  // For title + ISSN submissions, require article-level verification.
  // Journal source coverage alone is not enough.
  if (verification?.submission_method === 'title_issn') {
    return (
      verification.scopus_status === 'indexed' ||
      verification.web_of_science?.status === 'indexed'
    )
  }

  // Preserve the existing DOI and other verification behavior.
  return isAnyIndexVerified(verification)
}

type FormValues = Omit<Evaluation, 'id' | 'created_at' | 'updated_at'> & { id?: string }

export default function EvaluationForm() {
  const { evaluationId, facultyId } = useParams<{ evaluationId?: string; facultyId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [verificationLoading, setVerificationLoading] = useState(false)
  const [verificationError, setVerificationError] = useState('')
  const [conferenceVerificationLoading, setConferenceVerificationLoading] = useState<Record<number, boolean>>({})
  const [conferenceVerificationError, setConferenceVerificationError] = useState<Record<number, string>>({})

  const [bookChapterVerificationLoading, setBookChapterVerificationLoading] = useState<Record<number, boolean>>({})
  const [bookChapterVerificationError, setBookChapterVerificationError] = useState<Record<number, string>>({})
  
  const editId = evaluationId

  const [workflowStep, setWorkflowStep] = useState<'setup' | 'evaluation'>(editId ? 'evaluation' : 'setup')
  const [selectedPosition, setSelectedPosition] = useState<FacultyPosition | ''>(editId ? 'associate_professor' : '')
  const [setupError, setSetupError] = useState('')
  const [activeTab, setActiveTab] = useState<'part_a' | 'part_b' | 'part_c'>('part_a')
  const [journalDuplicate, setJournalDuplicate] = useState<{ is_duplicate: boolean; duplicate_by?: { faculty_name: string; employee_id: string } } | null>(null)

  const form = useForm<FormValues>({
    defaultValues: {
      faculty_id: facultyId ?? '',
      academic_year: new Date().getFullYear().toString(),
      faculty_position: 'associate_professor',
      status: 'draft',
      modules: defaultModules,
      total_points: 0,
    },
  })

  const modules = useWatch({ control: form.control, name: 'modules', defaultValue: defaultModules })
  const facultyPosition = (useWatch({ control: form.control, name: 'faculty_position' }) ?? 'associate_professor') as FacultyPosition

  const checkDuplicate = async (doiVal?: string, titleVal?: string) => {
    try {
      const { data } = await api.post('/evaluations/check-journal-duplicate', {
        faculty_id: form.getValues('faculty_id'),
        doi: doiVal,
        title: titleVal,
        evaluation_id: editId,
      })
      setJournalDuplicate(data)
    } catch {
      // ignore
    }
  }

  const computed = useMemo(() => {
    const m = modules ?? defaultModules

    // ========================================================================
    // TLP: Student Feedback (80-100% = 30, 60-<80% = 20, <60% = 0)
    // ========================================================================
    const sf = hasText(m.student_feedback?.percentage)
      ? studentFeedbackPoints(Number(m.student_feedback!.percentage))
      : 0

    // MOOC Courses: 5 each, max 2
    const moocEntries = m.mooc_courses?.entries ?? []
    const validMooc = moocEntries.filter((e) => hasText(e.title) && isValidFileProof(e.proof_file))
    const mooc = moocCoursesPoints(validMooc.length)

    // Departmental (3 each) & Institutional (5 each) - Combined max 2 entries
    const deptEntries = m.departmental_activities?.entries ?? []
    const validDept = deptEntries.filter((e) => hasText(e.description) && isValidFileProof(e.proof_file))

    const instEntries = m.institutional_activities?.entries ?? []
    const validInst = instEntries.filter((e) => hasText(e.description) && isValidFileProof(e.proof_file))

    const { deptPoints: dept, instPoints: inst } = computeDeptAndInstPoints(validDept.length, validInst.length)

    // ========================================================================
    // RESEARCH
    // ========================================================================
    // 1. Journal Index: 30 marks per verified paper
    const journalName = m.journal_index?.title || m.journal_index?.value
    const hasJournalEvidence =
      hasText(m.journal_index?.scopus_link) ||
      hasText(m.journal_index?.issn) ||
      hasText(m.journal_index?.eissn) ||
      hasText(m.journal_index?.doi)

    const isJournalVerified =
      hasText(journalName) &&
      hasJournalEvidence &&
      isVerifiedPublication(m.journal_index?.verification)

    const journal = journalIndexPoints(isJournalVerified)

    // 2. Conference Articles: 5 each, max 2
    const confEntries = m.conference_articles?.entries ?? []
    const validConf = confEntries.filter(
      (e) =>
        hasText(e.title) &&
        hasText(e.proof_file) &&
        isVerifiedPublication(e.verification),
    )
    const conf = conferencePoints(validConf.length)

    // 3. Book Chapters: 5 each, max 2
    const bcEntries = m.book_chapters?.entries ?? []
    const validBc = bcEntries.filter(
      (e) =>
        hasText(e.title) &&
        (isValidScopus(e.proof_file) ||
          (hasText(e.proof_file) && isVerifiedPublication(e.verification))),
    )
    const bc = bookChaptersPoints(validBc.length)

    // 4. Books: 5 each, max 2
    const bookEntries = m.books?.entries ?? []
    const validBooks = bookEntries.filter((e) => hasText(e.title) && isValidFileProof(e.proof_file))
    const books = booksPoints(validBooks)

    // 5. IPR: 5 each, max 2
    const iprEntries = m.ipr?.entries ?? []
    const ipr = iprPoints(iprEntries)

    // 6. Funded Projects: 2-5L = 5, >5L = 30, <2L = 0
    const fundedEntries = m.funded_projects?.entries ?? []
    const validFunded = fundedEntries.filter(
      (e) => (Number(e.amount_lakhs) || 0) > 0 && hasText(e.description) && isValidFileProof(e.proof_file),
    )
    const funded = validFunded.reduce((s, e) => s + fundedPoints(Number(e.amount_lakhs) || 0), 0)

    // 7. PhD Awarded: 5 per student
    const phdEntries = m.phd_awarded?.entries ?? []
    const validPhd = phdEntries.filter((e) => hasText(e.student_name) && isValidFileProof(e.proof_file))
    const phd = phdAwardedPoints(validPhd.length)

    // ========================================================================
    // OTHERS
    // ========================================================================
    // 1. Organising FDPs: 5d = 5, 3-4d = 4, 1-2d = 3
    const fdpOrgEntries = m.fdp_organized?.entries ?? []
    const validFdpOrg = fdpOrgEntries.filter(
      (e) => hasText(e.name) && (Number(e.days) || 0) > 0 && isValidFileProof(e.proof_file),
    )
    const fdpO = fdpOrganizedPoints(validFdpOrg)

    // 2. Invited Talks: 5 each, max 2
    const talksEntries = m.talks_delivered?.entries ?? []
    const validTalks = talksEntries.filter((e) => hasText(e.title) && isValidFileProof(e.proof_file))
    const talks = talksPoints(validTalks.length)

    // 3. MOU Signed: 3 each, max 2
    const mouEntries = m.mou_signed?.entries ?? []
    const validMou = mouEntries.filter((e) => hasText(e.organization) && isValidFileProof(e.proof_file))
    const mou = mouSignedPoints(validMou.length)

    // 4. HOD/Dean: 2 marks
    const heldHodDean = Boolean(m.hod_dean_role?.held_role)
    const validHodDeanProof = isValidFileProof(m.hod_dean_role?.proof_file)
    const hodDean = hodDeanPoints(heldHodDean, validHodDeanProof)

    // 5. Industrial Visits: 2 each, max 2
    const visitsEntries = m.industrial_visits?.entries ?? []
    const validVisits = visitsEntries.filter((e) => hasText(e.company_name) && isValidFileProof(e.proof_file))
    const visits = industrialVisitsPoints(validVisits.length)

    // Legacy FDP Attended (preserved)
    const fdpEntries = m.fdp_attended?.entries ?? []
    const validFdp = fdpEntries.filter(
      (e) => hasText(e.name) && (Number(e.days) || 0) > 0 && isValidFileProof(e.proof_file),
    )
    const fdpA = fdpAttendedPoints(validFdp)

    // Raw uncapped totals
    const tlp = sf + mooc + dept + inst
    const research = journal + conf + bc + books + ipr + funded + phd
    const others = fdpO + talks + mou + hodDean + visits + fdpA
    const total = tlp + research + others

    const eligibility = calculateEligibility(tlp, research, others, facultyPosition)

    return {
      student_feedback: sf,
      mooc_courses: mooc,
      departmental_activities: dept,
      institutional_activities: inst,
      journal_index: journal,
      conference_articles: conf,
      book_chapters: bc,
      books,
      ipr,
      funded_projects: funded,
      phd_awarded: phd,
      fdp_organized: fdpO,
      talks_delivered: talks,
      mou_signed: mou,
      hod_dean_role: hodDean,
      industrial_visits: visits,
      fdp_attended: fdpA,
      tlp,
      research,
      others,
      total,
      eligibility,
    }
  }, [modules, facultyPosition])

/*
// TODO:
// Re-enable score persistence without triggering infinite re-renders.
// Currently computed scores are displayed correctly but not saved in DB.
  useEffect(() => {
    form.setValue('modules.student_feedback.points', computed.student_feedback, { shouldDirty: false })
    form.setValue('modules.conference_articles.points', computed.conference_articles, { shouldDirty: false })
    form.setValue('modules.book_chapters.points', computed.book_chapters, { shouldDirty: false })
    form.setValue('modules.books.points', computed.books, { shouldDirty: false })
    form.setValue('modules.ipr.points', computed.ipr, { shouldDirty: false })
    form.setValue('modules.funded_projects.points', computed.funded_projects, { shouldDirty: false })
    form.setValue('modules.fdp_attended.points', computed.fdp_attended, { shouldDirty: false })
    form.setValue('modules.talks_delivered.points', computed.talks_delivered, { shouldDirty: false })
    form.setValue('modules.departmental_activities.points', computed.departmental_activities, { shouldDirty: false })
    form.setValue('modules.institutional_activities.points', computed.institutional_activities, { shouldDirty: false })
    form.setValue('modules.fdp_organized.points', computed.fdp_organized, { shouldDirty: false })
    form.setValue('total_points', computed.total, { shouldDirty: false })
  }, [computed])
*/

  useEffect(() => {
    if (editId) {
      api.get<Evaluation>(`/evaluations/${editId}`).then(({ data }) => {
        if (data.status !== 'draft') {
          navigate(`/evaluation/${data.id}/view`, { replace: true })
          return
        }

        const pos = data.faculty_position ?? 'associate_professor'
        setSelectedPosition(pos)
        setWorkflowStep('evaluation')

        form.reset({
          ...data,
          id: data.id,
          faculty_position: pos,
          modules: data.modules ?? defaultModules,
        })
      }).catch(() => {})
    } else if (facultyId) {
      form.setValue('faculty_id', facultyId)
    }
  }, [editId])

  useEffect(() => {
    if (!facultyId && user?.role === 'faculty') {
      api.get<FacultyProfile>('/faculty/me').then(({ data }) => {
        if (data?.id) {
          form.setValue('faculty_id', data.id)
        }
      }).catch(() => {})
    }
  }, [facultyId, user])

  const persistDraft = async (data: FormValues) => {
    const modules: EvaluationModules = {
      ...(data.modules ?? defaultModules),

      student_feedback: {
        percentage: data.modules?.student_feedback?.percentage ?? '',
        points: computed.student_feedback,
      },

      mooc_courses: {
        entries: data.modules?.mooc_courses?.entries ?? [],
        points: computed.mooc_courses,
      },

      journal_index: {
        ...(data.modules?.journal_index ?? defaultModules.journal_index),
        points: computed.journal_index,
      },

      conference_articles: {
        entries: data.modules?.conference_articles?.entries ?? [],
        points: computed.conference_articles,
      },

      book_chapters: {
        entries: data.modules?.book_chapters?.entries ?? [],
        points: computed.book_chapters,
      },

      books: {
        entries: data.modules?.books?.entries ?? [],
        points: computed.books,
      },

      ipr: {
        entries: data.modules?.ipr?.entries ?? [],
        points: computed.ipr,
      },

      funded_projects: {
        entries: data.modules?.funded_projects?.entries ?? [],
        points: computed.funded_projects,
      },

      phd_awarded: {
        entries: data.modules?.phd_awarded?.entries ?? [],
        points: computed.phd_awarded,
      },

      fdp_attended: {
        entries: data.modules?.fdp_attended?.entries ?? [],
        points: computed.fdp_attended,
      },

      talks_delivered: {
        entries: data.modules?.talks_delivered?.entries ?? [],
        points: computed.talks_delivered,
      },

      departmental_activities: {
        entries: data.modules?.departmental_activities?.entries ?? [],
        points: computed.departmental_activities,
      },

      institutional_activities: {
        entries: data.modules?.institutional_activities?.entries ?? [],
        points: computed.institutional_activities,
      },

      fdp_organized: {
        entries: data.modules?.fdp_organized?.entries ?? [],
        points: computed.fdp_organized,
      },

      mou_signed: {
        entries: data.modules?.mou_signed?.entries ?? [],
        points: computed.mou_signed,
      },

      hod_dean_role: {
        held_role: Boolean(data.modules?.hod_dean_role?.held_role),
        details: data.modules?.hod_dean_role?.details ?? '',
        proof_file: data.modules?.hod_dean_role?.proof_file ?? '',
        points: computed.hod_dean_role,
      },

      industrial_visits: {
        entries: data.modules?.industrial_visits?.entries ?? [],
        points: computed.industrial_visits,
      },
    }

    const pos = (selectedPosition || data.faculty_position || 'associate_professor') as FacultyPosition
    const payload: FormValues = {
      ...data,
      faculty_id: facultyId ?? data.faculty_id,
      faculty_position: pos,
      position: getPositionTitle(pos),
      modules,
      total_points: computed.total,
      status: 'draft',
    }

    if (editId) {
      const { data: ev } = await api.put<Evaluation>(`/evaluations/${editId}`, payload)
      return ev
    }

    const { data: ev } = await api.post<Evaluation>('/evaluations', {
      ...payload,
      id: undefined,
    })
    return ev
  }

  const onSubmit = async (data: FormValues) => {
    try {
      await persistDraft(data)
      navigate('/dashboard', { state: { message: 'Draft saved.' } })
    } catch (err: any) {
      console.error(err)

      if (err.response?.status === 409) {
        alert("An evaluation for this academic year already exists.")
      } else {
        alert("Something went wrong while saving the evaluation.")
      }
    }
  }


  const verifyJournalPublication = async () => {
    const url = form
      .getValues('modules.journal_index.scopus_link')
      ?.trim()

    const title = form
      .getValues('modules.journal_index.title')
      ?.trim()

    const issn = form
      .getValues('modules.journal_index.issn')
      ?.trim()

    const eissn = form
      .getValues('modules.journal_index.eissn')
      ?.trim()

    let payload: {
      publication_url?: string
      title?: string
      issn?: string
      eissn?: string
    }

    if (url) {
      // Preserve the existing DOI/publication URL verification flow.
      payload = {
        publication_url: url,
      }
    } else if (title && (issn || eissn)) {
      // New fallback: paper title plus journal ISSN/e-ISSN.
      payload = {
        title,
        issn: issn || undefined,
        eissn: eissn || undefined,
      }
    } else {
      setVerificationError(
        'Enter a publication URL/DOI, or a paper title with a journal ISSN or e-ISSN.'
      )
      return
    }

    setVerificationLoading(true)
    setVerificationError('')

    try {
      console.log('VERIFY REQUEST:', payload)

      const { data } = await api.post('/publications/verify', payload)

      console.log('VERIFY RESPONSE:', data)

      form.setValue(
        'modules.journal_index.verification',
        data,
        { shouldDirty: true }
      )

      if (data.title && url) {
        form.setValue(
          'modules.journal_index.title',
          data.title,
          { shouldDirty: true }
        )
      }
    } catch (err: any) {
      console.error('Publication verification failed:', err)

      const detail = err?.response?.data?.detail

      setVerificationError(
        typeof detail === 'string'
          ? detail
          : 'Publication verification failed. Please check the submitted details and try again.'
      )
    } finally {
      setVerificationLoading(false)
    }
  }


  const verifyConferencePublication = async (index: number) => {
    const url = form
      .getValues(`modules.conference_articles.entries.${index}.proof_file`)
      ?.trim()

    if (!url) {
      setConferenceVerificationError((prev) => ({
        ...prev,
        [index]: 'Please enter a Scopus publication link first.',
      }))
      return
    }

    setConferenceVerificationLoading((prev) => ({
      ...prev,
      [index]: true,
    }))

    setConferenceVerificationError((prev) => ({
      ...prev,
      [index]: '',
    }))

    try {
      const { data } = await api.post('/publications/verify', {
        publication_url: url,
      })

      form.setValue(
        `modules.conference_articles.entries.${index}.verification`,
        data,
        { shouldDirty: true }
      )
    } catch (err: any) {
      console.error('Conference publication verification failed:', err)
      const detail = err?.response?.data?.detail

      setConferenceVerificationError((prev) => ({
        ...prev,
        [index]:
          typeof detail === 'string'
            ? detail
            : 'Publication verification failed. Please check the link and try again.',
      }))
    } finally {
      setConferenceVerificationLoading((prev) => ({
        ...prev,
        [index]: false,
      }))
    }
  }

  const verifyBookChapterPublication = async (index: number) => {
    const url = form
      .getValues(`modules.book_chapters.entries.${index}.proof_file`)
      ?.trim()

    if (!url) {
      setBookChapterVerificationError((prev) => ({
        ...prev,
        [index]: 'Please enter a Scopus publication link first.',
      }))
      return
    }

    setBookChapterVerificationLoading((prev) => ({
      ...prev,
      [index]: true,
    }))

    setBookChapterVerificationError((prev) => ({
      ...prev,
      [index]: '',
    }))

    try {
      const { data } = await api.post('/publications/verify', {
        publication_url: url,
      })

      form.setValue(
        `modules.book_chapters.entries.${index}.verification`,
        data,
        { shouldDirty: true }
      )
    } catch (err: any) {
      console.error('Book chapter publication verification failed:', err)
      const detail = err?.response?.data?.detail

      setBookChapterVerificationError((prev) => ({
        ...prev,
        [index]:
          typeof detail === 'string'
            ? detail
            : 'Publication verification failed. Please check the link and try again.',
      }))
    } finally {
      setBookChapterVerificationLoading((prev) => ({
        ...prev,
        [index]: false,
      }))
    }
  }

  const submitEval = async () => {
    const data = form.getValues()
    const jm = data.modules?.journal_index
    const hasJournal = hasText(jm?.title) || hasText(jm?.value) || hasText(jm?.doi) || hasText(jm?.scopus_link)
    if (hasJournal && !jm?.declaration_accepted) {
      alert('Please accept the mandatory declaration for the journal publication before submitting.')
      return
    }

    if (journalDuplicate?.is_duplicate) {
      alert(
        `Cannot submit: Journal publication has already been submitted by ${journalDuplicate.duplicate_by?.faculty_name || 'another faculty member'} (${journalDuplicate.duplicate_by?.employee_id || 'N/A'}).`
      )
      return
    }

    if (computed.total <= 0) {
      alert('Grand total must be greater than 0 with required proofs (Scopus links or uploaded files) before submission.')
      return
    }

    try {
      const saved = await persistDraft(data)
      await api.post(`/evaluations/${saved.id}/submit`)
      navigate('/dashboard', { state: { message: 'Evaluation submitted for approval.' } })
    } catch (err: any) {
      console.error(err)
      const detail = err?.response?.data?.detail
      alert(typeof detail === 'string' ? detail : 'Something went wrong while submitting the evaluation.')
    }
  }

  const currentPos = (selectedPosition || facultyPosition || 'associate_professor') as FacultyPosition
  const positionTitle = getPositionTitle(currentPos)

  if (workflowStep === 'setup') {
    return (
      <div className="evaluation-page" style={{ maxWidth: '640px', margin: '2rem auto' }}>
        <div className="card" style={{ padding: '2.5rem' }}>
          <h1 className="page-title" style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>
            Faculty Evaluation
          </h1>

          <div style={{ marginBottom: '2rem' }}>
            <label
              className="form-label"
              style={{
                display: 'block',
                fontSize: '1.05rem',
                fontWeight: 600,
                color: 'var(--text-label)',
                marginBottom: '1rem',
              }}
            >
              Position:
            </label>

            {setupError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                }}
              >
                {setupError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  border: '1px solid',
                  borderColor: selectedPosition === 'professor' ? 'var(--secondary)' : 'var(--border)',
                  backgroundColor: selectedPosition === 'professor' ? 'rgba(37, 99, 235, 0.05)' : 'var(--white)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="faculty_position"
                  value="professor"
                  checked={selectedPosition === 'professor'}
                  onChange={() => {
                    setSelectedPosition('professor')
                    setSetupError('')
                  }}
                  style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--secondary)', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: selectedPosition === 'professor' ? 600 : 400 }}>Professor</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  border: '1px solid',
                  borderColor: selectedPosition === 'associate_professor' ? 'var(--secondary)' : 'var(--border)',
                  backgroundColor: selectedPosition === 'associate_professor' ? 'rgba(37, 99, 235, 0.05)' : 'var(--white)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="faculty_position"
                  value="associate_professor"
                  checked={selectedPosition === 'associate_professor'}
                  onChange={() => {
                    setSelectedPosition('associate_professor')
                    setSetupError('')
                  }}
                  style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--secondary)', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: selectedPosition === 'associate_professor' ? 600 : 400 }}>Associate Professor</span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  border: '1px solid',
                  borderColor: selectedPosition === 'assistant_professor' ? 'var(--secondary)' : 'var(--border)',
                  backgroundColor: selectedPosition === 'assistant_professor' ? 'rgba(37, 99, 235, 0.05)' : 'var(--white)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="faculty_position"
                  value="assistant_professor"
                  checked={selectedPosition === 'assistant_professor'}
                  onChange={() => {
                    setSelectedPosition('assistant_professor')
                    setSetupError('')
                  }}
                  style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--secondary)', cursor: 'pointer' }}
                />
                <span style={{ fontWeight: selectedPosition === 'assistant_professor' ? 600 : 400 }}>Assistant Professor</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!selectedPosition) {
                  setSetupError('Please select a position to continue.')
                  return
                }
                form.setValue('faculty_position', selectedPosition)
                form.setValue('position', getPositionTitle(selectedPosition))
                setWorkflowStep('evaluation')
              }}
              style={{ padding: '0.625rem 1.75rem', fontSize: '1rem' }}
            >
              Next
            </button>

            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn btn-outline"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="evaluation-page">
      {/* Header & Position summary banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: '0.25rem' }}>Faculty Evaluation</h1>
          <p className="form-label" style={{ margin: 0 }}>
            Academic year: <strong>{form.watch('academic_year')}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(37, 99, 235, 0.08)', borderRadius: '6px', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Selected Position: </span>
            <strong style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>{positionTitle}</strong>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowStep('setup')}
            className="btn btn-outline btn-sm"
            style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
          >
            Change Position
          </button>
        </div>
      </div>

      {/* Exactly three major tabs: Part A — TLP, Part B — Research, Part C — Others */}
      <div className="eval-tabs" style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid var(--border)', marginBottom: '1.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('part_a')}
          className={`eval-tab-btn ${activeTab === 'part_a' ? 'active' : ''}`}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'part_a' ? '3px solid var(--secondary)' : '3px solid transparent',
            backgroundColor: activeTab === 'part_a' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
            color: activeTab === 'part_a' ? 'var(--secondary)' : 'var(--text-muted)',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.15s ease',
          }}
        >
          Part A — TLP ({computed.tlp} pts)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('part_b')}
          className={`eval-tab-btn ${activeTab === 'part_b' ? 'active' : ''}`}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'part_b' ? '3px solid var(--secondary)' : '3px solid transparent',
            backgroundColor: activeTab === 'part_b' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
            color: activeTab === 'part_b' ? 'var(--secondary)' : 'var(--text-muted)',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.15s ease',
          }}
        >
          Part B — Research ({computed.research} pts)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('part_c')}
          className={`eval-tab-btn ${activeTab === 'part_c' ? 'active' : ''}`}
          style={{
            padding: '0.75rem 1.5rem',
            fontWeight: 600,
            fontSize: '1rem',
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'part_c' ? '3px solid var(--secondary)' : '3px solid transparent',
            backgroundColor: activeTab === 'part_c' ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
            color: activeTab === 'part_c' ? 'var(--secondary)' : 'var(--text-muted)',
            borderRadius: '6px 6px 0 0',
            transition: 'all 0.15s ease',
          }}
        >
          Part C — Others ({computed.others} pts)
        </button>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* TAB 1: Part A — TLP */}
        <div style={{ display: activeTab === 'part_a' ? 'block' : 'none' }}>
          <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              Part A — Teaching, Learning and Professional Development (TLP)
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.6' }}>
              Teaching, Learning and Professional (TLP) activities for <strong>{positionTitle}</strong>.
            </p>

            {/* TLP Category Score & Eligibility Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1rem 1.25rem',
                backgroundColor: '#eff6ff',
                borderRadius: '8px',
                border: '1px solid #bfdbfe',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: 600 }}>
                  TLP Category Score ({positionTitle})
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e3a8a' }}>
                    {computed.tlp}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: '#2563eb' }}>
                    points (Position Max Ref: {computed.eligibility.tlpMax} | 65% Min Req: {computed.eligibility.tlpThreshold} pts)
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  *Actual marks are never capped to the category maximum. Displayed marks reflect actual calculations.
                </div>
              </div>
              <span
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  backgroundColor: computed.eligibility.isTlpEligible ? '#dcfce7' : '#fee2e2',
                  color: computed.eligibility.isTlpEligible ? '#15803d' : '#b91c1c',
                  border: `1px solid ${computed.eligibility.isTlpEligible ? '#86efac' : '#fca5a5'}`,
                }}
              >
                {computed.eligibility.isTlpEligible
                  ? '✓ TLP Eligible (≥ 65%)'
                  : `✗ TLP Below 65% (${computed.tlp} / ${computed.eligibility.tlpThreshold} pts)`}
              </span>
            </div>

            {/* Module 1: Student Feedback */}
            <ModuleCard
              title="1. Student Feedback (80–100% = 30 pts, 60–below 80% = 20 pts, below 60% = 0 pts)"
              points={computed.student_feedback}
              defaultOpen
            >
              <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                Select feedback percentage:
              </p>

              <select {...form.register('modules.student_feedback.percentage')} className="input input-w-40">
                <option value="">Select %</option>
                {['100', '95', '90', '85', '80', '75', '70', '65', '60', '55', '50', '40'].map((p) => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
            </ModuleCard>

            {/* Module 2: MOOC Courses */}
            <MOOCCoursesModule form={form} points={computed.mooc_courses} />

            {/* Combined Activities Notification Banner */}
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                color: '#334155',
              }}
            >
              <strong>Activities Combined Maximum:</strong> Departmental (3 pts each) + Institutional (5 pts each) combined maximum = <strong>2 entries total</strong> (e.g. 2 departmental, 2 institutional, or 1 of each).
              {((form.watch('modules.departmental_activities.entries')?.length ?? 0) +
                (form.watch('modules.institutional_activities.entries')?.length ?? 0)) >= 2 && (
                <div style={{ color: '#b45309', fontWeight: 600, marginTop: '0.25rem' }}>
                  ⚠ Combined maximum of 2 entries reached. Remove an entry if you wish to add from the other activity.
                </div>
              )}
            </div>

            {/* Module 3: Departmental Activities */}
            <DeptActivitiesModule
              form={form}
              points={computed.departmental_activities}
              canAdd={
                ((form.watch('modules.departmental_activities.entries')?.length ?? 0) +
                  (form.watch('modules.institutional_activities.entries')?.length ?? 0)) < 2
              }
            />

            {/* Module 4: Institutional Activities */}
            <InstActivitiesModule
              form={form}
              points={computed.institutional_activities}
              canAdd={
                ((form.watch('modules.departmental_activities.entries')?.length ?? 0) +
                  (form.watch('modules.institutional_activities.entries')?.length ?? 0)) < 2
              }
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveTab('part_b')}
            >
              Next: Part B — Research →
            </button>
          </div>
        </div>

        {/* TAB 2: Part B — Research */}
        <div style={{ display: activeTab === 'part_b' ? 'block' : 'none' }}>
          <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              Part B — Research and Academic Contributions
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.6' }}>
              Research publications, conference proceedings, book chapters, books, IPR, funded projects, and PhD awards for <strong>{positionTitle}</strong>.
            </p>

            {/* Research Category Score & Eligibility Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1rem 1.25rem',
                backgroundColor: '#f5f3ff',
                borderRadius: '8px',
                border: '1px solid #ddd6fe',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', color: '#6d28d9', fontWeight: 600 }}>
                  Research Category Score ({positionTitle})
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4c1d95' }}>
                    {computed.research}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: '#7c3aed' }}>
                    points (Position Max Ref: {computed.eligibility.researchMax} | 65% Min Req: {computed.eligibility.researchThreshold} pts)
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  *Actual marks are never capped to the category maximum. Displayed marks reflect actual calculations.
                </div>
              </div>
              <span
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  backgroundColor: computed.eligibility.isResearchEligible ? '#dcfce7' : '#fee2e2',
                  color: computed.eligibility.isResearchEligible ? '#15803d' : '#b91c1c',
                  border: `1px solid ${computed.eligibility.isResearchEligible ? '#86efac' : '#fca5a5'}`,
                }}
              >
                {computed.eligibility.isResearchEligible
                  ? '✓ Research Eligible (≥ 65%)'
                  : `✗ Research Below 65% (${computed.research} / ${computed.eligibility.researchThreshold} pts)`}
              </span>
            </div>

        {/* Module 1: Journal Index */}
        <ModuleCard title="1. Journal Index (30 marks per verified paper)" points={computed.journal_index} defaultOpen>
          <div className="form-row">
            <input
              type="text"
              placeholder="Paper Title"
              {...form.register('modules.journal_index.title', {
                onChange: (e) => checkDuplicate(form.getValues('modules.journal_index.doi'), e.target.value)
              })}
              className="input input-flex"
            />

            <input
              type="text"
              placeholder="DOI (e.g. 10.1016/j.jss.2023.111876)"
              {...form.register('modules.journal_index.doi', {
                onChange: (e) => checkDuplicate(e.target.value, form.getValues('modules.journal_index.title'))
              })}
              className="input input-flex"
            />

            <input
              type="text"
              placeholder="Journal ISSN (optional)"
              {...form.register('modules.journal_index.issn')}
              className="input input-flex"
            />

            <input
              type="text"
              placeholder="Journal e-ISSN (optional)"
              {...form.register('modules.journal_index.eissn')}
              className="input input-flex"
            />

            <ProofUpload
              value={form.watch('modules.journal_index.scopus_link')}
              onChange={(url) => {
                form.setValue(
                  'modules.journal_index.scopus_link',
                  url
                )

                form.setValue(
                  'modules.journal_index.verification',
                  undefined
                )

                setVerificationError('')
              }}
              prefix="journal_index"
              mode="scopus"
            />

            <button
              type="button"
              onClick={verifyJournalPublication}
              disabled={
                verificationLoading ||
                !(
                  form.watch('modules.journal_index.scopus_link')?.trim() ||
                  form.watch('modules.journal_index.doi')?.trim() ||
                  (
                    form.watch('modules.journal_index.title')?.trim() &&
                    (
                      form.watch('modules.journal_index.issn')?.trim() ||
                      form.watch('modules.journal_index.eissn')?.trim()
                    )
                  )
                )
              }
              className="btn btn-secondary"
            >
              {verificationLoading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => {
                form.setValue('modules.journal_index.title', '')
                form.setValue('modules.journal_index.doi', '')
                form.setValue('modules.journal_index.scopus_link', '')
                form.setValue('modules.journal_index.issn', '')
                form.setValue('modules.journal_index.eissn', '')
                form.setValue('modules.journal_index.value', '')
                form.setValue('modules.journal_index.verification', undefined)
                form.setValue('modules.journal_index.declaration_accepted', false)
                setJournalDuplicate(null)
                setVerificationError('')
              }}
              className="remove-link"
            >
              Remove
            </button>
          </div>

          {/* Duplicate Paper Detection Alert */}
          {journalDuplicate?.is_duplicate && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1rem',
                backgroundColor: '#fef2f2',
                border: '1px solid #f87171',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              ⚠ <strong>Duplicate Publication Detected:</strong> This publication has already been submitted for evaluation by{' '}
              <strong>{journalDuplicate.duplicate_by?.faculty_name || 'another faculty member'}</strong>{' '}
              (Employee ID: <strong>{journalDuplicate.duplicate_by?.employee_id || 'N/A'}</strong>).
              Duplicate submissions across faculty accounts are not permitted.
            </div>
          )}

          {/* Mandatory Declaration Checkbox */}
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.875rem 1rem',
              backgroundColor: '#f8fafc',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                {...form.register('modules.journal_index.declaration_accepted')}
                style={{ marginTop: '0.2rem', width: '1.15rem', height: '1.15rem', accentColor: 'var(--secondary)' }}
              />
              <span style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: '1.5' }}>
                <strong>Mandatory Declaration:</strong> "I hereby declare that, to the best of my knowledge, this publication has not been submitted by another faculty member for evaluation. I accept responsibility for the accuracy of this declaration."
              </span>
            </label>
          </div>


          {verificationError && (
            <div
              style={{
                marginTop: '0.75rem',
                color: '#dc2626',
              }}
            >
              {verificationError}
            </div>
          )}

          {form.watch('modules.journal_index.verification') && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
              }}
            >

              <div className="publication-verification-header">
                <div>
                  <div className="publication-verification-title">
                    Publication Verification
                  </div>

                  <div className="publication-verification-subtitle">
                    Verification results from trusted publication databases
                  </div>
                </div>

                <span
                  className={`verification-badge ${
                    isVerifiedPublication(
                      form.watch('modules.journal_index.verification')
                    )
                      ? 'verification-badge-success'
                      : 'verification-badge-warning'
                  }`}
                >
                  {isVerifiedPublication(
                    form.watch('modules.journal_index.verification')
                  )
                    ? 'Verified'
                    : 'Review Required'}
                </span>
              </div>

              <div className="verification-section">
                <div className="verification-section-title">
                  Publication Details
                </div>

                <div className="publication-details">
                  {form.watch('modules.journal_index.verification')?.title && (
                    <div className="publication-detail publication-detail-full">
                      <span className="publication-detail-label">Title</span>

                      <span className="publication-detail-value publication-title">
                        {form.watch('modules.journal_index.verification')?.title}
                      </span>
                    </div>
                  )}

                  {form.watch('modules.journal_index.verification')?.journal && (
                    <div className="publication-detail">
                      <span className="publication-detail-label">Journal</span>

                      <span className="publication-detail-value">
                        {form.watch('modules.journal_index.verification')?.journal}
                      </span>
                    </div>
                  )}

                  {form.watch('modules.journal_index.verification')?.doi && (
                    <div className="publication-detail">
                      <span className="publication-detail-label">DOI</span>

                      <span className="publication-detail-value publication-doi">
                        {form.watch('modules.journal_index.verification')?.doi}
                      </span>
                    </div>
                  )}

                  {form.watch('modules.journal_index.verification')?.publisher && (
                    <div className="publication-detail publication-detail-full">
                      <span className="publication-detail-label">Publisher</span>

                      <span className="publication-detail-value">
                        {form.watch('modules.journal_index.verification')?.publisher}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="verification-section verification-checks-section">
                <div className="verification-section-title">
                  Verification Checks
                </div>

                <div className="verification-checks">
                  {/* <div className="verification-check">
                    <div className="verification-check-name">Crossref</div>

                    <span
                      className={`verification-status ${
                        form.watch('modules.journal_index.verification')?.publication_found
                          ? 'verification-status-success'
                          : 'verification-status-error'
                      }`}
                    >
                      {form.watch('modules.journal_index.verification')?.publication_found
                        ? '✓ Publication found'
                        : '✕ Publication not found'}
                    </span>
                  </div> */}

                  {/* <div className="verification-check">
                    <div className="verification-check-name">Scopus</div>

                    <span
                      className={`verification-status ${
                        form.watch('modules.journal_index.verification')?.scopus_source?.status === 'source_covered'
                          ? 'verification-status-success'
                          : 'verification-status-error'
                      }`}
                    >
                      {form.watch('modules.journal_index.verification')?.scopus_status === 'source_covered'
                        ? '✓ Source covered'
                        : '✗ Source not covered'}
                    </span>
                  </div> */}


                
<div className="verification-check">
  <div className="verification-check-name">Scopus</div>
  <span
    className={`verification-status ${
      form.watch('modules.journal_index.verification')?.scopus_source?.status === 'source_covered'
        ? 'verification-status-success'
        : 'verification-status-error'
    }`}
  >
    {form.watch('modules.journal_index.verification')?.scopus_source?.status === 'source_covered'
      ? '✓ Source covered'
      : '✗ Source not covered'}
  </span>
</div>



                  <div className="verification-check">
                    <div className="verification-check-name">Web of Science</div>

                    <span
                      className={`verification-status ${
                        form.watch('modules.journal_index.verification')?.web_of_science
                          ?.status === 'indexed'
                          ? 'verification-status-success'
                          : 'verification-status-error'
                      }`}
                    >
                      {form.watch('modules.journal_index.verification')?.web_of_science
                        ?.status === 'indexed'
                        ? '✓ Article Indexed'
                        : '✕ Article Not indexed'}
                    </span>
                  </div>

                  <div className="verification-check">
                    <div className="verification-check-name">Author Match</div>

                    <span
                      className={`verification-status ${
                        form.watch('modules.journal_index.verification')?.author_match
                          ? 'verification-status-success'
                          : 'verification-status-error'
                      }`}
                    >
                      {form.watch('modules.journal_index.verification')?.author_match
                        ? '✓ Match found'
                        : '✕ No match'}
                    </span>
                  </div>
                </div>
              </div>

              {form.watch('modules.journal_index.verification')?.scopus_source && (
                <div className="verification-section verification-source-section">
                  <div className="verification-section-title">
                    Scopus Source
                  </div>

                  <div className="scopus-source-header">
                    <div>
                      <div className="scopus-source-name">
                        {form.watch('modules.journal_index.verification')?.scopus_source
                          ?.source_title || 'Not available'}
                      </div>

                      <div className="scopus-source-type">
                        {form.watch('modules.journal_index.verification')?.scopus_source
                          ?.source_type || 'Source'}
                      </div>
                    </div>

                    <span
                      className={`source-active-badge ${
                        form.watch('modules.journal_index.verification')?.scopus_source
                          ?.active
                          ? 'source-active'
                          : 'source-inactive'
                      }`}
                    >
                      {form.watch('modules.journal_index.verification')?.scopus_source
                        ?.active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>

                  <div className="scopus-source-details">
                    <div>
                      <span>Coverage</span>

                      <strong>
                        {form.watch('modules.journal_index.verification')?.scopus_source
                          ?.coverage || 'Not available'}
                      </strong>
                    </div>
                  </div>
                </div>
              )} 
              </div>
              )} 

          <input
            type="text"
            placeholder="Journal Index (optional text)"
            {...form.register('modules.journal_index.value')}
            className="input"
            style={{
              width: '100%',
              marginTop: '0.75rem',
            }}
          />

        </ModuleCard>

        {/* Module 2: Conference Articles - max 2, 5 pts each */}
        <ConferenceArticlesModule
          form={form}
          points={computed.conference_articles}
          verifyPublication={verifyConferencePublication}
          verificationLoading={conferenceVerificationLoading}
          verificationError={conferenceVerificationError}
          setVerificationError={setConferenceVerificationError}
        />

        {/* Module 3: Book Chapters - max 2, 5 pts each */}
        <BookChaptersModule
          form={form}
          points={computed.book_chapters}
          verifyPublication={verifyBookChapterPublication}
          verificationLoading={bookChapterVerificationLoading}
          verificationError={bookChapterVerificationError}
          setVerificationError={setBookChapterVerificationError}
        />

        {/* Module 4: Books - max 2, 5 pts each */}
        <BooksModule form={form} points={computed.books} />

        {/* Module 5: IPR - max 2, 5 pts each */}
        <IPRModule form={form} points={computed.ipr} />

        {/* Module 6: Funded Projects - Above 5L = 30, 2-5L = 5, Below 2L = 0 */}
        <FundedProjectsModule form={form} points={computed.funded_projects} />

        {/* Module 7: PhD Awarded - 5 pts per student */}
        <PhDAwardedModule form={form} points={computed.phd_awarded} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setActiveTab('part_a')}
            >
              ← Previous: Part A — TLP
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setActiveTab('part_c')}
            >
              Next: Part C — Others →
            </button>
          </div>
        </div>

        {/* TAB 3: Part C — Others */}
        <div style={{ display: activeTab === 'part_c' ? 'block' : 'none' }}>
          <div className="card" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
            <h2 className="section-title" style={{ marginTop: 0, marginBottom: '0.5rem', color: 'var(--primary)' }}>
              Part C — Others
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.6' }}>
              Other academic, institutional, departmental, extension, and professional activities for <strong>{positionTitle}</strong>.
            </p>

            {/* Others Category Score Banner */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1rem 1.25rem',
                backgroundColor: '#ecfdf5',
                borderRadius: '8px',
                border: '1px solid #a7f3d0',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', color: '#047857', fontWeight: 600 }}>
                  Others Category Score ({positionTitle})
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#065f46' }}>
                    {computed.others}
                  </span>
                  <span style={{ fontSize: '0.9rem', color: '#059669' }}>
                    points (Position Ref Max: {computed.eligibility.othersMax})
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  *No minimum eligibility requirement. Displayed marks reflect actual uncapped calculations.
                </div>
              </div>
              <span
                style={{
                  padding: '0.4rem 0.9rem',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  border: '1px solid #86efac',
                }}
              >
                ✓ No Minimum Required
              </span>
            </div>

            {/* Module 1: FDP Organized - 5d=5, 3-4d=4, 1-2d=3 */}
            <FDPOrganizedModule form={form} points={computed.fdp_organized} />

            {/* Module 2: Invited Talks / Resource Person - max 2, 5 pts each */}
            <TalksModule form={form} points={computed.talks_delivered} />

            {/* Module 3: MOU Signed - max 2, 3 pts each */}
            <MOUSignedModule form={form} points={computed.mou_signed} />

            {/* Module 4: Role as HOD / Dean - 2 marks */}
            <HODDeanModule form={form} points={computed.hod_dean_role} />

            {/* Module 5: Organising Industrial Visits - max 2, 2 pts each */}
            <IndustrialVisitsModule form={form} points={computed.industrial_visits} />

            {/* Module 6: FDP Attended (preserved) */}
            <FDPAttendedModule form={form} points={computed.fdp_attended} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setActiveTab('part_b')}
            >
              ← Previous: Part B — Research
            </button>
          </div>
        </div>

        {/* GRAND TOTAL & ELIGIBILITY SUMMARY CARD */}
        <div
          className="card"
          style={{
            padding: '1.5rem',
            marginBottom: '1.5rem',
            backgroundColor: '#f8fafc',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                Total Appraisal Score
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--primary)' }}>
                  {computed.total}
                </span>
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>points (raw uncapped)</span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Overall Eligibility Status
              </span>
              <span
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: '9999px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  display: 'inline-block',
                  backgroundColor: computed.eligibility.isOverallEligible ? '#dcfce7' : '#fee2e2',
                  color: computed.eligibility.isOverallEligible ? '#15803d' : '#b91c1c',
                  border: `1px solid ${computed.eligibility.isOverallEligible ? '#86efac' : '#fca5a5'}`,
                }}
              >
                {computed.eligibility.isOverallEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* TLP Summary Box */}
            <div style={{ padding: '0.875rem 1rem', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>PART A — TLP</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#1e3a8a', margin: '0.2rem 0' }}>
                {computed.tlp} pts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Max Ref: {computed.eligibility.tlpMax} | Min (65%): {computed.eligibility.tlpThreshold}
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: computed.eligibility.isTlpEligible ? '#15803d' : '#b91c1c' }}>
                {computed.eligibility.isTlpEligible ? '✓ Eligible' : '✗ Below 65%'}
              </div>
            </div>

            {/* Research Summary Box */}
            <div style={{ padding: '0.875rem 1rem', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>PART B — RESEARCH</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#4c1d95', margin: '0.2rem 0' }}>
                {computed.research} pts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Max Ref: {computed.eligibility.researchMax} | Min (65%): {computed.eligibility.researchThreshold}
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: computed.eligibility.isResearchEligible ? '#15803d' : '#b91c1c' }}>
                {computed.eligibility.isResearchEligible ? '✓ Eligible' : '✗ Below 65%'}
              </div>
            </div>

            {/* Others Summary Box */}
            <div style={{ padding: '0.875rem 1rem', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>PART C — OTHERS</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#047857', margin: '0.2rem 0' }}>
                {computed.others} pts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Position Ref Max: {computed.eligibility.othersMax}
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: '#047857' }}>
                ✓ No minimum requirement
              </div>
            </div>
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
            Note: Position-wise category maximums are eligibility references, not scoring caps. Actual raw marks are never capped, normalized, or scaled.
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save Draft
          </button>

          {user?.role === 'faculty' && form.watch('status') === 'draft' && (
            <button type="button" onClick={submitEval} className="btn btn-secondary">
              Submit Evaluation
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="btn btn-outline"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

function MOOCCoursesModule({
  form,
  points,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.mooc_courses.entries',
  })

  return (
    <ModuleCard
      title="2. MOOC Courses (max 2, 5 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Course Title"
            {...form.register(`modules.mooc_courses.entries.${i}.title`)}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(`modules.mooc_courses.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(`modules.mooc_courses.entries.${i}.proof_file`, url)
            }
            prefix="mooc_courses"
            mode="file"
          />

          <button
            type="button"
            onClick={() => remove(i)}
            className="remove-link"
          >
            Remove
          </button>
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ title: '' })}
          className="add-link"
        >
          + Add MOOC Course
        </button>
      )}
    </ModuleCard>
  )
}

function ConferenceArticlesModule({
  form,
  points,
  verifyPublication,
  verificationLoading,
  verificationError,
  setVerificationError,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
  verifyPublication: (index: number) => Promise<void>
  verificationLoading: Record<number, boolean>
  verificationError: Record<number, string>
  setVerificationError: Dispatch<SetStateAction<Record<number, string>>>
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.conference_articles.entries',
  })

  return (
    <ModuleCard
      title="2. Conference Articles (max 2, 5 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => {
        const verification = form.watch(
          `modules.conference_articles.entries.${i}.verification`
        )

        const proofFile = form.watch(
          `modules.conference_articles.entries.${i}.proof_file`
        )

        return (
          <div key={i} style={{ marginBottom: '1.5rem' }}>
            <div className="form-row">
              <input
                placeholder="Title"
                {...form.register(
                  `modules.conference_articles.entries.${i}.title`
                )}
                className="input input-flex"
              />

              <ProofUpload
                value={proofFile}
                onChange={(url) => {
                  form.setValue(
                    `modules.conference_articles.entries.${i}.proof_file`,
                    url
                  )

                  form.setValue(
                    `modules.conference_articles.entries.${i}.verification`,
                    undefined
                  )

                  setVerificationError((prev) => ({
                    ...prev,
                    [i]: '',
                  }))
                }}
                prefix="conference_articles"
                mode="scopus"
              />

              <button
                type="button"
                onClick={() => verifyPublication(i)}
                disabled={!!verificationLoading[i] || !proofFile}
                className="btn btn-secondary"
              >
                {verificationLoading[i]
                  ? 'Verifying...'
                  : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => remove(i)}
                className="remove-link"
              >
                Remove
              </button>
            </div>

            {verificationError[i] && (
              <div
                style={{
                  marginTop: '0.75rem',
                  color: '#dc2626',
                }}
              >
                {verificationError[i]}
              </div>
            )}

            {verification && (
              <PublicationVerificationResult
                verification={verification}
              />
            )}
          </div>
        )
      })}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ title: '' })}
          className="add-link"
        >
          + Add Conference Article
        </button>
      )}
    </ModuleCard>
  )
}

function BookChaptersModule({
  form,
  points,
  verifyPublication,
  verificationLoading,
  verificationError,
  setVerificationError,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
  verifyPublication: (index: number) => Promise<void>
  verificationLoading: Record<number, boolean>
  verificationError: Record<number, string>
  setVerificationError: Dispatch<SetStateAction<Record<number, string>>>
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.book_chapters.entries',
  })

  return (
    <ModuleCard
      title="3. Book Chapters (max 2, 5 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => {
        const verification = form.watch(
          `modules.book_chapters.entries.${i}.verification`
        )

        const proofFile = form.watch(
          `modules.book_chapters.entries.${i}.proof_file`
        )

        return (
          <div key={i} style={{ marginBottom: '1.5rem' }}>
            <div className="form-row">
              <input
                placeholder="Title"
                {...form.register(
                  `modules.book_chapters.entries.${i}.title`
                )}
                className="input input-flex"
              />

              <ProofUpload
                value={proofFile}
                onChange={(url) => {
                  form.setValue(
                    `modules.book_chapters.entries.${i}.proof_file`,
                    url
                  )

                  form.setValue(
                    `modules.book_chapters.entries.${i}.verification`,
                    undefined
                  )

                  setVerificationError((prev) => ({
                    ...prev,
                    [i]: '',
                  }))
                }}
                prefix="book_chapters"
                mode="scopus"
              />

              <button
                type="button"
                onClick={() => verifyPublication(i)}
                disabled={!!verificationLoading[i] || !proofFile}
                className="btn btn-secondary"
              >
                {verificationLoading[i]
                  ? 'Verifying...'
                  : 'Verify'}
              </button>

              <button
                type="button"
                onClick={() => remove(i)}
                className="remove-link"
              >
                Remove
              </button>
            </div>

            {verificationError[i] && (
              <div
                style={{
                  marginTop: '0.75rem',
                  color: '#dc2626',
                }}
              >
                {verificationError[i]}
              </div>
            )}

            {verification && (
              <PublicationVerificationResult
                verification={verification}
              />
            )}
          </div>
        )
      })}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ title: '' })}
          className="add-link"
        >
          + Add Book Chapter
        </button>
      )}
    </ModuleCard>
  )
}

function BooksModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.books.entries'
  })

  return (
    <ModuleCard
      title="4. Authored / Edited Books (max 2, 5 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Title"
            {...form.register(`modules.books.entries.${i}.title`)}
            className="input input-flex"
          />

          <select
            {...form.register(`modules.books.entries.${i}.type`)}
            className="input input-w-32"
          >
            <option value="authored">Authored</option>
            <option value="edited">Edited</option>
          </select>

          <ProofUpload
            value={form.watch(`modules.books.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(
                `modules.books.entries.${i}.proof_file`,
                url
              )
            }
            prefix="books"
            mode="file"
          />

          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="remove-link"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ title: '', type: 'authored' })}
          className="add-link"
        >
          + Add Book
        </button>
      )}
    </ModuleCard>
  )
}

function PatentVerificationResultDisplay({
  verificationStatus,
  associationType,
  patentNumber,
  title,
  status,
  inventors,
  applicants,
  currentHolder,
  patentFound,
  inventorMatch,
}: {
  verificationStatus?: string | null
  associationType?: string | null
  patentNumber?: string | null
  title?: string | null
  status?: string | null
  inventors?: string[]
  applicants?: string[]
  currentHolder?: string | null
  patentFound?: boolean | null
  inventorMatch?: boolean | null
}) {
  if (!verificationStatus) {
    return (
      <div style={{ marginTop: '0.75rem', fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>
        Status: Patent verification pending. Enter patent number/link and click "Verify Patent" to verify ownership and award points (5 pts for verified inventor).
      </div>
    )
  }

  if (verificationStatus === 'unable_to_verify') {
    return (
      <div
        style={{
          marginTop: '0.75rem',
          padding: '0.875rem 1rem',
          backgroundColor: '#fffbeb',
          border: '1px solid #fef3c7',
          borderRadius: '6px',
          color: '#92400e',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <span style={{ fontWeight: 600 }}>⚠ Patent could not be verified by registry</span>
          <span style={{ fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
            0 pts
          </span>
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '13px' }}>
          External registry provider could not verify the record at this time.
        </p>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#b45309' }}>
          Verification Status: UNABLE TO VERIFY
        </div>
      </div>
    )
  }

  if (verificationStatus === 'not_found') {
    return (
      <div
        style={{
          marginTop: '0.75rem',
          padding: '0.875rem 1rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fee2e2',
          borderRadius: '6px',
          color: '#b91c1c',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          <span style={{ fontWeight: 600 }}>✗ Patent record not found</span>
          <span style={{ fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
            0 pts
          </span>
        </div>
        <p style={{ margin: '0 0 0.5rem', fontSize: '13px' }}>
          No matching patent was found in the database.
        </p>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>
          Verification Status: NOT FOUND
        </div>
      </div>
    )
  }

  const isEligible =
    verificationStatus === 'verified' &&
    patentFound === true &&
    inventorMatch === true &&
    associationType === 'inventor'
  const isVerified = verificationStatus === 'verified' && patentFound === true
  const isInventor = associationType === 'inventor' && inventorMatch === true
  const applicantHolder =
    (applicants && applicants.length > 0 ? applicants.join(', ') : currentHolder) || 'None listed'

  return (
    <div
      style={{
        marginTop: '0.75rem',
        padding: '0.875rem 1rem',
        backgroundColor: '#ffffff',
        border: `1px solid ${isEligible ? '#bbf7d0' : '#e2e8f0'}`,
        borderRadius: '6px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ color: isVerified ? '#16a34a' : '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>{isVerified ? '✓' : '✗'}</span> Patent Record {isVerified ? 'Found' : 'Not Verified'}
        </div>
        <span
          style={{
            fontWeight: 700,
            fontSize: '12px',
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: isEligible ? '#dcfce7' : '#fee2e2',
            color: isEligible ? '#15803d' : '#b91c1c',
          }}
        >
          {isEligible ? '5 pts' : '0 pts'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem', fontSize: '13px', marginBottom: '0.75rem' }}>
        <span style={{ fontWeight: 600, color: '#64748b' }}>Patent Number:</span>
        <span>{patentNumber || 'N/A'}</span>

        <span style={{ fontWeight: 600, color: '#64748b' }}>Title:</span>
        <span>{title || 'N/A'}</span>

        <span style={{ fontWeight: 600, color: '#64748b' }}>Status:</span>
        <span>{status || 'Published'}</span>

        <span style={{ fontWeight: 600, color: '#64748b' }}>Inventors:</span>
        <span>{inventors && inventors.length > 0 ? inventors.join(', ') : 'None listed'}</span>

        <span style={{ fontWeight: 600, color: '#64748b' }}>Applicant / Holder:</span>
        <span>{applicantHolder}</span>
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.625rem' }}>
        {isEligible ? (
          <div>
            <div style={{ color: '#16a34a', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>✓</span> Faculty Name Matched as Inventor
            </div>
            <div style={{ fontSize: '13px', color: '#15803d', fontStyle: 'italic', marginBottom: '0.5rem' }}>
              Faculty member is verified as a listed inventor. 5 points awarded.
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>
              Verification Status: VERIFIED (INVENTOR MATCH)
            </div>
          </div>
        ) : isVerified && !isInventor ? (
          <div>
            <div style={{ color: '#c2410c', fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>⚠</span> Faculty listed as Applicant/Holder only (Not Inventor)
            </div>
            <div style={{ fontSize: '13px', color: '#9a3412', fontStyle: 'italic', marginBottom: '0.5rem' }}>
              Faculty member is listed as an applicant or holder. Patent points (5 pts) require the faculty member to be an inventor.
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#c2410c' }}>
              Verification Status: VERIFIED (NO INVENTOR MATCH - 0 PTS)
            </div>
          </div>
        ) : (
          <div>
            <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>✗</span> Faculty association not found
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>
              Verification Status: NOT VERIFIED (0 PTS)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function IPRModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.ipr.entries'
  })

  const [patentLoading, setPatentLoading] = useState<Record<number, boolean>>({})
  const [patentError, setPatentError] = useState<Record<number, string>>({})

  const handleVerifyPatent = async (i: number) => {
    const pNum = form.getValues(`modules.ipr.entries.${i}.patent_number`)
    const pLink = form.getValues(`modules.ipr.entries.${i}.patent_link`)

    if (!pNum && !pLink) {
      setPatentError(prev => ({
        ...prev,
        [i]: 'Please enter a Patent Number / Application Number or Patent Link.',
      }))
      return
    }

    setPatentLoading(prev => ({ ...prev, [i]: true }))
    setPatentError(prev => ({ ...prev, [i]: '' }))

    try {
      const res = await verifyPatent({
        patent_number: pNum || null,
        patent_link: pLink || null,
      })

      form.setValue(`modules.ipr.entries.${i}.verification_status`, res.verification_status, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.association_type`, res.association_type, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.matched_name`, res.matched_name, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.patent_number`, res.patent_number || pNum, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.application_number`, res.application_number, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.title`, res.title, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.status`, res.status, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.inventors`, res.inventors, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.applicants`, res.applicants, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.current_holder`, res.current_holder, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.filing_date`, res.filing_date, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.grant_date`, res.grant_date, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.verification_source`, res.verification_source, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.verified_at`, res.verified_at, { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.patent_found`, res.patent_found ?? (res.verification_status === 'verified'), { shouldDirty: true })
      form.setValue(`modules.ipr.entries.${i}.inventor_match`, res.inventor_match ?? (res.association_type === 'inventor'), { shouldDirty: true })

      const currentDesc = form.getValues(`modules.ipr.entries.${i}.description`)
      if (!currentDesc && (res.title || res.patent_number)) {
        form.setValue(
          `modules.ipr.entries.${i}.description`,
          res.title || `Patent ${res.patent_number}`
        )
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Patent verification failed.'
      setPatentError(prev => ({ ...prev, [i]: msg }))
    } finally {
      setPatentLoading(prev => ({ ...prev, [i]: false }))
    }
  }

  return (
    <ModuleCard
      title="5. IPR — Patents / Copyright / Trademark (max 2, 5 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => {
        const entryType = form.watch(`modules.ipr.entries.${i}.type`)
        const isPatent = entryType === 'patent'
        const verificationStatus = form.watch(`modules.ipr.entries.${i}.verification_status`)
        const associationType = form.watch(`modules.ipr.entries.${i}.association_type`)
        const patentNumber = form.watch(`modules.ipr.entries.${i}.patent_number`)
        const title = form.watch(`modules.ipr.entries.${i}.title`)
        const status = form.watch(`modules.ipr.entries.${i}.status`)
        const inventors = form.watch(`modules.ipr.entries.${i}.inventors`)
        const applicants = form.watch(`modules.ipr.entries.${i}.applicants`)
        const currentHolder = form.watch(`modules.ipr.entries.${i}.current_holder`)

        return (
          <div key={i} style={{ marginBottom: '1.5rem', borderBottom: '1px dashed var(--border, #cbd5e1)', paddingBottom: '1.25rem' }}>
            <div className="form-row">
              <select
                {...form.register(`modules.ipr.entries.${i}.type`, {
                  onChange: () => {
                    form.setValue(`modules.ipr.entries.${i}.verification_status`, null, { shouldDirty: true })
                    form.setValue(`modules.ipr.entries.${i}.association_type`, null, { shouldDirty: true })
                    form.setValue(`modules.ipr.entries.${i}.matched_name`, null, { shouldDirty: true })
                    form.setValue(`modules.ipr.entries.${i}.patent_found`, null, { shouldDirty: true })
                    form.setValue(`modules.ipr.entries.${i}.inventor_match`, null, { shouldDirty: true })
                  }
                })}
                className="input input-w-32"
              >
                <option value="patent">Patent</option>
                <option value="copyright">Copyright</option>
                <option value="trademark">Trademark</option>
              </select>

              <input
                placeholder={isPatent ? "Patent Title / Description" : "Description"}
                {...form.register(`modules.ipr.entries.${i}.description`)}
                className="input input-flex"
              />

              {!isPatent && (
                <ProofUpload
                  value={form.watch(`modules.ipr.entries.${i}.proof_file`)}
                  onChange={(url) =>
                    form.setValue(
                      `modules.ipr.entries.${i}.proof_file`,
                      url,
                      { shouldDirty: true }
                    )
                  }
                  prefix="ipr"
                  mode="file"
                />
              )}

              <button
                type="button"
                onClick={() => remove(i)}
                className="remove-link"
              >
                Remove
              </button>
            </div>

            {isPatent && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '1rem',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: '8px',
                  backgroundColor: '#f8fafc',
                }}
              >
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '14px', fontWeight: 600 }}>
                  Patent Verification
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#475569' }}>
                      Patent Number / Application Number
                    </label>
                    <input
                      placeholder="e.g. IN123456 or IN202041012345"
                      {...form.register(`modules.ipr.entries.${i}.patent_number`, {
                        onChange: () => {
                          form.setValue(`modules.ipr.entries.${i}.verification_status`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.association_type`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.matched_name`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.patent_found`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.inventor_match`, null, { shouldDirty: true })
                        }
                      })}
                      className="input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#64748b', margin: '2px 0' }}>
                    OR
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#475569' }}>
                      Patent Link
                    </label>
                    <input
                      placeholder="e.g. https://patents.google.com/patent/IN123456B/en"
                      {...form.register(`modules.ipr.entries.${i}.patent_link`, {
                        onChange: () => {
                          form.setValue(`modules.ipr.entries.${i}.verification_status`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.association_type`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.matched_name`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.patent_found`, null, { shouldDirty: true })
                          form.setValue(`modules.ipr.entries.${i}.inventor_match`, null, { shouldDirty: true })
                        }
                      })}
                      className="input"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => handleVerifyPatent(i)}
                    disabled={!!patentLoading[i]}
                    className="btn btn-secondary"
                  >
                    {patentLoading[i] ? 'Verifying...' : 'Verify Patent'}
                  </button>
                </div>

                {patentError[i] && (
                  <div style={{ marginTop: '0.5rem', color: '#dc2626', fontSize: '13px' }}>
                    {patentError[i]}
                  </div>
                )}

                <PatentVerificationResultDisplay
                  verificationStatus={verificationStatus}
                  associationType={associationType}
                  patentNumber={patentNumber}
                  title={title}
                  status={status}
                  inventors={inventors}
                  applicants={applicants}
                  currentHolder={currentHolder}
                  patentFound={form.watch(`modules.ipr.entries.${i}.patent_found`)}
                  inventorMatch={form.watch(`modules.ipr.entries.${i}.inventor_match`)}
                />
              </div>
            )}
          </div>
        )
      })}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ type: 'patent', description: '' })}
          className="add-link"
        >
          + Add IPR Entry
        </button>
      )}
    </ModuleCard>
  )
}

function FundedProjectsModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.funded_projects.entries'
  })

  return (
    <ModuleCard
      title="6. Funded Projects / Consultancy (Above ₹5L = 30 pts, ₹2–5L = 5 pts, Below ₹2L = 0 pts)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            type="number"
            step="0.1"
            placeholder="Amount (L)"
            {...form.register(
              `modules.funded_projects.entries.${i}.amount_lakhs`,
              { valueAsNumber: true }
            )}
            className="input input-w-24"
          />

          <input
            placeholder="Description"
            {...form.register(
              `modules.funded_projects.entries.${i}.description`
            )}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(`modules.funded_projects.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(
                `modules.funded_projects.entries.${i}.proof_file`,
                url
              )
            }
            prefix="funded_projects"
            mode="file"
          />

          <button
            type="button"
            onClick={() => remove(i)}
            className="remove-link"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          append({ amount_lakhs: 0, description: '' })
        }
        className="add-link"
      >
        + Add
      </button>
    </ModuleCard>
  )
}

function PhDAwardedModule({
  form,
  points,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.phd_awarded.entries',
  })

  return (
    <ModuleCard
      title="7. PhD Awarded (5 pts per student, PDF proof required)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Student Name"
            {...form.register(`modules.phd_awarded.entries.${i}.student_name`)}
            className="input input-w-48"
          />

          <input
            placeholder="Thesis Title / Details"
            {...form.register(`modules.phd_awarded.entries.${i}.thesis_title`)}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(`modules.phd_awarded.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(`modules.phd_awarded.entries.${i}.proof_file`, url)
            }
            prefix="phd_awarded"
            mode="file"
          />

          <button
            type="button"
            onClick={() => remove(i)}
            className="remove-link"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => append({ student_name: '', thesis_title: '' })}
        className="add-link"
      >
        + Add PhD Student
      </button>
    </ModuleCard>
  )
}

function FDPAttendedModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.fdp_attended.entries'
  })

  return (
    <ModuleCard
      title="6. FDP / Workshops Attended (max 2; 3d→3, 5d→5, 2w→10 pts)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Name"
            {...form.register(
              `modules.fdp_attended.entries.${i}.name`
            )}
            className="input input-w-48"
          />

          <input
            type="number"
            placeholder="Days"
            {...form.register(
              `modules.fdp_attended.entries.${i}.days`,
              { valueAsNumber: true }
            )}
            className="input input-w-20"
          />

          <ProofUpload
            value={form.watch(
              `modules.fdp_attended.entries.${i}.proof_file`
            )}
            onChange={(url) =>
              form.setValue(
                `modules.fdp_attended.entries.${i}.proof_file`,
                url
              )
            }
            prefix="fdp_attended"
            mode="file"
          />

          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="remove-link"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ name: '', days: 0 })}
          className="add-link"
        >
          + Add
        </button>
      )}
    </ModuleCard>
  )
}

function TalksModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.talks_delivered.entries'
  })

  return (
    <ModuleCard
      title="2. Invited Talks / Resource Person (max 2, 5 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Title"
            {...form.register(
              `modules.talks_delivered.entries.${i}.title`
            )}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(
              `modules.talks_delivered.entries.${i}.proof_file`
            )}
            onChange={(url) =>
              form.setValue(
                `modules.talks_delivered.entries.${i}.proof_file`,
                url
              )
            }
            prefix="talks_delivered"
            mode="file"
          />

          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="remove-link"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ title: '' })}
          className="add-link"
        >
          + Add Invited Talk
        </button>
      )}
    </ModuleCard>
  )
}

function DeptActivitiesModule({
  form,
  points,
  canAdd = true,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
  canAdd?: boolean
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.departmental_activities.entries'
  })

  return (
    <ModuleCard
      title="3. Departmental Activities (3 pts each; combined max with Institutional = 2 entries)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Description"
            {...form.register(
              `modules.departmental_activities.entries.${i}.description`
            )}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(
              `modules.departmental_activities.entries.${i}.proof_file`
            )}
            onChange={(url) =>
              form.setValue(
                `modules.departmental_activities.entries.${i}.proof_file`,
                url
              )
            }
            prefix="departmental_activities"
            mode="file"
          />

          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="remove-link"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {fields.length < 2 && canAdd && (
        <button
          type="button"
          onClick={() => append({ description: '' })}
          className="add-link"
        >
          + Add Departmental Activity
        </button>
      )}
    </ModuleCard>
  )
}

function InstActivitiesModule({
  form,
  points,
  canAdd = true,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
  canAdd?: boolean
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.institutional_activities.entries'
  })

  return (
    <ModuleCard
      title="4. Institutional Activities (5 pts each; combined max with Departmental = 2 entries)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Description"
            {...form.register(
              `modules.institutional_activities.entries.${i}.description`
            )}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(
              `modules.institutional_activities.entries.${i}.proof_file`
            )}
            onChange={(url) =>
              form.setValue(
                `modules.institutional_activities.entries.${i}.proof_file`,
                url
              )
            }
            prefix="institutional_activities"
            mode="file"
          />

          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="remove-link"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {fields.length < 2 && canAdd && (
        <button
          type="button"
          onClick={() => append({ description: '' })}
          className="add-link"
        >
          + Add Institutional Activity
        </button>
      )}
    </ModuleCard>
  )
}

function FDPOrganizedModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.fdp_organized.entries'
  })

  return (
    <ModuleCard
      title="1. FDP / Workshops / Conferences Organised (5 days = 5 pts, 3–4 days = 4 pts, 1–2 days = 3 pts)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Name"
            {...form.register(
              `modules.fdp_organized.entries.${i}.name`
            )}
            className="input input-w-48"
          />

          <input
            type="number"
            placeholder="Days"
            {...form.register(
              `modules.fdp_organized.entries.${i}.days`,
              { valueAsNumber: true }
            )}
            className="input input-w-20"
          />

          <ProofUpload
            value={form.watch(
              `modules.fdp_organized.entries.${i}.proof_file`
            )}
            onChange={(url) =>
              form.setValue(
                `modules.fdp_organized.entries.${i}.proof_file`,
                url
              )
            }
            prefix="fdp_organized"
            mode="file"
          />

          {fields.length > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="remove-link"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ name: '', days: 0 })}
          className="add-link"
        >
          + Add Organised Event
        </button>
      )}
    </ModuleCard>
  )
}

function MOUSignedModule({
  form,
  points,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.mou_signed.entries',
  })

  return (
    <ModuleCard
      title="3. MOU Signed (max 2, 3 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Organization Name"
            {...form.register(`modules.mou_signed.entries.${i}.organization`)}
            className="input input-w-48"
          />

          <input
            placeholder="Date / Details"
            {...form.register(`modules.mou_signed.entries.${i}.details`)}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(`modules.mou_signed.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(`modules.mou_signed.entries.${i}.proof_file`, url)
            }
            prefix="mou_signed"
            mode="file"
          />

          <button
            type="button"
            onClick={() => remove(i)}
            className="remove-link"
          >
            Remove
          </button>
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ organization: '', details: '' })}
          className="add-link"
        >
          + Add MOU
        </button>
      )}
    </ModuleCard>
  )
}

function HODDeanModule({
  form,
  points,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  return (
    <ModuleCard
      title="4. Role as HOD / Dean (2 marks, proof required)"
      points={points}
      defaultOpen
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            {...form.register('modules.hod_dean_role.held_role')}
            style={{ width: '1.15rem', height: '1.15rem', accentColor: 'var(--secondary)' }}
          />
          <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>
            I have served as HOD or Dean during this evaluation period (2 marks)
          </span>
        </label>

        {form.watch('modules.hod_dean_role.held_role') && (
          <div className="form-row" style={{ marginTop: '0.5rem' }}>
            <input
              placeholder="Designation & Department / Details"
              {...form.register('modules.hod_dean_role.details')}
              className="input input-flex"
            />
            <ProofUpload
              value={form.watch('modules.hod_dean_role.proof_file')}
              onChange={(url) =>
                form.setValue('modules.hod_dean_role.proof_file', url)
              }
              prefix="hod_dean_role"
              mode="file"
            />
          </div>
        )}
      </div>
    </ModuleCard>
  )
}

function IndustrialVisitsModule({
  form,
  points,
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.industrial_visits.entries',
  })

  return (
    <ModuleCard
      title="5. Organising Industrial Visits (max 2, 2 pts each)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <input
            placeholder="Company / Industry Name"
            {...form.register(`modules.industrial_visits.entries.${i}.company_name`)}
            className="input input-w-48"
          />

          <input
            placeholder="Date / Semester / Details"
            {...form.register(`modules.industrial_visits.entries.${i}.details`)}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(`modules.industrial_visits.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(`modules.industrial_visits.entries.${i}.proof_file`, url)
            }
            prefix="industrial_visits"
            mode="file"
          />

          <button
            type="button"
            onClick={() => remove(i)}
            className="remove-link"
          >
            Remove
          </button>
        </div>
      ))}

      {fields.length < 2 && (
        <button
          type="button"
          onClick={() => append({ company_name: '', details: '' })}
          className="add-link"
        >
          + Add Industrial Visit
        </button>
      )}
    </ModuleCard>
  )
}

function PublicationVerificationResult({
  verification,
}: {
  verification: any
}) {
  const crossrefFound = !!verification?.publication_found

const scopusIndexed =
  verification?.scopus_status === 'indexed' ||
  !!verification?.scopus_eid

const wosIndexed =
  verification?.web_of_science?.status === 'indexed'

const authorMatched = !!verification?.author_match

const isVerified =
  verification?.submission_method === 'title_issn'
    ? crossrefFound &&
      authorMatched &&
      (scopusIndexed || wosIndexed)
    : crossrefFound &&
      (verification?.scopus_status === 'source_covered' ||
        scopusIndexed)
  return (
    <div className="publication-verification">
      {/* Header */}
      <div className="publication-verification-header">
        <div>
          <h3>Publication Verification</h3>
          <p>Verification results from trusted publication databases</p>
        </div>

        <span
          className={
            isVerified
              ? 'verification-badge verification-badge-success'
              : 'verification-badge verification-badge-warning'
          }
        >
          {isVerified ? 'Verified' : 'Review Required'}
        </span>
      </div>

      {/* Publication Details */}
      <div className="verification-section">
        <div className="verification-section-title">
          Publication Details
        </div>

        <div className="verification-details">
          {verification?.title && (
            <div className="verification-detail">
              <span className="verification-detail-label">Title</span>
              <span className="verification-detail-value">
                {verification.title}
              </span>
            </div>
          )}

          {verification?.journal && (
            <div className="verification-detail">
              <span className="verification-detail-label">
                Journal / Source
              </span>
              <span className="verification-detail-value">
                {verification.journal}
              </span>
            </div>
          )}

          {verification?.doi && (
            <div className="verification-detail">
              <span className="verification-detail-label">DOI</span>
              <span className="verification-detail-value">
                {verification.doi}
              </span>
            </div>
          )}

          {verification?.publisher && (
            <div className="verification-detail">
              <span className="verification-detail-label">
                Publisher
              </span>
              <span className="verification-detail-value">
                {verification.publisher}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Verification Checks */}
      <div className="verification-section verification-checks-section">
        <div className="verification-section-title">
          Verification Checks
        </div>

        <div className="verification-checks">
          {/* <div
            className={`verification-check ${
              crossrefFound ? '' : 'verification-check-failed'
            }`}
          >
            <span className="verification-check-name">
              Crossref
            </span>

            <span
              className={
                crossrefFound
                  ? 'verification-status verification-status-success'
                  : 'verification-status verification-status-error'
              }
            >
              {crossrefFound
                ? '✓ Publication found'
                : '✕ Not found'}
            </span>
          </div> */}

          <div
            className={`verification-check ${
              scopusIndexed ? '' : 'verification-check-failed'
            }`}
          >
            <span className="verification-check-name">
              Scopus
            </span>

            <span
              className={
                scopusIndexed
                  ? 'verification-status verification-status-success'
                  : 'verification-status verification-status-error'
              }
            >
              {scopusIndexed ? '✓ Indexed' : '— Not available'}
            </span>
          </div>

          <div
            className={`verification-check ${
              wosIndexed ? '' : 'verification-check-failed'
            }`}
          >
            <span className="verification-check-name">
              Web of Science
            </span>

            <span
              className={
                wosIndexed
                  ? 'verification-status verification-status-success'
                  : 'verification-status verification-status-error'
              }
            >
              {wosIndexed ? '✓ Indexed' : '— Not available'}
            </span>
          </div>

          <div
            className={`verification-check ${
              authorMatched ? '' : 'verification-check-failed'
            }`}
          >
            <span className="verification-check-name">
              Author Match
            </span>

            <span
              className={
                authorMatched
                  ? 'verification-status verification-status-success'
                  : 'verification-status verification-status-error'
              }
            >
              {authorMatched ? '✓ Match found' : '✕ No match'}
            </span>
          </div>
        </div>
      </div>

      {/* Scopus Record */}
      {verification?.scopus_eid && (
        <div className="verification-section">
          <div className="verification-section-title">
            Scopus Record
          </div>

          <div className="verification-details">
            <div className="verification-detail">
              <span className="verification-detail-label">
                Scopus EID
              </span>
              <span className="verification-detail-value">
                {verification.scopus_eid}
              </span>
            </div>

            {verification?.scopus_source?.source_title && (
              <div className="verification-detail">
                <span className="verification-detail-label">
                  Source
                </span>
                <span className="verification-detail-value">
                  {verification.scopus_source.source_title}
                </span>
              </div>
            )}

            {verification?.scopus_source?.source_type && (
              <div className="verification-detail">
                <span className="verification-detail-label">
                  Document Type
                </span>
                <span className="verification-detail-value">
                  {verification.scopus_source.source_type}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}