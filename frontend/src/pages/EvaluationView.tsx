import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Evaluation } from '../types/evaluation'

const statusFlow = ['Draft', 'Pending', 'Approved', 'Rejected'] as const

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
  const { user } = useAuth()

  const [evalData, setEvalData] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!evaluationId) return

    api
      .get<Evaluation>(`/evaluations/${evaluationId}`)
      .then(({ data }) => setEvalData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [evaluationId])

  const approveAsHod = async () => {
    if (!evaluationId) return

    try {
      await api.post(`/evaluations/${evaluationId}/approve`)

      setEvalData((e) =>
        e
          ? {
              ...e,
              status: 'approved',
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
            onClick={() => navigate('/dashboard')}
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
              evalData.status === label.toLowerCase()
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
            className={`status-card status-${evalData.status}`}
          >
            <h2>Status</h2>
            <h1>
              {evalData.status.toUpperCase()}
            </h1>
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
            <div>
              <strong>Student Feedback</strong>
            </div>
            <div>
              {m?.student_feedback?.points ?? 0}
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
              (entry, index) => (
                <EvidenceRow
                  key={index}
                  title={
                    `${entry.type}: ${
                      entry.description ||
                      `IPR ${index + 1}`
                    }`
                  }
                  proof={entry.proof_file}
                />
              )
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
          <strong>{evalData.status}</strong>
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

{(user?.role === 'faculty' || user?.role === 'hod') && (
  <button
    type="button"
    className="btn btn-primary"
    onClick={() =>
      window.open(
        `http://localhost:8000/api/evaluations/${evaluationId}/pdf`,
        '_blank'
      )
    }
  >
    Generate PDF
  </button>
)}
</div>
      </div>
    </div>
  )
}