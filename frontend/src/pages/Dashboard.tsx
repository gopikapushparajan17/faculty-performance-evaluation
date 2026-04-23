import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api, downloadPdf, hasPdfBeenViewed } from '../lib/api'
import { SignatureCanvas } from '../components/SignatureCanvas'
import type { Evaluation } from '../types/evaluation'

// ── shared helpers ──────────────────────────────────────────────────────────

function statusLabel(s: string) {
  const map: Record<string, string> = {
    draft: 'Draft',
    faculty_approved: 'Awaiting HOD',
    hod_approved: 'Awaiting Principal',
    principal_approved: 'Fully Approved',
    rejected: 'Rejected',
  }
  return map[s] ?? s
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>{statusLabel(status)}</span>
  )
}

function GeneratePDFButton({ evalId, userId, small }: { evalId: string; userId?: string; small?: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setLoading(true)
    setError('')
    try {
      await downloadPdf(evalId, userId)
    } catch {
      setError('PDF generation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span>
      <button
        type="button"
        className={`btn btn-secondary${small ? '' : ''}`}
        style={small ? { fontSize: '0.8rem', padding: '0.3rem 0.65rem' } : undefined}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? 'Generating…' : 'Generate PDF'}
      </button>
      {error && <span className="proof-error" style={{ marginLeft: 6 }}>{error}</span>}
    </span>
  )
}

// ── Approve modal ───────────────────────────────────────────────────────────

interface ApproveModalProps {
  evalId: string
  onDone: () => void
  onCancel: () => void
}

function ApproveModal({ evalId, onDone, onCancel }: ApproveModalProps) {
  const { user } = useAuth()
  const requireDrawn = user?.role === 'hod' || user?.role === 'principal'
  const [sig, setSig] = useState('')
  const [sigImage, setSigImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!sig.trim()) { setErr('Please enter your full name as signature.'); return }
    if (requireDrawn && !sigImage) { setErr('A drawn signature is required for this approval.'); return }
    setBusy(true)
    setErr('')
    try {
      await api.post(`/evaluations/${evalId}/approve`, {
        signature: sig.trim(),
        signature_image: sigImage || null,
      })
      onDone()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(typeof detail === 'string' ? detail : 'Approval failed.')
    } finally {
      setBusy(false)
    }
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
            {busy ? 'Approving…' : 'Confirm Approval'}
          </button>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Reject modal ────────────────────────────────────────────────────────────

interface RejectModalProps {
  evalId: string
  onDone: () => void
  onCancel: () => void
}

function RejectModal({ evalId, onDone, onCancel }: RejectModalProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!reason.trim()) { setErr('Please provide a rejection reason.'); return }
    setBusy(true)
    setErr('')
    try {
      await api.post(`/evaluations/${evalId}/reject`, { reason: reason.trim() })
      onDone()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setErr(typeof detail === 'string' ? detail : 'Rejection failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>Reject Evaluation</h3>
        <p>Provide a reason for rejection. The faculty will be notified.</p>
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Rejection reason…"
          style={{ resize: 'vertical' }}
        />
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

// ── Faculty Dashboard ───────────────────────────────────────────────────────

function FacultyDashboard() {
  const [mine, setMine] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    try {
      const res = await api.get<Evaluation[]>('/evaluations/mine')
      setMine(res.data)
    } catch {
      setMsg('Failed to load evaluations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="loading-text">Loading…</div>

  return (
    <div>
      {approveId && (
        <ApproveModal
          evalId={approveId}
          onDone={() => { setApproveId(null); load() }}
          onCancel={() => setApproveId(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>My Evaluations</h1>
        <Link to="/faculty/new" className="btn btn-secondary">+ Add Faculty</Link>
      </div>

      {msg && <p className="form-error">{msg}</p>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Faculty / Year</th>
              <th>Status</th>
              <th>Points</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mine.length === 0 ? (
              <tr><td colSpan={4} className="td-muted">No evaluations yet. Add a faculty profile to begin.</td></tr>
            ) : (
              mine.map(ev => {
                const pdfViewed = !!(ev.pdf_viewed_by?.faculty || localStorage.getItem(`pdf_viewed_${ev.id}`))
                const canApprove = ev.status === 'draft'
                const canEdit = ev.status === 'draft'
                return (
                  <tr key={ev.id}>
                    <td>{ev.faculty?.employee_name ?? ev.faculty_id} — {ev.academic_year}</td>
                    <td><StatusBadge status={ev.status} /></td>
                    <td style={{ fontWeight: 500 }}>{ev.total_points}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
                        {canEdit && <Link to={`/evaluation/${ev.id}/edit`} className="link">Edit</Link>}
                        <GeneratePDFButton evalId={ev.id} small />
                        {canApprove && (
                          <button
                            type="button"
                            className="btn btn-success"
                            style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
                            title={pdfViewed ? 'Approve & submit to HOD' : 'Generate PDF first to enable approval'}
                            onClick={() => setApproveId(ev.id)}
                            disabled={!pdfViewed}
                          >
                            Approve
                          </button>
                        )}
                        {ev.status === 'rejected' && (
                          <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>
                            Rejected: {ev.reject_reason ?? '—'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="form-label" style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Note: Generate the PDF and view it before the Approve button becomes active.
      </p>
    </div>
  )
}

// ── HOD Dashboard ───────────────────────────────────────────────────────────

function HODDashboard() {
  const { user } = useAuth()
  const [pending, setPending] = useState<Evaluation[]>([])
  const [approved, setApproved] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [empFilter, setEmpFilter] = useState('')
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      const [p, a] = await Promise.all([
        api.get<Evaluation[]>('/evaluations/pending'),
        api.get<Evaluation[]>('/evaluations/approved'),
      ])
      setPending(p.data)
      setApproved(a.data)
    } catch {
      setMsg({ type: 'error', text: 'Failed to load evaluations.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filter = (list: Evaluation[]) =>
    empFilter.trim()
      ? list.filter(e =>
          (e.faculty?.employee_id ?? '').toLowerCase().includes(empFilter.toLowerCase()) ||
          (e.faculty?.employee_name ?? '').toLowerCase().includes(empFilter.toLowerCase())
        )
      : list

  if (loading) return <div className="loading-text">Loading…</div>

  return (
    <div>
      {approveId && (
        <ApproveModal
          evalId={approveId}
          onDone={() => { setApproveId(null); load(); setMsg({ type: 'success', text: 'Evaluation approved and forwarded to Principal.' }) }}
          onCancel={() => setApproveId(null)}
        />
      )}
      {rejectId && (
        <RejectModal
          evalId={rejectId}
          onDone={() => { setRejectId(null); load(); setMsg({ type: 'success', text: 'Evaluation rejected.' }) }}
          onCancel={() => setRejectId(null)}
        />
      )}

      <h1 className="page-title">HOD Dashboard</h1>

      {msg && (
        <div className={`card card-body mb-6 ${msg.type === 'error' ? 'error-card' : ''}`} style={{ color: msg.type === 'error' ? '#dc2626' : '#16a34a' }}>
          {msg.text}
        </div>
      )}

      <div className="emp-search">
        <input
          className="input"
          placeholder="Search by Employee ID or Name…"
          value={empFilter}
          onChange={e => setEmpFilter(e.target.value)}
        />
        {empFilter && (
          <button type="button" className="btn btn-outline" onClick={() => setEmpFilter('')}>Clear</button>
        )}
      </div>

      <section className="section">
        <h2 className="section-title">Pending Approval ({filter(pending).length})</h2>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Emp ID</th>
                <th>Year</th>
                <th>Points</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filter(pending).length === 0 ? (
                <tr><td colSpan={5} className="td-muted">No evaluations pending HOD approval.</td></tr>
              ) : (
                filter(pending).map(ev => (
                  <tr key={ev.id}>
                    <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                    <td>{ev.faculty?.employee_id ?? '—'}</td>
                    <td>{ev.academic_year}</td>
                    <td style={{ fontWeight: 500 }}>{ev.total_points}</td>
                    <td>
                      <HODRowActions ev={ev} userId={user?.id}
                        onApprove={() => setApproveId(ev.id)}
                        onReject={() => setRejectId(ev.id)} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Approved ({filter(approved).length})</h2>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Emp ID</th>
                <th>Year</th>
                <th>Points</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filter(approved).length === 0 ? (
                <tr><td colSpan={6} className="td-muted">No approved evaluations yet.</td></tr>
              ) : (
                filter(approved).map(ev => (
                  <tr key={ev.id}>
                    <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                    <td>{ev.faculty?.employee_id ?? '—'}</td>
                    <td>{ev.academic_year}</td>
                    <td style={{ fontWeight: 500 }}>{ev.total_points}</td>
                    <td><StatusBadge status={ev.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
                        <GeneratePDFButton evalId={ev.id} small />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ── Principal Dashboard ─────────────────────────────────────────────────────

function PrincipalDashboard() {
  const { user } = useAuth()
  const [pending, setPending] = useState<Evaluation[]>([])
  const [approved, setApproved] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [empFilter, setEmpFilter] = useState('')
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = async () => {
    try {
      const [p, a] = await Promise.all([
        api.get<Evaluation[]>('/evaluations/hod-pending'),
        api.get<Evaluation[]>('/evaluations/fully-approved'),
      ])
      setPending(p.data)
      setApproved(a.data)
    } catch {
      setMsg({ type: 'error', text: 'Failed to load evaluations.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filter = (list: Evaluation[]) =>
    empFilter.trim()
      ? list.filter(e =>
          (e.faculty?.employee_id ?? '').toLowerCase().includes(empFilter.toLowerCase()) ||
          (e.faculty?.employee_name ?? '').toLowerCase().includes(empFilter.toLowerCase())
        )
      : list

  if (loading) return <div className="loading-text">Loading…</div>

  return (
    <div>
      {approveId && (
        <ApproveModal
          evalId={approveId}
          onDone={() => { setApproveId(null); load(); setMsg({ type: 'success', text: 'Evaluation fully approved.' }) }}
          onCancel={() => setApproveId(null)}
        />
      )}
      {rejectId && (
        <RejectModal
          evalId={rejectId}
          onDone={() => { setRejectId(null); load(); setMsg({ type: 'success', text: 'Evaluation rejected.' }) }}
          onCancel={() => setRejectId(null)}
        />
      )}

      <h1 className="page-title">Principal Dashboard</h1>

      {msg && (
        <div className={`card card-body mb-6`} style={{ color: msg.type === 'error' ? '#dc2626' : '#16a34a' }}>
          {msg.text}
        </div>
      )}

      <div className="emp-search">
        <input
          className="input"
          placeholder="Search by Employee ID or Name…"
          value={empFilter}
          onChange={e => setEmpFilter(e.target.value)}
        />
        {empFilter && (
          <button type="button" className="btn btn-outline" onClick={() => setEmpFilter('')}>Clear</button>
        )}
      </div>

      <section className="section">
        <h2 className="section-title">Pending Approval ({filter(pending).length})</h2>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Emp ID</th>
                <th>Year</th>
                <th>Points</th>
                <th>HOD Approved</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filter(pending).length === 0 ? (
                <tr><td colSpan={6} className="td-muted">No evaluations pending principal approval.</td></tr>
              ) : (
                filter(pending).map(ev => {
                  const hodApproval = ev.approvals?.hod
                  return (
                    <tr key={ev.id}>
                      <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                      <td>{ev.faculty?.employee_id ?? '—'}</td>
                      <td>{ev.academic_year}</td>
                      <td style={{ fontWeight: 500 }}>{ev.total_points}</td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {hodApproval ? (
                          <span style={{ color: '#16a34a' }}>
                            ✓ {hodApproval.name}<br />
                            <span style={{ color: 'var(--text-muted)' }}>
                              {new Date(hodApproval.signed_at).toLocaleDateString()}
                            </span>
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <PrincipalRowActions ev={ev} userId={user?.id}
                          onApprove={() => setApproveId(ev.id)}
                          onReject={() => setRejectId(ev.id)} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Fully Approved ({filter(approved).length})</h2>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Emp ID</th>
                <th>Year</th>
                <th>Points</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filter(approved).length === 0 ? (
                <tr><td colSpan={5} className="td-muted">No fully approved evaluations yet.</td></tr>
              ) : (
                filter(approved).map(ev => (
                  <tr key={ev.id}>
                    <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                    <td>{ev.faculty?.employee_id ?? '—'}</td>
                    <td>{ev.academic_year}</td>
                    <td style={{ fontWeight: 500 }}>{ev.total_points}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
                        <GeneratePDFButton evalId={ev.id} small />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ── Root export ─────────────────────────────────────────────────────────────

// ── HOD row actions — enforce PDF viewed before approve ─────────────────────
function HODRowActions({ ev, userId, onApprove, onReject }: {
  ev: Evaluation; userId?: string; onApprove: () => void; onReject: () => void
}) {
  const viewed = !!(ev.pdf_viewed_by?.hod || hasPdfBeenViewed(ev.id, userId))
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
      <GeneratePDFButton evalId={ev.id} userId={userId} small />
      <button type="button" className="btn btn-success"
        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
        onClick={onApprove}
        disabled={!viewed}
        title={viewed ? 'Approve' : 'Generate & view PDF first to enable approval'}
      >
        Approve
      </button>
      <button type="button" className="btn btn-danger"
        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
        onClick={onReject}
      >
        Reject
      </button>
    </div>
  )
}

function PrincipalRowActions({ ev, userId, onApprove, onReject }: {
  ev: Evaluation; userId?: string; onApprove: () => void; onReject: () => void
}) {
  const viewed = !!(ev.pdf_viewed_by?.principal || hasPdfBeenViewed(ev.id, userId))
  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
      <GeneratePDFButton evalId={ev.id} userId={userId} small />
      <button type="button" className="btn btn-success"
        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
        onClick={onApprove}
        disabled={!viewed}
        title={viewed ? 'Approve' : 'Generate & view PDF first'}
      >
        Approve
      </button>
      <button type="button" className="btn btn-danger"
        style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}
        onClick={onReject}
      >
        Reject
      </button>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  if (!user) { navigate('/login'); return null }
  if (user.role === 'faculty')    return <FacultyDashboard />
  if (user.role === 'hod')        return <HODDashboard />
  if (user.role === 'principal')  return <PrincipalDashboard />
  return <div className="loading-text">Unknown role.</div>
}
