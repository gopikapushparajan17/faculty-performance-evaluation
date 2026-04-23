import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { api, downloadPdf, hasPdfBeenViewed } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { SignatureCanvas } from '../components/SignatureCanvas'
import type { Evaluation } from '../types/evaluation'

const STATUS_STEPS = [
  { key: 'draft',               label: 'Draft' },
  { key: 'faculty_approved',    label: 'Faculty Approved' },
  { key: 'hod_approved',        label: 'HOD Approved' },
  { key: 'principal_approved',  label: 'Fully Approved' },
] as const

function ApproveModal({
  evalId, onDone, onCancel, requireDrawn,
}: { evalId: string; onDone: () => void; onCancel: () => void; requireDrawn?: boolean }) {
  const [sig, setSig] = useState('')
  const [sigImage, setSigImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!sig.trim()) { setErr('Enter your full name as signature.'); return }
    if (requireDrawn && !sigImage) { setErr('A drawn signature is required for this approval.'); return }
    setBusy(true)
    try {
      await api.post(`/evaluations/${evalId}/approve`, {
        signature: sig.trim(),
        signature_image: sigImage || null,
      })
      onDone()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(typeof d === 'string' ? d : 'Approval failed.')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" style={{ maxWidth: '28rem' }} onClick={e => e.stopPropagation()}>
        <h3>Sign &amp; Approve</h3>
        <div className="form-group" style={{ marginBottom: '0.75rem' }}>
          <label className="form-label">Full Name (printed)</label>
          <input className="input" value={sig} onChange={e => setSig(e.target.value)}
            placeholder="Your full name" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">
            Draw Signature{' '}
            {requireDrawn
              ? <span style={{ color: '#dc2626' }}>*</span>
              : <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>}
          </label>
          <SignatureCanvas onChange={setSigImage} />
        </div>
        {requireDrawn && !sigImage && (
          <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.25rem' }}>
            Draw your signature above before confirming.
          </p>
        )}
        {err && <p className="form-error" style={{ marginTop: '0.5rem' }}>{err}</p>}
        <div className="form-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-success" onClick={submit} disabled={busy}>
            {busy ? 'Approving…' : 'Confirm'}
          </button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({
  evalId, onDone, onCancel,
}: { evalId: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!reason.trim()) { setErr('Provide a rejection reason.'); return }
    setBusy(true)
    try {
      await api.post(`/evaluations/${evalId}/reject`, { reason: reason.trim() })
      onDone()
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(typeof d === 'string' ? d : 'Rejection failed.')
    } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Reject Evaluation</h3>
        <p>Provide a reason. The faculty will be notified.</p>
        <textarea className="input" rows={3} value={reason}
          onChange={e => setReason(e.target.value)} placeholder="Reason…"
          style={{ resize: 'vertical' }} />
        {err && <p className="form-error" style={{ marginTop: '0.5rem' }}>{err}</p>}
        <div className="form-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function EvaluationView() {
  const { evaluationId } = useParams<{ evaluationId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ev, setEv] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfErr, setPdfErr] = useState('')
  const [pdfViewed, setPdfViewed] = useState(false)
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!evaluationId) return
    api.get<Evaluation>(`/evaluations/${evaluationId}`)
      .then(({ data }) => {
        setEv(data)
        // Check backend-tracked viewing first, fall back to localStorage
        const role = user?.role ?? ''
        const backendViewed = !!(data.pdf_viewed_by?.[role])
        setPdfViewed(backendViewed || hasPdfBeenViewed(evaluationId, user?.id))
      })
      .catch(() => setMsg('Failed to load evaluation.'))
      .finally(() => setLoading(false))
  }, [evaluationId, user?.id, user?.role])

  const handlePdf = async () => {
    if (!evaluationId) return
    setPdfBusy(true)
    setPdfErr('')
    try {
      await downloadPdf(evaluationId, user?.id)
      setPdfViewed(true)
    } catch {
      setPdfErr('PDF generation failed. Try again.')
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) return <div className="loading-text">Loading…</div>
  if (!ev) return <div className="loading-text">{msg || 'Evaluation not found.'}</div>

  const m = ev.modules
  const approvals = ev.approvals ?? {}

  // Role-based action flags
  const canEdit        = user?.role === 'faculty' && ev.status === 'draft' && ev.status !== 'principal_approved'
  const canFacApprove  = user?.role === 'faculty' && ev.status === 'draft'
  const canHodApprove  = user?.role === 'hod'       && ev.status === 'faculty_approved'
  const canPrinApprove = user?.role === 'principal'  && ev.status === 'hod_approved'
  const canHodReject   = user?.role === 'hod'       && ev.status === 'faculty_approved'
  const canPrinReject  = user?.role === 'principal'  && ev.status === 'hod_approved'

  const currentStepIdx = STATUS_STEPS.findIndex(s => s.key === ev.status)

  return (
    <div className="max-w-4xl">
      {showApprove && evaluationId && (
        <ApproveModal
          evalId={evaluationId}
          requireDrawn={user?.role === 'hod' || user?.role === 'principal'}
          onDone={() => {
            setShowApprove(false)
            api.get<Evaluation>(`/evaluations/${evaluationId}`).then(({ data }) => setEv(data))
          }}
          onCancel={() => setShowApprove(false)}
        />
      )}
      {showReject && evaluationId && (
        <RejectModal
          evalId={evaluationId}
          onDone={() => {
            setShowReject(false)
            api.get<Evaluation>(`/evaluations/${evaluationId}`).then(({ data }) => setEv(data))
          }}
          onCancel={() => setShowReject(false)}
        />
      )}

      {/* Header */}
      <div className="eval-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          {ev.faculty?.employee_name ?? ev.faculty_id} — {ev.academic_year}
        </h1>
        <div className="form-row" style={{ marginBottom: 0 }}>
          {canEdit && (
            <button type="button" onClick={() => navigate(`/evaluation/${evaluationId}/edit`)} className="btn btn-secondary">
              Edit
            </button>
          )}
          <button type="button" onClick={() => navigate('/dashboard')} className="btn btn-outline">Back</button>
        </div>
      </div>

      {/* Status stepper */}
      <div className="eval-status-list" style={{ marginBottom: '1.5rem' }}>
        {ev.status === 'rejected' ? (
          <span className="eval-status-dot active" style={{ background: '#dc2626' }}>Rejected</span>
        ) : (
          STATUS_STEPS.map((s, i) => (
            <span
              key={s.key}
              className={`eval-status-dot ${i <= currentStepIdx ? 'active' : 'inactive'}`}
            >
              {s.label}
            </span>
          ))
        )}
      </div>

      {ev.status === 'rejected' && ev.reject_reason && (
        <div className="card card-body mb-6" style={{ borderLeft: '4px solid #dc2626', color: '#dc2626' }}>
          Rejected: {ev.reject_reason}
        </div>
      )}

      {/* Approvals timeline */}
      <div className="card card-body mb-6">
        <h2 className="section-title">Approval Status</h2>
        {[
          { key: 'faculty', label: 'Faculty', name: ev.faculty?.employee_name },
          { key: 'hod',     label: 'Head of Department' },
          { key: 'principal', label: 'Principal' },
        ].map(({ key, label, name }) => {
          const a = approvals[key as keyof typeof approvals]
          return (
            <div key={key} className="approval-row">
              <div className={`approval-check ${a ? 'done' : 'pending'}`}>
                {a ? '✓' : '–'}
              </div>
              <div style={{ flex: 1 }}>
                <strong>{label}</strong>
                {name && !a && <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>({name})</span>}
              </div>
              {a ? (
                <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                  <span style={{ color: '#16a34a', fontStyle: 'italic' }}>{a.name}</span><br />
                  <span style={{ color: 'var(--text-muted)' }}>
                    {new Date(a.signed_at).toLocaleString()}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pending</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Scores */}
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
        <p className="scores-total">Total: {ev.total_points} points</p>
      </div>

      {/* Actions */}
      <div className="card card-body" style={{ background: 'var(--surface)' }}>
        <h2 className="section-title">Actions</h2>

        <div className="form-actions">
          {/* PDF button — always visible */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handlePdf}
            disabled={pdfBusy}
          >
            {pdfBusy ? 'Generating PDF…' : 'Generate Report PDF'}
          </button>
          {pdfErr && <span className="proof-error">{pdfErr}</span>}

          {/* Faculty approve */}
          {canFacApprove && (
            <button
              type="button"
              className="btn btn-success"
              onClick={() => setShowApprove(true)}
              disabled={!pdfViewed}
              title={pdfViewed ? 'Approve & submit to HOD' : 'Generate & view PDF first'}
            >
              Approve &amp; Submit to HOD
            </button>
          )}

          {/* HOD approve / reject */}
          {canHodApprove && (
            <button type="button" className="btn btn-success" onClick={() => setShowApprove(true)}
              disabled={!pdfViewed} title={pdfViewed ? undefined : 'Generate & view PDF first'}>
              Approve &amp; Forward to Principal
            </button>
          )}
          {canHodReject && (
            <button type="button" className="btn btn-danger" onClick={() => setShowReject(true)}>
              Reject
            </button>
          )}

          {/* Principal approve / reject */}
          {canPrinApprove && (
            <button type="button" className="btn btn-success" onClick={() => setShowApprove(true)}
              disabled={!pdfViewed} title={pdfViewed ? undefined : 'Generate & view PDF first'}>
              Final Approval
            </button>
          )}
          {canPrinReject && (
            <button type="button" className="btn btn-danger" onClick={() => setShowReject(true)}>
              Reject
            </button>
          )}
        </div>

        {!pdfViewed && (canFacApprove || canHodApprove || canPrinApprove) && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Generate and view the PDF above to unlock the Approve button.
          </p>
        )}
      </div>
    </div>
  )
}
