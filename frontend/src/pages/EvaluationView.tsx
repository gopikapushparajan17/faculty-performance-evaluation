import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Evaluation } from '../types/evaluation'

const statusFlow = ['Draft', 'Pending', 'Approved', 'Rejected'] as const

export default function EvaluationView() {
  const { evaluationId } = useParams<{ evaluationId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [evalData, setEvalData] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!evaluationId) return
    api.get<Evaluation>(`/evaluations/${evaluationId}`).then(({ data }) => setEvalData(data)).catch(() => {}).finally(() => setLoading(false))
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
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : null

    alert(typeof detail === 'string' ? detail : 'Approval failed.')
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
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : null

    alert(typeof detail === 'string' ? detail : 'Rejection failed.')
  }
}

  if (loading || !evalData) return <div className="loading-text">Loading...</div>

  const m = evalData.modules
  const canEdit = user?.role === 'faculty' && evalData.status === 'draft'
  const canHodApprove = user?.role === 'hod' && evalData.status === 'pending'

  return (
    <div >
      <div className="eval-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Evaluation — {evalData.faculty?.employee_name ?? evalData.faculty_id}</h1>
        <div className="form-row" style={{ marginBottom: 0 }}>
          {canEdit && (
            <button type="button" onClick={() => navigate(`/evaluation/${evaluationId}/edit`)} className="btn btn-secondary">
              Edit
            </button>
          )}
          <button type="button" onClick={() => navigate('/dashboard')} className="btn btn-outline">Back</button>
        </div>
      </div>

      <div className="eval-status-list">
        {statusFlow.map((label) => (
          <span
            key={label}
            className={`eval-status-dot ${evalData.status === label.toLowerCase() ? 'active' : 'inactive'}`}
          >
            {label}
          </span>
        ))}
      </div>
      

      <div className="card card-body mb-6">

  <div className="score-summary">
    <div className="total-score-card">
      <h2>Total Score</h2>
      <h1>{evalData.total_points}</h1>
      <p>Points</p>
    </div>

    <div className={`status-card status-${evalData.status}`}>
      <h2>Status</h2>
      <h1>{evalData.status.toUpperCase()}</h1>
    </div>
  </div>

  <h2 className="section-title">Score Breakdown</h2>

<div className="card card-body" style={{ marginTop: '1rem' }}>
  <div className="scores-grid">

    <div><strong>Student Feedback</strong></div>
    <div>{m?.student_feedback?.points ?? 0}</div>

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

    <div><strong>FDP Attended</strong></div>
    <div>{m?.fdp_attended?.points ?? 0}</div>

    <div><strong>Talks Delivered</strong></div>
    <div>{m?.talks_delivered?.points ?? 0}</div>

    <div><strong>Department Activities</strong></div>
    <div>{m?.departmental_activities?.points ?? 0}</div>

    <div><strong>Institutional Activities</strong></div>
    <div>{m?.institutional_activities?.points ?? 0}</div>

    <div><strong>FDP Organized</strong></div>
    <div>{m?.fdp_organized?.points ?? 0}</div>

  </div>
</div>

</div>

            <div className="card card-body" style={{ backgroundColor: 'var(--surface)' }}>
        <h2 className="section-title">Approval</h2>

        <p className="form-label" style={{ marginTop: 0 }}>
          Status: <strong>{evalData.status}</strong>
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

          {user?.role === 'hod' && evalData.status === 'approved' && (
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
