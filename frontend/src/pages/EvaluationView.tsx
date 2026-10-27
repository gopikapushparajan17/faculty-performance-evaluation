import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Evaluation } from '../types/evaluation'

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
    : `http://localhost:8000${url}`

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
      .catch(() => {})
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
            className={`eval-status-dot ${
              evalData.status ===
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
            <p>Points</p>
          </div>

          <div
  className={`status-card status-${
    evalData.status === 'hod_approved'
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

        <p className="form-label" style={{ marginBottom: '1rem' }}>
          Faculty Position: {facultyPositionLabel(evalData.faculty_position)}
        </p>

        <h2 className="section-title">
          Score Breakdown
        </h2>

        <div
          className="card card-body"
          style={{ marginTop: '1rem' }}
        >
          <div className="scores-grid">
            <div>
              <strong>Student Feedback</strong>
            </div>
            <div>
              {m?.student_feedback?.points ?? 0}
            </div>
            <div>
  <strong>Journal Index</strong>
</div>
            <div>
              {m?.journal_index?.points ?? 0}
            </div>
            <div>
              <strong>Conference Articles</strong>
            </div>
            <div>
              {m?.conference_articles?.points ?? 0}
            </div>

            <div>
              <strong>Book Chapters</strong>
            </div>
            <div>
              {m?.book_chapters?.points ?? 0}
            </div>

            <div>
              <strong>Books</strong>
            </div>
            <div>
              {m?.books?.points ?? 0}
            </div>

            <div>
              <strong>IPR</strong>
            </div>
            <div>{m?.ipr?.points ?? 0}</div>

            <div>
              <strong>Funded Projects</strong>
            </div>
            <div>
              {m?.funded_projects?.points ?? 0}
            </div>

            <div>
              <strong>FDP Attended</strong>
            </div>
            <div>
              {m?.fdp_attended?.points ?? 0}
            </div>

            <div>
              <strong>Talks Delivered</strong>
            </div>
            <div>
              {m?.talks_delivered?.points ?? 0}
            </div>

            <div>
              <strong>Department Activities</strong>
            </div>
            <div>
              {m?.departmental_activities?.points ?? 0}
            </div>

            <div>
              <strong>Institutional Activities</strong>
            </div>
            <div>
              {m?.institutional_activities?.points ?? 0}
            </div>

            <div>
              <strong>FDP Organized</strong>
            </div>
            <div>
              {m?.fdp_organized?.points ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* SUBMITTED EVIDENCE */}
      <div className="card card-body mb-6">
        <h2 className="section-title">
          Submitted Evidence
        </h2>

        

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
                let statusBadgeText = 'Manually reviewed'
                let statusBadgeStyle = { backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }

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

                const applicantHolder =
                  (entry.applicants && entry.applicants.length > 0 ? entry.applicants.join(', ') : entry.current_holder) || 'None listed'

                let associationDisplay = 'None'
                if (entry.association_type === 'inventor') {
                  associationDisplay = 'Inventor (Faculty member is listed as an inventor)'
                } else if (entry.association_type === 'applicant' || entry.association_type === 'holder') {
                  associationDisplay = 'Applicant / Holder (Faculty member is listed as an applicant/holder)'
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
                          {`${entry.type.toUpperCase()}: ${
                            entry.title || entry.description || `IPR ${index + 1}`
                          }`}
                        </strong>
                      </div>

                      <ProofLink url={entry.proof_file} />
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

        {!m?.journal_index?.title &&
          !m?.journal_index?.scopus_link &&
          !m?.conference_articles?.entries?.length &&
          !m?.book_chapters?.entries?.length &&
          !m?.books?.entries?.length &&
          !m?.ipr?.entries?.length &&
          !m?.funded_projects?.entries?.length &&
          !m?.fdp_attended?.entries?.length &&
          !m?.talks_delivered?.entries?.length &&
          !m?.departmental_activities?.entries?.length &&
          !m?.institutional_activities?.entries?.length &&
          !m?.fdp_organized?.entries?.length && (
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