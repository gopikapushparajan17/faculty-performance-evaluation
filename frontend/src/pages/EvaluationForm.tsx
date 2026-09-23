import { useParams, useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import ModuleCard from '../components/ModuleCard'
import ProofUpload from '../components/ProofUpload'
import {
  studentFeedbackPoints,
  conferencePoints,
  bookChaptersPoints,
  booksPoints,
  iprPoints,
  fundedPoints,
  fdpAttendedPoints,
  talksPoints,
  deptActivitiesPoints,
  instActivitiesPoints,
  fdpOrganizedPoints,
} from '../lib/pointRules'
import type { Evaluation, EvaluationModules, FacultyPosition } from '../types/evaluation'

const defaultModules: EvaluationModules = {
  student_feedback: { percentage: '', points: 0 },
  journal_index: { value: '', points: 0 },
  conference_articles: { entries: [], points: 0 },
  book_chapters: { entries: [], points: 0 },
  books: { entries: [], points: 0 },
  ipr: { entries: [], points: 0 },
  funded_projects: { entries: [], points: 0 },
  fdp_attended: { entries: [], points: 0 },
  talks_delivered: { entries: [], points: 0 },
  departmental_activities: { entries: [], points: 0 },
  institutional_activities: { entries: [], points: 0 },
  fdp_organized: { entries: [], points: 0 },
}

const SCOPUS_REGEX = /^https:\/\/www\.scopus\.com\/.*/i
const isValidScopus = (url?: string) =>
  !!url && SCOPUS_REGEX.test(url.trim())

const hasText = (v?: string) => !!v && v.trim().length > 0
const isValidPublicationUrl = (url?: string) =>
  !!url && (/^https?:\/\/.+/i.test(url.trim()) || /^10\.\d{4,9}\/\S+$/i.test(url.trim()))
const isValidFileProof = (url?: string) => !!url && url.trim().length > 0 && !isValidPublicationUrl(url)

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

  const computed = useMemo(() => {
    const m = modules ?? defaultModules

    const sf = hasText(m.student_feedback?.percentage)
      ? studentFeedbackPoints(Number(m.student_feedback!.percentage), facultyPosition)
      : 0

    const journal =
      hasText(m.journal_index?.scopus_link) &&
      m.journal_index?.verification?.scopus_status === 'source_covered'
        ? 4
        : 0

    const confEntries = m.conference_articles?.entries ?? []
    const validConf = confEntries.filter((e) => hasText(e.title) && isValidScopus(e.proof_file))
    const conf = conferencePoints(validConf.length)

    const bcEntries = m.book_chapters?.entries ?? []
    const validBc = bcEntries.filter((e) => hasText(e.title) && isValidScopus(e.proof_file))
    const bc = bookChaptersPoints(validBc.length)

    const bookEntries = m.books?.entries ?? []
    const validBooks = bookEntries.filter((e) => hasText(e.title) && isValidFileProof(e.proof_file))
    const books = booksPoints(validBooks)

    const iprEntries = m.ipr?.entries ?? []
    const validIpr = iprEntries.filter((e) => hasText(e.description) && isValidFileProof(e.proof_file))
    const ipr = iprPoints(validIpr)

    const fundedEntries = m.funded_projects?.entries ?? []
    const validFunded = fundedEntries.filter(
      (e) => (Number(e.amount_lakhs) || 0) > 0 && hasText(e.description) && isValidFileProof(e.proof_file),
    )
    const funded = validFunded.reduce((s, e) => s + fundedPoints(Number(e.amount_lakhs) || 0), 0)

    const fdpEntries = m.fdp_attended?.entries ?? []
    const validFdp = fdpEntries.filter(
      (e) => hasText(e.name) && (Number(e.days) || 0) > 0 && isValidFileProof(e.proof_file),
    )
    const fdpA = fdpAttendedPoints(validFdp)

    const talksEntries = m.talks_delivered?.entries ?? []
    const validTalks = talksEntries.filter((e) => hasText(e.title) && isValidFileProof(e.proof_file))
    const talks = talksPoints(validTalks.length)

    const deptEntries = m.departmental_activities?.entries ?? []
    const validDept = deptEntries.filter((e) => hasText(e.description) && isValidFileProof(e.proof_file))
    const dept = deptActivitiesPoints(validDept.length)

    const instEntries = m.institutional_activities?.entries ?? []
    const validInst = instEntries.filter((e) => hasText(e.description) && isValidFileProof(e.proof_file))
    const inst = instActivitiesPoints(validInst.length)

    const fdpOrgEntries = m.fdp_organized?.entries ?? []
    const validFdpOrg = fdpOrgEntries.filter(
      (e) => hasText(e.name) && (Number(e.days) || 0) > 0 && isValidFileProof(e.proof_file),
    )
    const fdpO = fdpOrganizedPoints(validFdpOrg)

    const total = sf + journal + conf + bc + books + ipr + funded + fdpA + talks + dept + inst + fdpO

    return {
      student_feedback: sf,
      journal_index: journal,
      conference_articles: conf,
      book_chapters: bc,
      books,
      ipr,
      funded_projects: funded,
      fdp_attended: fdpA,
      talks_delivered: talks,
      departmental_activities: dept,
      institutional_activities: inst,
      fdp_organized: fdpO,
      total,
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

        form.reset({
          ...data,
          id: data.id,
          faculty_position: data.faculty_position ?? 'associate_professor',
          modules: data.modules ?? defaultModules,
        })
      }).catch(() => {})
    } else if (facultyId) {
      form.setValue('faculty_id', facultyId)
    }
  }, [editId])

  const persistDraft = async (data: FormValues) => {
    const modules = {
      ...(data.modules ?? defaultModules),

      student_feedback: {
        ...(data.modules?.student_feedback ?? defaultModules.student_feedback),
        points: computed.student_feedback,
      },

      journal_index: {
        ...(data.modules?.journal_index ?? defaultModules.journal_index),
        points: computed.journal_index,
      },

      conference_articles: {
        ...(data.modules?.conference_articles ?? defaultModules.conference_articles),
        points: computed.conference_articles,
      },

      book_chapters: {
        ...(data.modules?.book_chapters ?? defaultModules.book_chapters),
        points: computed.book_chapters,
      },

      books: {
        ...(data.modules?.books ?? defaultModules.books),
        points: computed.books,
      },

      ipr: {
        ...(data.modules?.ipr ?? defaultModules.ipr),
        points: computed.ipr,
      },

      funded_projects: {
        ...(data.modules?.funded_projects ?? defaultModules.funded_projects),
        points: computed.funded_projects,
      },

      fdp_attended: {
        ...(data.modules?.fdp_attended ?? defaultModules.fdp_attended),
        points: computed.fdp_attended,
      },

      talks_delivered: {
        ...(data.modules?.talks_delivered ?? defaultModules.talks_delivered),
        points: computed.talks_delivered,
      },

      departmental_activities: {
        ...(data.modules?.departmental_activities ?? defaultModules.departmental_activities),
        points: computed.departmental_activities,
      },

      institutional_activities: {
        ...(data.modules?.institutional_activities ?? defaultModules.institutional_activities),
        points: computed.institutional_activities,
      },

      fdp_organized: {
        ...(data.modules?.fdp_organized ?? defaultModules.fdp_organized),
        points: computed.fdp_organized,
      },
    }

    const payload: FormValues = {
      ...data,
      faculty_id: facultyId ?? data.faculty_id,
      faculty_position: data.faculty_position ?? 'associate_professor',
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
    const url = form.getValues('modules.journal_index.scopus_link')?.trim()

    if (!url) {
      setVerificationError('Please enter a DOI or publication URL first.')
      return
    }

    setVerificationLoading(true)
    setVerificationError('')

    try {
      const { data } = await api.post('/publications/verify', {
        publication_url: url,
      })

      form.setValue(
        'modules.journal_index.verification',
        data,
        { shouldDirty: true }
      )

      if (data.title) {
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
          : 'Publication verification failed. Please check the link and try again.'
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

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '0.5rem' }}>Evaluation Form</h1>

      <p className="form-label" style={{ marginBottom: '1.5rem' }}>
        Academic year: {form.watch('academic_year')}
      </p>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label className="form-label" style={{ display: 'block', marginBottom: '0.5rem' }}>
            Faculty Position
          </label>

          <select {...form.register('faculty_position')} className="input">
            <option value="assistant_professor">Assistant Professor</option>
            <option value="associate_professor">Associate Professor</option>
            <option value="professor">Professor</option>
          </select>
        </div>

        {/* Module 1: Student Feedback */}
        <ModuleCard title="1. Student Feedback" points={computed.student_feedback} defaultOpen>
          <p className="form-label" style={{ marginBottom: '0.5rem' }}>
            {facultyPosition === 'assistant_professor' && '≥85% → 20 pts, 70–84% → 15, 60–69% → 12, <60% → 10'}
            {facultyPosition === 'associate_professor' && '≥85% → 15 pts, 70–84% → 10, 60–69% → 7, <60% → 5'}
            {facultyPosition === 'professor' && '≥85% → 10 pts, 70–84% → 8, 60–69% → 5, <60% → 3'}
          </p>

          <select {...form.register('modules.student_feedback.percentage')} className="input input-w-40">
            <option value="">Select %</option>
            {['90', '85', '80', '75', '70', '65', '60', '55', '50'].map((p) => (
              <option key={p} value={p}>{p}%</option>
            ))}
          </select>
        </ModuleCard>

        {/* Module 2: Journal Index (Scopus required when filled) */}
        <ModuleCard title="2. Journal Index" points={computed.journal_index} defaultOpen>

          <div className="form-row">

            <input
              type="text"
              placeholder="Journal Title"
              {...form.register('modules.journal_index.title')}
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
                !form.watch('modules.journal_index.scopus_link')
              }
              className="btn btn-secondary"
            >
              {verificationLoading ? 'Verifying...' : 'Verify'}
            </button>

            <button
              type="button"
              onClick={() => {
                form.setValue('modules.journal_index.title', '')
                form.setValue('modules.journal_index.scopus_link', '')
                form.setValue('modules.journal_index.value', '')
                form.setValue('modules.journal_index.verification', undefined)
                setVerificationError('')
              }}
              className="remove-link"
            >
              Remove
            </button>

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
                    form.watch('modules.journal_index.verification')?.publication_found &&
                    form.watch('modules.journal_index.verification')?.scopus_status ===
                      'source_covered'
                      ? 'verification-badge-success'
                      : 'verification-badge-warning'
                  }`}
                >
                  {form.watch('modules.journal_index.verification')?.publication_found &&
                  form.watch('modules.journal_index.verification')?.scopus_status ===
                    'source_covered'
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
                  <div className="verification-check">
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
                  </div>

                  <div className="verification-check">
                    <div className="verification-check-name">Scopus</div>

                    <span
                      className={`verification-status ${
                        form.watch('modules.journal_index.verification')?.scopus_status ===
                        'source_covered'
                          ? 'verification-status-success'
                          : 'verification-status-error'
                      }`}
                    >
                      {form.watch('modules.journal_index.verification')?.scopus_status ===
                      'source_covered'
                        ? '✓ Source covered'
                        : '✕ Source not covered'}
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
                        ? '✓ Indexed'
                        : '✕ Not indexed'}
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

        {/* Module 3: Conference Articles - max 4, 4 pts each */}
        <ConferenceArticlesModule
          form={form}
          points={computed.conference_articles}
          verifyPublication={verifyConferencePublication}
          verificationLoading={conferenceVerificationLoading}
          verificationError={conferenceVerificationError}
          setVerificationError={setConferenceVerificationError}
        />

        {/* Module 4: Book Chapters - max 4, 6 pts each */}
        <BookChaptersModule
          form={form}
          points={computed.book_chapters}
          verifyPublication={verifyBookChapterPublication}
          verificationLoading={bookChapterVerificationLoading}
          verificationError={bookChapterVerificationError}
          setVerificationError={setBookChapterVerificationError}
        />

        {/* Module 5: Books - max 3, authored 20 / edited 10 */}
        <BooksModule form={form} points={computed.books} />

        {/* Module 6: IPR */}
        <IPRModule form={form} points={computed.ipr} />

        {/* Module 7: Funded Projects */}
        <FundedProjectsModule form={form} points={computed.funded_projects} />

        {/* Module 8: FDP Attended - max 2 */}
        <FDPAttendedModule form={form} points={computed.fdp_attended} />

        {/* Module 9: Talks - max 2, 5 pts each */}
        <TalksModule form={form} points={computed.talks_delivered} />

        {/* Module 10: Departmental - max 3, 3 pts each */}
        <DeptActivitiesModule form={form} points={computed.departmental_activities} />

        {/* Module 11: Institutional - max 3, 5 pts each */}
        <InstActivitiesModule form={form} points={computed.institutional_activities} />

        {/* Module 12: FDP Organized - max 2 */}
        <FDPOrganizedModule form={form} points={computed.fdp_organized} />

        <div className="total-box">
          <p>Grand Total: {computed.total} points</p>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save Draft
          </button>

          {user?.role === 'faculty' && form.watch('status') === 'draft' && (
            <button type="button" onClick={submitEval} className="btn btn-secondary">
              Submit
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
      title="3. Conference Articles (max 4, 4 pts each)"
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

      {fields.length < 4 && (
        <button
          type="button"
          onClick={() => append({ title: '' })}
          className="add-link"
        >
          + Add
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
      title="4. Book Chapters (max 4, 6 pts each)"
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

      {fields.length < 4 && (
        <button
          type="button"
          onClick={() => append({ title: '' })}
          className="add-link"
        >
          + Add
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
      title="5. Authored / Edited Books (max 3, Authored 20 / Edited 10 pts)"
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

      {fields.length < 3 && (
        <button
          type="button"
          onClick={() => append({ title: '', type: 'authored' })}
          className="add-link"
        >
          + Add
        </button>
      )}
    </ModuleCard>
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

  return (
    <ModuleCard
      title="6. IPR (Patent 30, Copyright 10, Trademark 10 pts)"
      points={points}
      defaultOpen
    >
      {fields.map((_, i) => (
        <div key={i} className="form-row">
          <select
            {...form.register(`modules.ipr.entries.${i}.type`)}
            className="input input-w-32"
          >
            <option value="patent">Patent</option>
            <option value="copyright">Copyright</option>
            <option value="trademark">Trademark</option>
          </select>

          <input
            placeholder="Description"
            {...form.register(`modules.ipr.entries.${i}.description`)}
            className="input input-flex"
          />

          <ProofUpload
            value={form.watch(`modules.ipr.entries.${i}.proof_file`)}
            onChange={(url) =>
              form.setValue(
                `modules.ipr.entries.${i}.proof_file`,
                url
              )
            }
            prefix="ipr"
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
        onClick={() => append({ type: 'patent', description: '' })}
        className="add-link"
      >
        + Add
      </button>
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
      title="7. Funded Projects / Consultancy (Lakhs: >1→5, 1-2→10, 2-3→12, 3-5→15, >5→20)"
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
      title="8. FDP / Workshops Attended (max 2; 3d→3, 5d→5, 2w→10 pts)"
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
      title="9. Talks Delivered (max 2, 5 pts each)"
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
          + Add
        </button>
      )}
    </ModuleCard>
  )
}

function DeptActivitiesModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.departmental_activities.entries'
  })

  return (
    <ModuleCard
      title="10. Departmental Activities (max 3, 3 pts each)"
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

      {fields.length < 3 && (
        <button
          type="button"
          onClick={() => append({ description: '' })}
          className="add-link"
        >
          + Add
        </button>
      )}
    </ModuleCard>
  )
}

function InstActivitiesModule({
  form,
  points
}: {
  form: ReturnType<typeof useForm<FormValues>>
  points: number
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'modules.institutional_activities.entries'
  })

  return (
    <ModuleCard
      title="11. Institutional Activities (max 3, 5 pts each)"
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

      {fields.length < 3 && (
        <button
          type="button"
          onClick={() => append({ description: '' })}
          className="add-link"
        >
          + Add
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
      title="12. FDP / Workshops / Conferences Organized (max 2; 1d→2, 3d→5, 5d→10 pts)"
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
          + Add
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
    verification?.scopus_status === 'source_covered' ||
    !!verification?.scopus_eid

  const wosIndexed =
    verification?.web_of_science?.status === 'indexed'

  const authorMatched = !!verification?.author_match

  const isVerified = crossrefFound && scopusIndexed

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
          <div
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
          </div>

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