import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Evaluation, FacultyPosition } from '../types/evaluation'
import { calculateEligibility } from '../lib/positionRules'

const statusFlow = ['Draft', 'Pending', 'HOD Approved', 'Approved', 'Rejected'] as const

function facultyPositionLabel(position?: string) {
  if (position === 'assistant_professor') return 'Assistant Professor'
  if (position === 'professor') return 'Professor'
  return 'Associate Professor'
}

function ProofLink({ url }: { url?: string }) {
  if (!url) {
    return <span style={{ opacity: 0.6 }}>No proof uploaded</span>
  }

  const fullUrl = url.startsWith('http')
    ? url
    : url

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="btn btn-outline"
      style={{ textDecoration: 'none' }}
    >
      View Proof
    </a>
  )
}

function VerificationResult({
  verification,
}: {
  verification?: {
    scopus_status?: string
    author_match?: boolean
    matched_author?: string | null
    scopus_source?: {
      status?: string
      source_title?: string
      coverage?: string
      active?: boolean
      message?: string
    }
    web_of_science?: {
      status?: string
      source?: string
      records_found?: number
      message?: string
    }
  }
}) {
  if (!verification) {
    return (
      <span style={{ opacity: 0.6 }}>
        No verification result
      </span>
    )
  }

  const scopusStatus = verification.scopus_status
  const wosStatus = verification.web_of_science?.status

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {scopusStatus && (
        <div>
          <strong>Scopus:</strong>{' '}
          <span
            style={{
              fontWeight: 600,
              color:
                scopusStatus === 'verified' ||
                  scopusStatus === 'indexed' ||
                  scopusStatus === 'found'
                  ? 'green'
                  : 'crimson',
            }}
          >
            {scopusStatus}
          </span>
        </div>
      )}

      {verification.author_match !== undefined && (
        <div>
          <strong>Author Match:</strong>{' '}
          <span
            style={{
              color: verification.author_match ? 'green' : 'crimson',
              fontWeight: 600,
            }}
          >
            {verification.author_match ? 'Yes' : 'No'}
          </span>
        </div>
      )}

      {verification.matched_author && (
        <div>
          <strong>Matched Author:</strong>{' '}
          {verification.matched_author}
        </div>
      )}

      {verification.scopus_source && (
        <>
          {verification.scopus_source.source_title && (
            <div>
              <strong>Source:</strong>{' '}
              {verification.scopus_source.source_title}
            </div>
          )}

          {verification.scopus_source.coverage && (
            <div>
              <strong>Coverage:</strong>{' '}
              {verification.scopus_source.coverage}
            </div>
          )}
        </>
      )}

      {wosStatus && (
        <div>
          <strong>Web of Science:</strong>{' '}
          <span
            style={{
              fontWeight: 600,
              color:
                wosStatus === 'indexed'
                  ? 'green'
                  : wosStatus === 'not_found'
                    ? 'crimson'
                    : 'orange',
            }}
          >
            {wosStatus}
          </span>

          {verification.web_of_science?.records_found !== undefined && (
            <span>
              {' '}
              ({verification.web_of_science.records_found} record
              {verification.web_of_science.records_found === 1 ? '' : 's'})
            </span>
          )}
        </div>
      )}

      {!scopusStatus && !wosStatus && (
        <span style={{ opacity: 0.6 }}>
          Verification pending
        </span>
      )}
    </div>
  )
}

function EvidenceRow({
  title,
  proof,
  verification,
}: {
  title: string
  proof?: string
  verification?: Parameters<typeof VerificationResult>[0]['verification']
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '0.75rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1 }}>
          <strong>{title}</strong>
        </div>

        <ProofLink url={proof} />
      </div>

      {verification && (
        <div
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <VerificationResult verification={verification} />
        </div>
      )}
    </div>
  )
}

