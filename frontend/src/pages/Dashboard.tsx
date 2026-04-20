import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Evaluation } from '../types/evaluation'

export default function Dashboard() {
  const { user } = useAuth()
  const [pending, setPending] = useState<Evaluation[]>([])
  const [approved, setApproved] = useState<Evaluation[]>([])
  const [mine, setMine] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPendingId, setSelectedPendingId] = useState<string>('')
  const [selectedPending, setSelectedPending] = useState<Evaluation | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setMessage(null)
        setSelectedPendingId('')
        setSelectedPending(null)

        if (user?.role === 'hod') {
          const [pRes, aRes] = await Promise.all([
            api.get<Evaluation[]>('/evaluations/pending'),
            api.get<Evaluation[]>('/evaluations/approved'),
          ])
          setPending(pRes.data)
          setApproved(aRes.data)
          if (pRes.data.length > 0) {
            setMessage({ type: 'success', text: `Pending evaluations: ${pRes.data.length}` })
          }
        } else if (user?.role === 'faculty') {
          const res = await api.get<Evaluation[]>('/evaluations/mine')
          setMine(res.data)
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to load dashboard data.' })
        setPending([])
        setApproved([])
        setMine([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.role])
  
  const selected = useMemo(() => pending.find((e) => e.id === selectedPendingId) ?? null, [pending, selectedPendingId])

  useEffect(() => {
    setSelectedPending(selected)
  }, [selected])

  if (loading) return <div className="loading-text">Loading...</div>

  const approveSelected = async () => {
    if (!selectedPendingId) return
    setMessage(null)
    try {
      await api.post(`/evaluations/${selectedPendingId}/approve`)
      const [pRes, aRes] = await Promise.all([
        api.get<Evaluation[]>('/evaluations/pending'),
        api.get<Evaluation[]>('/evaluations/approved'),
      ])
      setPending(pRes.data)
      setApproved(aRes.data)
      setSelectedPendingId('')
      setSelectedPending(null)
      setMessage({ type: 'success', text: 'Evaluation approved successfully.' })
    } catch (err: unknown) {
      const detail = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : null
      setMessage({ type: 'error', text: typeof detail === 'string' ? detail : 'Approval failed due to an unexpected error.' })
    }
  }

  return (
    <div>
      <h1 className="page-title">{user?.role === 'hod' ? 'HOD Approval Dashboard' : 'Evaluating Faculty Dashboard'}</h1>

      {message && (
        <div className={`card card-body mb-6 ${message.type === 'error' ? 'error-card' : ''}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      {user?.role === 'hod' ? (
        <>
          <section className="section">
            <h2 className="section-title">Pending Evaluations</h2>
            <div className="card card-body">
              <div className="form-row">
                <select
                  className="input"
                  value={selectedPendingId}
                  onChange={(e) => setSelectedPendingId(e.target.value)}
                >
                  <option value="">Select pending evaluation</option>
                  {pending.map((e) => (
                    <option key={e.id} value={e.id}>
                      {(e.faculty?.employee_name ?? e.faculty_id)} — {e.faculty?.employee_id ?? ''} — {e.academic_year}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selectedPendingId}
                  onClick={approveSelected}
                >
                  Approve
                </button>
              </div>

              {selectedPending && (
                <div style={{ marginTop: '1rem' }}>
                  <p className="form-label" style={{ marginBottom: '0.5rem' }}>
                    Faculty: <strong>{selectedPending.faculty?.employee_name ?? selectedPending.faculty_id}</strong>
                    {' '}({selectedPending.faculty?.employee_id ?? '—'})
                  </p>
                  <p className="form-label" style={{ marginBottom: 0 }}>
                    Total Points: <strong>{selectedPending.total_points ?? 0}</strong>
                  </p>
                  <div style={{ marginTop: '0.75rem' }}>
                    <Link to={`/evaluation/${selectedPending.id}/view`} className="link">Open full read-only view</Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Approved Evaluations</h2>
            <div className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Faculty</th>
                    <th>Employee ID</th>
                    <th>Total Points</th>
                    <th>Approved At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="td-muted">No approved evaluations yet.</td>
                    </tr>
                  ) : (
                    approved.map((ev) => (
                      <tr key={ev.id}>
                        <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                        <td>{ev.faculty?.employee_id ?? '—'}</td>
                        <td style={{ fontWeight: 500 }}>{ev.total_points ?? 0}</td>
                        <td>{(ev as unknown as { approved_at?: string }).approved_at ?? '—'}</td>
                        <td>
                          <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="mb-6">
            <Link to="/faculty/new" className="btn btn-secondary">Add Faculty</Link>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Faculty / Year</th>
                  <th>Status</th>
                  <th>Total Points</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mine.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="td-muted">No evaluations yet.</td>
                  </tr>
                ) : (
                  mine.map((ev) => (
                    <tr key={ev.id}>
                      <td>{ev.faculty?.employee_name ?? ev.faculty_id} — {ev.academic_year}</td>
                      <td><span className="badge">{ev.status}</span></td>
                      <td style={{ fontWeight: 500 }}>{ev.total_points ?? 0}</td>
                      <td>
                        <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
                        {ev.status === 'draft' && <Link to={`/evaluation/${ev.id}/edit`} className="link">Edit</Link>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
