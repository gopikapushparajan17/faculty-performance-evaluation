import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Evaluation, FacultyProfile } from '../types/evaluation'

export default function Dashboard() {
  const { user } = useAuth()
  const [pending, setPending] = useState<Evaluation[]>([])
  const [approved, setApproved] = useState<Evaluation[]>([])
  const [mine, setMine] = useState<Evaluation[]>([])
  const [profile, setProfile] = useState<FacultyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPendingId, setSelectedPendingId] = useState<string>('')
  const [selectedPending, setSelectedPending] = useState<Evaluation | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const location = useLocation()
  const stateMessage = location.state?.message

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
          const [mineRes, profileRes] = await Promise.all([
            api.get<Evaluation[]>('/evaluations/mine'),
            api.get<FacultyProfile>('/faculty/me'),
          ])
          setMine(mineRes.data)
          setProfile(profileRes.data)
        }
      } catch {
        setMessage({ type: 'error', text: 'Failed to load dashboard data.' })
        setPending([])
        setApproved([])
        setMine([])
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.role])

  useEffect(() => {
    if (stateMessage) {
      setMessage({ type: 'success', text: stateMessage })
      window.history.replaceState({}, document.title)
    }
  }, [stateMessage])
  
  const selected = useMemo(() => pending.find((e) => e.id === selectedPendingId) ?? null, [pending, selectedPendingId])

  useEffect(() => {
  setSelectedPending(selected)
}, [selected])

if (loading) return <div className="loading-text">Loading...</div>

const pendingCount = pending.length
const approvedCount = approved.length

const approvedMine = mine.filter(
  (e) => e.status === 'approved'
).length

const pendingMine = mine.filter(
  (e) => e.status === 'pending'
).length

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
  const deleteEvaluation = async (id: string) => {
  const confirmed = window.confirm(
    'Are you sure you want to delete this evaluation?'
  )

  if (!confirmed) return

  try {
    await api.delete(`/evaluations/${id}`)

    const [pRes, aRes] = await Promise.all([
      api.get<Evaluation[]>('/evaluations/pending'),
      api.get<Evaluation[]>('/evaluations/approved'),
    ])

    setPending(pRes.data)
    setApproved(aRes.data)

    setMessage({
      type: 'success',
      text: 'Evaluation deleted successfully.',
    })
  } catch {
    setMessage({
      type: 'error',
      text: 'Failed to delete evaluation.',
    })
  }
}

  return (
    <div>
      <h1 className="page-title">{user?.role === 'hod' ? 'HOD Approval Dashboard' : 'Evaluating Faculty Dashboard'}</h1>
      {user?.role === 'hod' ? (
  <div className="stats-grid">
    <div className="stat-card">
      <h3>{pendingCount}</h3>
      <p>Pending Evaluations</p>
    </div>

    <div className="stat-card">
      <h3>{approvedCount}</h3>
      <p>Approved Evaluations</p>
    </div>

    <div className="stat-card">
      <h3>{pendingCount + approvedCount}</h3>
      <p>Total Evaluations</p>
    </div>
  </div>
) : (
  <div className="stats-grid">
    <div className="stat-card">
      <h3>{mine.length}</h3>
      <p>Total Evaluations</p>
    </div>

    <div className="stat-card">
      <h3>{pendingMine}</h3>
      <p>Pending</p>
    </div>

    <div className="stat-card">
      <h3>{approvedMine}</h3>
      <p>Approved</p>
    </div>
  </div>
)}

      {message && (
        <div className={`card card-body mb-6 ${message.type === 'error' ? 'error-card' : ''}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      {user?.role === 'hod' ? (
        <>
          <div className="mb-6">
            <Link to="/faculty/new" className="btn btn-secondary">Add Faculty</Link>
          </div>
          <section className="section">
  <h2 className="section-title">Pending Evaluations</h2>

  {pending.length === 0 ? (
    <div className="card card-body">
      No pending evaluations.
    </div>
  ) : (
    <div className="evaluation-grid">
      {pending.map((ev) => (
        <div className="evaluation-card" key={ev.id}>
          <h3>
            {ev.faculty?.employee_name ?? ev.faculty_id}
          </h3>

          <p>
            <strong>ID:</strong>{" "}
            {ev.faculty?.employee_id ?? "—"}
          </p>

          <p>
            <strong>Academic Year:</strong>{" "}
            {ev.academic_year}
          </p>

          <p>
            <strong>Total Points:</strong>{" "}
            {ev.total_points ?? 0}
          </p>

          <div className="card-actions">
                <Link
                  to={`/evaluation/${ev.id}/view`}
                  className="btn btn-outline"
                >
                  View
                </Link>

                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    try {
                      await api.post(`/evaluations/${ev.id}/approve`)

                      const [pRes, aRes] = await Promise.all([
                        api.get<Evaluation[]>('/evaluations/pending'),
                        api.get<Evaluation[]>('/evaluations/approved'),
                      ])

                      setPending(pRes.data)
                      setApproved(aRes.data)

                      setMessage({
                        type: 'success',
                        text: 'Evaluation approved successfully.',
                      })
                    } catch {
                      setMessage({
                        type: 'error',
                        text: 'Approval failed.',
                      })
                    }
                  }}
                >
                  Approve
                </button>
                <button
                  className="btn btn-warning"
                  onClick={async () => {
                    const reason = prompt("Enter rejection reason:")
                    if (!reason) return

                    try {
                      await api.post(`/evaluations/${ev.id}/reject`, {
                        reason,
                      })

                      const [pRes, aRes] = await Promise.all([
                        api.get<Evaluation[]>('/evaluations/pending'),
                        api.get<Evaluation[]>('/evaluations/approved'),
                      ])

                      setPending(pRes.data)
                      setApproved(aRes.data)

                      setMessage({
                        type: 'success',
                        text: 'Evaluation rejected successfully.',
                      })
                    } catch {
                      setMessage({
                        type: 'error',
                        text: 'Rejection failed.',
                      })
                    }
                  }}
                >
                  Reject
                </button>

                <button
                  className="btn btn-danger"
                  onClick={() => deleteEvaluation(ev.id)}
                >
                  Delete
                </button>
              </div>
        </div>
      ))}
    </div>
  )}
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
                          <Link
                            to={`/evaluation/${ev.id}/view`}
                            className="link"
                          >
                            View
                          </Link>

                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => deleteEvaluation(ev.id)}
                            style={{ marginLeft: '10px' }}
                          >
                            Delete
                          </button>
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
          {profile && (
            <div className="mb-6">
              <Link to={`/evaluation/new/${profile.id}`} className="btn btn-primary">
                Start New Evaluation
              </Link>
            </div>
          )}
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
                      <td><span className={`badge ${ev.status}`}>
                        {ev.status}
                        </span>
                      </td>
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
