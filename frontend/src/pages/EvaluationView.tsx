import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Evaluation } from '../types/evaluation'

const statusFlow = ['Draft', 'Submitted', 'Faculty Signed', 'HOD Signed', 'Approved'] as const

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

  const signAsFaculty = async () => {
    if (!evaluationId) return
    await api.post(`/evaluations/${evaluationId}/faculty-sign`)
    setEvalData((e) => (e ? { ...e, status: 'faculty_signed', faculty_signature: 'signed' } : null))
  }
  const signAsHOD = async () => {
    if (!evaluationId) return
    await api.post(`/evaluations/${evaluationId}/hod-sign`)
    setEvalData((e) => (e ? { ...e, status: 'hod_signed', hod_signature: 'signed' } : null))
  }
  const approveAsPrincipal = async () => {
    if (!evaluationId) return
    await api.post(`/evaluations/${evaluationId}/approve`)
    setEvalData((e) => (e ? { ...e, status: 'approved', principal_signature: 'signed' } : null))
  }

  if (loading || !evalData) return <div className="loading-text">Loading...</div>

  const m = evalData.modules
  const canEdit = user?.role === 'hod' && evalData.status === 'draft'
  const canFacultySign = user?.role === 'faculty' && evalData.status === 'submitted'
  const canHODSign = user?.role === 'hod' && evalData.status === 'faculty_signed'
  const canPrincipalApprove = user?.role === 'principal' && evalData.status === 'hod_signed'

  return (
    <div className="max-w-4xl">
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
            className={`eval-status-dot ${evalData.status === label.toLowerCase().replace(' ', '_') ? 'active' : 'inactive'}`}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="card card-body mb-6">
        <h2 className="section-title">Scores</h2>
        <ul className="scores-grid">
          <li>Student Feedback: {m?.student_feedback?.points ?? 0}</li>
          <li>Conference Articles: {m?.conference_articles?.points ?? 0}</li>
          <li>Book Chapters: {m?.book_chapters?.points ?? 0}</li>
          <li>Books: {m?.books?.points ?? 0}</li>
          <li>IPR: {m?.ipr?.points ?? 0}</li>
          <li>Funded Projects: {m?.funded_projects?.points ?? 0}</li>
          <li>FDP Attended: {m?.fdp_attended?.points ?? 0}</li>
          <li>Talks: {m?.talks_delivered?.points ?? 0}</li>
          <li>Dept Activities: {m?.departmental_activities?.points ?? 0}</li>
          <li>Inst Activities: {m?.institutional_activities?.points ?? 0}</li>
          <li>FDP Organized: {m?.fdp_organized?.points ?? 0}</li>
        </ul>
        <p className="scores-total">Total: {evalData.total_points} points</p>
      </div>

      <div className="card card-body" style={{ backgroundColor: 'var(--surface)' }}>
        <h2 className="section-title">Signatures & Approval</h2>
        <p className="form-label" style={{ marginTop: 0 }}>
          {evalData.faculty_signature && 'Faculty signed ✓ '}
          {evalData.hod_signature && 'HOD signed ✓ '}
          {evalData.principal_signature && 'Principal approved ✓'}
        </p>
        <div className="form-actions">
          {canFacultySign && <button type="button" onClick={signAsFaculty} className="btn btn-primary">Faculty Sign</button>}
          {canHODSign && <button type="button" onClick={signAsHOD} className="btn btn-secondary">HOD Sign</button>}
          {canPrincipalApprove && <button type="button" onClick={approveAsPrincipal} className="btn btn-success">Approve</button>}
        </div>
      </div>
    </div>
  )
}