export default function EvaluationView() {
  const { evaluationId } = useParams<{ evaluationId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  type EvaluationWithRevision = Evaluation & {
    revision_requested?: boolean
    revision_reason?: string | null
    revision_status?: string
    revision_feedback?: string | null
  }

  const [evalData, setEvalData] = useState<EvaluationWithRevision | null>(null)
  const [loading, setLoading] = useState(true)
  const [revisionReason, setRevisionReason] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)

  useEffect(() => {
    if (!evaluationId) return

    setLoading(true)
    api
      .get<EvaluationWithRevision>(`/evaluations/${evaluationId}`)
      .then(({ data }) => setEvalData(data))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [evaluationId, location.pathname])

  const requestRevision = async () => {
    if (!evaluationId) return

    const reason = revisionReason.trim()
    if (!reason) {
      alert('Please enter a reason for requesting a revision.')
      return
    }

    setSubmittingRevision(true)
    try {
      await api.post(`/evaluations/${evaluationId}/revision-request`, {
        reason,
      })

      setEvalData((current) =>
        current
          ? {
            ...current,
            revision_requested: true,
            revision_reason: reason,
            revision_status: 'pending',
            revision_feedback: null,
          }
          : current
      )
      setRevisionReason('')
      alert('Revision request sent to the HOD.')
    } catch (err: unknown) {
      const detail =
        err &&
          typeof err === 'object' &&
          'response' in err
          ? (
            err as {
              response?: {
                data?: {
                  detail?: string
                }
              }
            }
          ).response?.data?.detail
          : null

      alert(
        typeof detail === 'string'
          ? detail
          : 'Failed to submit the revision request.'
      )
    } finally {
      setSubmittingRevision(false)
    }
  }

  const approveRevisionAsHod = async () => {
    if (!evaluationId) return

    const feedback = window.prompt(
      'Enter feedback for the faculty member (optional):'
    )
    if (feedback === null) return

    try {
      await api.post(`/evaluations/${evaluationId}/revision-approve`, {
        feedback: feedback.trim(),
      })

      setEvalData((current) =>
        current
          ? {
            ...current,
            status: 'draft',
            revision_requested: false,
            revision_status: 'approved',
            revision_feedback: feedback.trim() || null,
          }
          : current
      )
      alert('Revision request approved. The faculty member can now edit this evaluation.')
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (
            err as {
              response?: { data?: { detail?: string } }
            }
          ).response?.data?.detail
          : null
      alert(typeof detail === 'string' ? detail : 'Failed to approve the revision request.')
    }
  }

  const rejectRevisionAsHod = async () => {
    if (!evaluationId) return

    const feedback = window.prompt(
      'Enter the reason for rejecting this revision request:'
    )
    if (!feedback?.trim()) {
      if (feedback !== null) {
        alert('Feedback is required when rejecting a revision request.')
      }
      return
    }

    try {
      await api.post(`/evaluations/${evaluationId}/revision-reject`, {
        feedback: feedback.trim(),
      })

      setEvalData((current) =>
        current
          ? {
            ...current,
            revision_requested: false,
            revision_status: 'rejected',
            revision_feedback: feedback.trim(),
          }
          : current
      )
      alert('Revision request rejected. Feedback has been recorded.')
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (
            err as {
              response?: { data?: { detail?: string } }
            }
          ).response?.data?.detail
          : null
      alert(typeof detail === 'string' ? detail : 'Failed to reject the revision request.')
    }
  }

  const approveAsHod = async () => {
    if (!evaluationId) return

    try {
      await api.post(`/evaluations/${evaluationId}/approve`)


      setEvalData((e) =>
        e
          ? {
            ...e,
            status: 'hod_approved',
          }
          : null
      )


      alert('Evaluation approved.')
    } catch (err: unknown) {
      const detail =
        err &&
          typeof err === 'object' &&
          'response' in err
          ? (
            err as {
              response?: {
                data?: {
                  detail?: string
                }
              }
            }
          ).response?.data?.detail
          : null

      alert(
        typeof detail === 'string'
          ? detail
          : 'Approval failed.'
      )
    }
  }

  const rejectAsHod = async () => {
    if (!evaluationId) return

    const reason = window.prompt('Enter rejection reason:')

    if (!reason?.trim()) return

    try {
      await api.post(`/evaluations/${evaluationId}/reject`, {
        reason,
      })

      setEvalData((e) =>
        e
          ? {
            ...e,
            status: 'rejected',
            reject_reason: reason,
          }
          : null
      )

      alert('Evaluation rejected.')
    } catch (err: unknown) {
      const detail =
        err &&
          typeof err === 'object' &&
          'response' in err
          ? (
            err as {
              response?: {
                data?: {
                  detail?: string
                }
              }
            }
          ).response?.data?.detail
          : null

      alert(
        typeof detail === 'string'
          ? detail
          : 'Rejection failed.'
      )
    }
  }

  const approveAsPrincipal = async () => {
    if (!evaluationId) return

    try {
      await api.post(
        `/evaluations/${evaluationId}/principal-approve`
      )

      setEvalData((e) =>
        e
          ? {
            ...e,
            status: 'approved',
          }
          : null
      )

      alert('Evaluation finally approved by Principal.')
    } catch (err: unknown) {
      const detail =
        err &&
          typeof err === 'object' &&
          'response' in err
          ? (
            err as {
              response?: {
                data?: {
                  detail?: string
                }
              }
            }
          ).response?.data?.detail
          : null

      alert(
        typeof detail === 'string'
          ? detail
          : 'Principal approval failed.'
      )
    }
  }

  const rejectAsPrincipal = async () => {
    if (!evaluationId) return

    const reason = window.prompt(
      'Enter rejection reason:'
    )

    if (!reason?.trim()) return

    try {
      await api.post(
        `/evaluations/${evaluationId}/principal-reject`,
        {
          reason,
        }
      )

      setEvalData((e) =>
        e
          ? {
            ...e,
            status: 'rejected',
            reject_reason: reason,
          }
          : null
      )

      alert('Evaluation rejected by Principal.')
    } catch (err: unknown) {
      const detail =
        err &&
          typeof err === 'object' &&
          'response' in err
          ? (
            err as {
              response?: {
                data?: {
                  detail?: string
                }
              }
            }
          ).response?.data?.detail
          : null

      alert(
        typeof detail === 'string'
          ? detail
          : 'Principal rejection failed.'
      )
    }
  }

  const downloadPdf = async () => {
    if (!evaluationId) return

    try {
      const response = await api.get<Blob>(`/evaluations/${evaluationId}/pdf`, {
        responseType: 'blob',
      })

      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `evaluation_${evaluationId}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const detail =
        err &&
          typeof err === 'object' &&
          'response' in err
          ? (
            err as {
              response?: {
                data?: {
                  detail?: string
                }
              }
            }
          ).response?.data?.detail
          : null

      alert(
        typeof detail === 'string'
          ? detail
          : 'Failed to download evaluation PDF.'
      )
    }
  }

  if (loading || !evalData) {
    return <div className="loading-text">Loading...</div>
  }

  const m = evalData.modules
  const pos = (evalData.faculty_position ?? 'associate_professor') as FacultyPosition
  const tlpScore =
    (m?.student_feedback?.points ?? 0) +
    (m?.mooc_courses?.points ?? 0) +
    (m?.departmental_activities?.points ?? 0) +
    (m?.institutional_activities?.points ?? 0)

  const researchScore =
    (m?.journal_index?.points ?? 0) +
    (m?.conference_articles?.points ?? 0) +
    (m?.book_chapters?.points ?? 0) +
    (m?.books?.points ?? 0) +
    (m?.ipr?.points ?? 0) +
    (m?.funded_projects?.points ?? 0) +
    (m?.phd_awarded?.points ?? 0)

  const othersScore =
    (m?.fdp_organized?.points ?? 0) +
    (m?.conference_organized?.points ?? 0) +
    (m?.talks_delivered?.points ?? 0) +
    (m?.mou_signed?.points ?? 0) +
    (m?.hod_dean_role?.points ?? 0) +
    (m?.industrial_visits?.points ?? 0) +
    (m?.fdp_attended?.points ?? 0)

  const eligibility = calculateEligibility(tlpScore, researchScore, othersScore, pos)

  const canEdit =
    user?.role === 'faculty' &&
    evalData.status === 'draft'

  const canHodApprove =
    user?.role === 'hod' &&
    evalData.status === 'pending'

  const canPrincipalApprove =
    user?.role === 'principal' &&
    String(evalData.status) === 'hod_approved'

  return (
    <div>
      <div className="eval-header">
        <h1
          className="page-title"
          style={{ marginBottom: 0 }}
        >
          Evaluation —{' '}
          {evalData.faculty?.employee_name ??
            evalData.faculty_id}
        </h1>

        <div
          className="form-row"
          style={{ marginBottom: 0 }}
        >
          {canEdit && (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/evaluation/${evaluationId}/edit`
                )
              }
              className="btn btn-secondary"
            >
              Edit
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const returnHodView = location.state?.returnHodView
              if (
                user?.role === 'hod' &&
                ['pending', 'approved', 'rejected', 'all'].includes(returnHodView)
              ) {
                navigate('/dashboard', { state: { returnHodView } })
              } else {
                navigate(-1)
              }
            }}
            className="btn btn-outline"
          >
            Back
          </button>
        </div>
      </div>

      <div className="eval-status-list">
        {statusFlow.map((label) => (
          <span
            key={label}
            className={`eval-status-dot ${evalData.status ===
                (label === 'HOD Approved'
                  ? 'hod_approved'
                  : label.toLowerCase())
                ? 'active'
                : 'inactive'
              }`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* SCORE SUMMARY */}
      <div className="card card-body mb-6">
        <div className="score-summary">
          <div className="total-score-card">
            <h2>Total Score</h2>
            <h1>{evalData.total_points}</h1>
            <p>Points (Raw Uncapped)</p>
          </div>

          <div
            className={`status-card status-${evalData.status === 'hod_approved'
                ? 'hod-approved'
                : evalData.status
              }`}
          >
            <h2>Status</h2>
            <h1>
              {evalData.status === 'hod_approved'
                ? 'HOD APPROVED'
                : evalData.status.toUpperCase()}
            </h1>
          </div>
        </div>

        <p className="form-label" style={{ marginBottom: '1.25rem' }}>
          Faculty Position: <strong>{facultyPositionLabel(evalData.faculty_position)}</strong>
        </p>

        {/* Category Breakdown & Eligibility Cards */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-label)' }}>
            Category Breakdown & Eligibility
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            {/* TLP Card */}
            <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #bfdbfe', backgroundColor: '#eff6ff' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e40af' }}>Part A — TLP</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1e3a8a', margin: '0.25rem 0' }}>
                {tlpScore} pts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Position Max Ref: {eligibility.tlpMax} | Min (65%): {eligibility.tlpThreshold} pts
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: eligibility.isTlpEligible ? '#dcfce7' : '#fee2e2',
                    color: eligibility.isTlpEligible ? '#15803d' : '#b91c1c',
                  }}
                >
                  {eligibility.isTlpEligible ? '✓ Eligible' : '✗ Below 65%'}
                </span>
              </div>
            </div>

            {/* Research Card */}
            <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #ddd6fe', backgroundColor: '#f5f3ff' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6d28d9' }}>Part B — Research</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4c1d95', margin: '0.25rem 0' }}>
                {researchScore} pts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Position Max Ref: {eligibility.researchMax} | Min (65%): {eligibility.researchThreshold} pts
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: eligibility.isResearchEligible ? '#dcfce7' : '#fee2e2',
                    color: eligibility.isResearchEligible ? '#15803d' : '#b91c1c',
                  }}
                >
                  {eligibility.isResearchEligible ? '✓ Eligible' : '✗ Below 65%'}
                </span>
              </div>
            </div>

            {/* Others Card */}
            <div style={{ padding: '1rem', borderRadius: '8px', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#047857' }}>Part C — Others</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#065f46', margin: '0.25rem 0' }}>
                {othersScore} pts
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Position Max Ref: {eligibility.othersMax} | No Min Requirement
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                  }}
                >
                  ✓ No Minimum
                </span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
            *Position maximums are used solely for eligibility thresholds. Actual marks are displayed uncapped.
          </div>
        </div>

        <h2 className="section-title">
          Score Breakdown
        </h2>

        <div
          className="card card-body"
          style={{ marginTop: '1rem' }}
        >
          <div className="scores-grid">
            <div><strong>Student Feedback</strong></div>
            <div>{m?.student_feedback?.points ?? 0}</div>

            <div><strong>MOOC Courses</strong></div>
            <div>{m?.mooc_courses?.points ?? 0}</div>

            <div><strong>Department Activities</strong></div>
            <div>{m?.departmental_activities?.points ?? 0}</div>

            <div><strong>Institutional Activities</strong></div>
            <div>{m?.institutional_activities?.points ?? 0}</div>

            <div><strong>Journal Index</strong></div>
            <div>{m?.journal_index?.points ?? 0}</div>

            <div><strong>Conference Articles</strong></div>
            <div>{m?.conference_articles?.points ?? 0}</div>

            <div><strong>Book Chapters</strong></div>
            <div>{m?.book_chapters?.points ?? 0}</div>

            <div><strong>Books</strong></div>
            <div>{m?.books?.points ?? 0}</div>

            <div><strong>IPR</strong></div>
            <div>{m?.ipr?.points ?? 0}</div>

            <div><strong>Funded Projects</strong></div>
            <div>{m?.funded_projects?.points ?? 0}</div>

            <div><strong>PhD Awarded</strong></div>
            <div>{m?.phd_awarded?.points ?? 0}</div>

            <div><strong>FDP Organized</strong></div>
            <div>{m?.fdp_organized?.points ?? 0}</div>

            <div><strong>Conferences Organised</strong></div>
            <div>{m?.conference_organized?.points ?? 0}</div>

            <div><strong>Talks Delivered</strong></div>
            <div>{m?.talks_delivered?.points ?? 0}</div>

            <div><strong>MOU Signed</strong></div>
            <div>{m?.mou_signed?.points ?? 0}</div>

            <div><strong>HOD / Dean Role</strong></div>
            <div>{m?.hod_dean_role?.points ?? 0}</div>

            <div><strong>Industrial Visits</strong></div>
            <div>{m?.industrial_visits?.points ?? 0}</div>

            <div><strong>FDP Attended</strong></div>
            <div>{m?.fdp_attended?.points ?? 0}</div>
          </div>
        </div>
      </div>

      {/* SUBMITTED EVIDENCE */}
      <div className="card card-body mb-6">
        <h2 className="section-title">
          Submitted Evidence
        </h2>

        {/* MOOC COURSES */}
        {m?.mooc_courses?.entries && m.mooc_courses.entries.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>MOOC Courses</h3>
            {m.mooc_courses.entries.map((entry, index) => (
              <EvidenceRow
                key={index}
                title={entry.title || `MOOC Course ${index + 1}`}
                proof={entry.proof_file}
              />
            ))}
          </div>
        )}

        {/* JOURNAL */}
        {(m?.journal_index?.title ||
          m?.journal_index?.scopus_link) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3>Journal / Publication</h3>

              <EvidenceRow
                title={
                  m.journal_index.title ||
                  m.journal_index.scopus_link ||
                  'Journal publication'
                }
                proof={m.journal_index.scopus_link}
                verification={
                  m.journal_index.verification
                }
              />
            </div>
          )}

        {/* CONFERENCE ARTICLES */}
        {m?.conference_articles?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Conference Articles</h3>

            {m.conference_articles.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    entry.title ||
                    `Conference Article ${index + 1}`
                  }
                  proof={entry.proof_file}
                  verification={entry.verification}
                />
              )
            )}
          </div>
        )}

        {/* BOOK CHAPTERS */}
        {m?.book_chapters?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Book Chapters</h3>

            {m.book_chapters.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    entry.title ||
                    `Book Chapter ${index + 1}`
                  }
                  proof={entry.proof_file}
                  verification={entry.verification}
                />
              )
            )}
          </div>
        )}

        {/* BOOKS */}
        {m?.books?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Books</h3>

            {m.books.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    `${entry.title || `Book ${index + 1}`} ` +
                    `(${entry.type})`
                  }
                  proof={entry.proof_file}
                />
              )
            )}
          </div>
        )}

        {/* IPR */}
        {m?.ipr?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>IPR</h3>

            {m.ipr.entries.map(
              (entry, index) => {
                const isPatent = entry.type === 'patent'
                const isPatentEligible =
                  entry.verification_status === 'verified' &&
                  entry.patent_found === true &&
                  entry.inventor_match === true &&
                  entry.association_type === 'inventor'

                let statusBadgeText = 'Manually reviewed'
                let statusBadgeStyle = { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }

                if (isPatent) {
                  if (isPatentEligible) {
                    statusBadgeText = 'Verified (Inventor Match - 5 pts)'
                    statusBadgeStyle = { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
                  } else if (entry.verification_status === 'verified') {
                    statusBadgeText = 'Verified (Applicant/Holder Only - 0 pts)'
                    statusBadgeStyle = { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }
                  } else if (entry.verification_status === 'not_verified') {
                    statusBadgeText = 'Not Verified (0 pts)'
                    statusBadgeStyle = { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }
                  } else if (entry.verification_status === 'not_found') {
                    statusBadgeText = 'Not Found (0 pts)'
                    statusBadgeStyle = { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }
                  } else if (entry.verification_status === 'unable_to_verify') {
                    statusBadgeText = 'Unable to Verify (0 pts)'
                    statusBadgeStyle = { backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
                  } else {
                    statusBadgeText = 'Pending Verification (0 pts)'
                    statusBadgeStyle = { backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1' }
                  }
                } else {
                  if (entry.verification_status === 'verified') {
                    statusBadgeText = 'Automatically verified'
                    statusBadgeStyle = { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
                  } else if (entry.verification_status === 'not_verified') {
                    statusBadgeText = 'Not verified'
                    statusBadgeStyle = { backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }
                  } else if (entry.verification_status === 'unable_to_verify') {
                    statusBadgeText = 'Unable to verify'
                    statusBadgeStyle = { backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
                  }
                }

                const applicantHolder =
                  (entry.applicants && entry.applicants.length > 0 ? entry.applicants.join(', ') : entry.current_holder) || 'None listed'

                let associationDisplay = 'None'
                if (entry.association_type === 'inventor') {
                  associationDisplay = 'Inventor (Faculty member is listed as an inventor)'
                } else if (entry.association_type === 'applicant' || entry.association_type === 'holder') {
                  associationDisplay = 'Applicant / Holder (Faculty member is listed as an applicant/holder - 0 pts)'
                }

                return (
                  <div
                    key={index}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <strong>
                          {`${entry.type.toUpperCase()}: ${entry.title || entry.description || `IPR ${index + 1}`
                            }`}
                        </strong>
                      </div>

                      {!isPatent && <ProofLink url={entry.proof_file} />}
                    </div>

                    {isPatent && (entry.patent_number || entry.verification_status) && (
                      <div
                        style={{
                          marginTop: '0.75rem',
                          padding: '0.875rem 1rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          backgroundColor: '#fafafa',
                          fontSize: '13px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
                          <strong style={{ fontSize: '13px' }}>Patent Information</strong>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              ...statusBadgeStyle,
                            }}
                          >
                            {statusBadgeText}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 1rem' }}>
                          <span style={{ fontWeight: 600, color: '#64748b' }}>Patent:</span>
                          <span>Patent</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Patent Number:</span>
                          <span>{entry.patent_number || entry.application_number || 'N/A'}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Title:</span>
                          <span>{entry.title || entry.description || 'N/A'}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Status:</span>
                          <span>{entry.status || 'Published'}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Inventors:</span>
                          <span>{entry.inventors && entry.inventors.length > 0 ? entry.inventors.join(', ') : 'None listed'}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Applicant / Holder:</span>
                          <span>{applicantHolder}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Verification Source:</span>
                          <span>{entry.verification_source || 'Not specified'}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Faculty Association:</span>
                          <span>{associationDisplay}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Verification Status:</span>
                          <span style={{ fontWeight: 600 }}>{statusBadgeText}</span>

                          <span style={{ fontWeight: 600, color: '#64748b' }}>Points Awarded:</span>
                          <span style={{ fontWeight: 700, color: isPatentEligible ? '#16a34a' : '#dc2626' }}>
                            {isPatentEligible ? '5 pts' : '0 pts'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              }
            )}
          </div>
        )}

        {/* FUNDED PROJECTS */}
        {m?.funded_projects?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Funded Projects</h3>

            {m.funded_projects.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    entry.description ||
                    `Funded Project ${index + 1}`
                  }
                  proof={entry.proof_file}
                />
              )
            )}
          </div>
        )}

        {/* PHD AWARDED */}
        {m?.phd_awarded?.entries && m.phd_awarded.entries.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>PhD Awarded</h3>
            {m.phd_awarded.entries.map((entry, index) => (
              <EvidenceRow
                key={index}
                title={`Student: ${entry.student_name || 'N/A'}${entry.thesis_title ? ` — ${entry.thesis_title}` : ''}`}
                proof={entry.proof_file}
              />
            ))}
          </div>
        )}

        {/* FDP ATTENDED */}
        {m?.fdp_attended?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>FDP / Workshops Attended</h3>

            {m.fdp_attended.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    `${entry.name || `FDP ${index + 1}`} ` +
                    `(${entry.days} days)`
                  }
                  proof={entry.proof_file}
                />
              )
            )}
          </div>
        )}

        {/* TALKS */}
        {m?.talks_delivered?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Talks Delivered</h3>

            {m.talks_delivered.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    entry.title ||
                    `Talk ${index + 1}`
                  }
                  proof={entry.proof_file}
                />
              )
            )}
          </div>
        )}

        {/* MOU SIGNED */}
        {m?.mou_signed?.entries && m.mou_signed.entries.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>MOU Signed</h3>
            {m.mou_signed.entries.map((entry, index) => (
              <EvidenceRow
                key={index}
                title={`Organization: ${entry.organization || 'N/A'}${entry.details ? ` (${entry.details})` : ''}`}
                proof={entry.proof_file}
              />
            ))}
          </div>
        )}

        {/* ROLE AS HOD / DEAN */}
        {m?.hod_dean_role?.held_role && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Role as HOD / Dean</h3>
            <EvidenceRow
              title={`Served as HOD / Dean${m.hod_dean_role.details ? `: ${m.hod_dean_role.details}` : ''}`}
              proof={m.hod_dean_role.proof_file}
            />
          </div>
        )}

        {/* INDUSTRIAL VISITS */}
        {m?.industrial_visits?.entries && m.industrial_visits.entries.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Industrial Visits</h3>
            {m.industrial_visits.entries.map((entry, index) => (
              <EvidenceRow
                key={index}
                title={`Company: ${entry.company_name || 'N/A'}${entry.details ? ` (${entry.details})` : ''}`}
                proof={entry.proof_file}
              />
            ))}
          </div>
        )}

        {/* DEPARTMENTAL */}
        {m?.departmental_activities?.entries?.length >
          0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3>Departmental Activities</h3>

              {m.departmental_activities.entries.map(
                (entry, index) => (
                  <EvidenceRow
                    key={index}
                    title={
                      entry.description ||
                      `Department Activity ${index + 1}`
                    }
                    proof={entry.proof_file}
                  />
                )
              )}
            </div>
          )}

        {/* INSTITUTIONAL */}
        {m?.institutional_activities?.entries?.length >
          0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3>Institutional Activities</h3>

              {m.institutional_activities.entries.map(
                (entry, index) => (
                  <EvidenceRow
                    key={index}
                    title={
                      entry.description ||
                      `Institutional Activity ${index + 1}`
                    }
                    proof={entry.proof_file}
                  />
                )
              )}
            </div>
          )}

        {/* FDP ORGANIZED */}
        {m?.fdp_organized?.entries?.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>FDP / Events Organized</h3>

            {m.fdp_organized.entries.map(
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    `${entry.name || `Event ${index + 1}`} ` +
                    `(${entry.days} days)`
                  }
                  proof={entry.proof_file}
                />
              )
            )}
          </div>
        )}

        {/* CONFERENCES ORGANISED */}
        {m?.conference_organized?.role && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3>Conferences Organised</h3>
            <EvidenceRow
              title={`${m.conference_organized.role}${m.conference_organized.details ? ` — ${m.conference_organized.details}` : ''} (${m.conference_organized.confirmed ? 'Confirmed' : 'Unconfirmed'})`}
              proof={m.conference_organized.proof_file || undefined}
            />
          </div>
        )}

        {!m?.journal_index?.title &&
          !m?.journal_index?.scopus_link &&
          !m?.mooc_courses?.entries?.length &&
          !m?.conference_articles?.entries?.length &&
          !m?.book_chapters?.entries?.length &&
          !m?.books?.entries?.length &&
          !m?.ipr?.entries?.length &&
          !m?.funded_projects?.entries?.length &&
          !m?.phd_awarded?.entries?.length &&
          !m?.mou_signed?.entries?.length &&
          !m?.hod_dean_role?.held_role &&
          !m?.industrial_visits?.entries?.length &&
          !m?.fdp_attended?.entries?.length &&
          !m?.talks_delivered?.entries?.length &&
          !m?.departmental_activities?.entries?.length &&
          !m?.institutional_activities?.entries?.length &&
          !m?.fdp_organized?.entries?.length &&
          !m?.conference_organized?.role && (
            <p style={{ opacity: 0.6 }}>
              No submitted evidence found.
            </p>
          )}
      </div>

      {/* FACULTY REVISION REQUEST */}
      {user?.role === 'faculty' && evalData.status !== 'draft' && (
        <div className="card card-body mb-6">
          <h2 className="section-title">Revision Request</h2>

          {evalData.revision_status === 'pending' ? (
            <div>
              <p>
                Your revision request is <strong>awaiting review by the Head of Department</strong>.
              </p>
              {evalData.revision_reason && (
                <p>
                  <strong>Reason submitted:</strong> {evalData.revision_reason}
                </p>
              )}
            </div>
          ) : (
            <>
              {evalData.revision_feedback && (
                <p>
                  <strong>Feedback from the Head of Department:</strong> {evalData.revision_feedback}
                </p>
              )}
              <p style={{ marginTop: 0, marginBottom: '18px', lineHeight: 1.6 }}>
                Provide the reason for requesting a revision and identify the
                information that requires correction. The evaluation will remain
                locked until the Head of Department approves this request.
              </p>
              <label
                htmlFor="revision-reason"
                style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}
              >
                Reason for revision <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="revision-reason"
                name="revision-reason"
                rows={5}
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                placeholder="Enter the reason for this request, including the details that require correction."
                disabled={submittingRevision}
                required
                aria-describedby="revision-reason-help"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: '820px',
                  minHeight: '140px',
                  boxSizing: 'border-box',
                  padding: '14px 16px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  backgroundColor: 'var(--surface, #ffffff)',
                  color: 'var(--text, #1f2937)',
                  font: 'inherit',
                  fontSize: '15px',
                  lineHeight: 1.5,
                  resize: 'vertical',
                  outlineOffset: '2px',
                  marginBottom: '8px',
                }}
              />
              <p
                id="revision-reason-help"
                style={{ color: 'var(--muted, #64748b)', fontSize: '13px', marginTop: 0, marginBottom: '20px' }}
              >
                This explanation will be reviewed by the Head of Department.
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={requestRevision}
                  disabled={submittingRevision || !revisionReason.trim()}
                >
                  {submittingRevision ? 'Submitting...' : 'Submit Revision Request'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* HOD REVISION REQUEST REVIEW */}
      {user?.role === 'hod' && evalData.revision_status === 'pending' && (
        <div className="card card-body mb-6">
          <h2 className="section-title">Revision Request Review</h2>
          <p style={{ marginTop: 0, lineHeight: 1.6 }}>
            The faculty member has requested permission to revise this evaluation.
            Review the reason below and approve or reject the request.
          </p>
          <div
            style={{
              padding: '14px 16px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              backgroundColor: 'var(--surface, #ffffff)',
              marginBottom: '18px',
              whiteSpace: 'pre-wrap',
            }}
          >
            <strong>Reason submitted</strong>
            <p style={{ marginBottom: 0, marginTop: '8px' }}>
              {evalData.revision_reason || 'No reason provided.'}
            </p>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-success"
              onClick={approveRevisionAsHod}
            >
              Approve Revision
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={rejectRevisionAsHod}
            >
              Reject Revision
            </button>
          </div>
        </div>
      )}

      {/* APPROVAL */}
      <div
        className="card card-body"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        <h2 className="section-title">
          Approval
        </h2>

        <p
          className="form-label"
          style={{ marginTop: 0 }}
        >
          Status:{' '}
          <strong>
            {evalData.status === 'hod_approved'
              ? 'HOD Approved'
              : evalData.status}
          </strong>
        </p>

        <div className="form-actions">
          {canHodApprove && (
            <>
              <button
                type="button"
                onClick={approveAsHod}
                className="btn btn-success"
              >
                Approve
              </button>

              <button
                type="button"
                onClick={rejectAsHod}
                className="btn btn-danger"
              >
                Reject
              </button>
            </>
          )}
          {canPrincipalApprove && (
            <>
              <button
                type="button"
                onClick={approveAsPrincipal}
                className="btn btn-success"
              >
                Approve
              </button>

              <button
                type="button"
                onClick={rejectAsPrincipal}
                className="btn btn-danger"
              >
                Reject
              </button>
            </>
          )}

          {(user?.role === 'faculty' || user?.role === 'hod') && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={downloadPdf}
            >
              Generate PDF
            </button>
          )}
        </div>
      </div>
    </div>
  )
}