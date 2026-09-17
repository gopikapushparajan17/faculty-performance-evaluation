import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Evaluation, FacultyProfile } from '../types/evaluation'

export default function Dashboard() {
  const { user } = useAuth()
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([])
  const [hodPage, setHodPage] = useState(1)
  const [hodPages, setHodPages] = useState(1)
  const [hodSearch, setHodSearch] = useState('')
  const [pending, setPending] = useState<Evaluation[]>([])
  const [approved, setApproved] = useState<Evaluation[]>([])
  const [rejected, setRejected] = useState<Evaluation[]>([])
  const [hodCounts, setHodCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  })
  const [hodView, setHodView] = useState<
    'dashboard' | 'pending' | 'approved' | 'rejected' | 'all'
  >('dashboard')
  const [mine, setMine] = useState<Evaluation[]>([])
  const [profile, setProfile] = useState<FacultyProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const location = useLocation()
  const stateMessage = location.state?.message

  useEffect(() => {
    const load = async () => {
      try {
        if (!stateMessage) {
          setMessage(null)
        }

        if (user?.role === 'hod') {
          const [pRes, aRes, rRes, countRes] = await Promise.all([
            api.get('/evaluations/paginated?page=1&page_size=25&status=pending'),
            api.get('/evaluations/paginated?page=1&page_size=5&status=hod_approved'),
            api.get('/evaluations/paginated?page=1&page_size=5&status=rejected'),
            api.get('/evaluations/counts'),
          ])
          
          setPending(pRes.data.items)
          setApproved(aRes.data.items)
          setRejected(rRes.data.items)
          setHodCounts(countRes.data)
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
        setRejected([])
        setMine([])
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user?.role, location.key])

  useEffect(() => {
    if (stateMessage) {
      setMessage({ type: 'success', text: stateMessage })
      window.history.replaceState({}, document.title)
    }
  }, [stateMessage])
  useEffect(() => {
    if (user?.role !== 'hod' || hodView === 'dashboard') return
  
    loadHodPage(hodView, hodPage).catch(() => {
      setMessage({
        type: 'error',
        text: 'Failed to load evaluations.',
      })
    })
  }, [hodView, hodPage, hodSearch, user?.role])

if (loading) return <div className="loading-text">Loading...</div>
const allHodEvaluations = allEvaluations

  const sortRecent = (evaluations: Evaluation[]) =>
    evaluations.slice().sort((a, b) => {
      const dateA = Date.parse(a.created_at ?? '')
      const dateB = Date.parse(b.created_at ?? '')
      const hasDateA = !Number.isNaN(dateA)
      const hasDateB = !Number.isNaN(dateB)

      if (hasDateA && hasDateB && dateB !== dateA) {
        return dateB - dateA
      }

      return Number(b.id) - Number(a.id)
    })

  const recentApproved = sortRecent(approved).slice(0, 5)
  const recentRejected = sortRecent(rejected).slice(0, 5)

  const approvedMine = mine.filter(
    (e) => e.status === 'approved'
  ).length

  const pendingMine = mine.filter(
    (e) => e.status === 'pending'
  ).length

  const deleteEvaluation = async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this evaluation?'
    )

    if (!confirmed) return

    try {
      await api.delete(`/evaluations/${id}`)

      await refreshHodLists()

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

  async function loadHodPage(
    view: 'pending' | 'approved' | 'rejected' | 'all',
    page: number
  ) {
  const status = view === 'all' ? '' : `&status=${view}`
  const search = hodSearch.trim()
    ? `&search=${encodeURIComponent(hodSearch.trim())}`
    : ''
  
  const res = await api.get(
    `/evaluations/paginated?page=${page}&page_size=25${status}${search}`
  )

  if (view === 'pending') {
    setPending(res.data.items)
  } else if (view === 'approved') {
    setApproved(res.data.items)
  } else if (view === 'rejected') {
    setRejected(res.data.items)
  } else {
    setAllEvaluations(res.data.items)
  }

  setHodPage(res.data.page)
  setHodPages(res.data.pages || 1)
}

const refreshHodLists = async () => {
  const [pRes, aRes, rRes, countRes] = await Promise.all([
    api.get('/evaluations/paginated?page=1&page_size=25&status=pending'),
    api.get('/evaluations/paginated?page=1&page_size=5&status=hod_approved'),
    api.get('/evaluations/paginated?page=1&page_size=5&status=rejected'),
    api.get('/evaluations/counts'),
  ])

  setPending(pRes.data.items)
  setApproved(aRes.data.items)
  setRejected(rRes.data.items)
  setHodCounts(countRes.data)

  if (hodView !== 'dashboard') {
    await loadHodPage(hodView, hodPage)
  }
}
  const hodViewTitle = {
    dashboard: 'HOD Approval Dashboard',
    pending: 'Pending Evaluations',
    approved: 'Approved Evaluations',
    rejected: 'Rejected Evaluations',
    all: 'All Evaluations',
  }[hodView]

  return (
    <div>
      <h1 className="page-title">
        {user?.role === 'hod' ? hodViewTitle : 'Evaluating Faculty Dashboard'}
      </h1>

      {user?.role === 'hod' && hodView === 'dashboard' ? (
        <div className="stats-grid">
          <button
            className="stat-card"
            onClick={() => {
              setHodPage(1)
              setHodView('pending')
            }}
            type="button"
          >
            <h3>{hodCounts.pending}</h3>
            <p>Pending Evaluations</p>
            <span>View →</span>
          </button>

          <button
            className="stat-card"
            onClick={() => {
              setHodPage(1)
              setHodView('approved')
            }}
            type="button"
          >
            <h3>{hodCounts.approved}</h3>
            <p>Approved Evaluations</p>
            <span>View →</span>
          </button>

          <button
            className="stat-card"
            onClick={() => {
              setHodPage(1)
              setHodView('rejected')
            }}
            type="button"
          >
            <h3>{hodCounts.rejected}</h3>
            <p>Rejected Evaluations</p>
            <span>View →</span>
          </button>

          <button
            className="stat-card"
            onClick={() => {
              setHodPage(1)
              setHodView('all')
            }}
            type="button"
          >
            <h3>{hodCounts.total}</h3>
            <p>Total Evaluations</p>
            <span>View →</span>
          </button>
        </div>
      ) : user?.role === 'faculty' ? (
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
      ) : null}

      {message && (
        <div className={`card card-body mb-6 ${message.type === 'error' ? 'error-card' : ''}`}>
          <p style={{ margin: 0 }}>{message.text}</p>
        </div>
      )}

      {user?.role === 'hod' ? (
        <>
          {hodView === 'dashboard' && (
            <>
              <div className="mb-6">
                <Link to="/faculty/new" className="btn btn-secondary">
                  Add Faculty
                </Link>
              </div>

              <section className="section">
                <h2 className="section-title">Pending Evaluations</h2>

                {pending.length === 0 ? (
                  <div className="card card-body">
                    No pending evaluations.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '16px',
                    }}
                  >
                    {sortRecent(pending).map((ev) => (
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
                                await refreshHodLists()

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
                                await refreshHodLists()

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
                        <th>Academic Year</th>
                        <th>Total Points</th>
                        <th>Approved At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {approved.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="td-muted">
                            No approved evaluations yet.
                          </td>
                        </tr>
                      ) : (
                        recentApproved.map((ev) => (
                          <tr key={ev.id}>
                            <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                            <td>{ev.faculty?.employee_id ?? '—'}</td>
                            <td>{ev.academic_year}</td>
                            <td style={{ fontWeight: 500 }}>
                              {ev.total_points ?? 0}
                            </td>
                            <td>
                              {(ev as unknown as { approved_at?: string }).approved_at ?? '—'}
                            </td>
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

                {hodCounts.approved > 5 && (
                  <div style={{ textAlign: 'right', marginTop: '12px' }}>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setHodPage(1)
                        setHodView('approved')
                      }}
                    >
                      View all →
                    </button>
                  </div>
                )}
              </section>

              <section className="section">
                <h2 className="section-title">Rejected Evaluations</h2>

                <div className="card table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Faculty</th>
                        <th>Employee ID</th>
                        <th>Academic Year</th>
                        <th>Total Points</th>
                        <th>Rejected Reason</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rejected.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="td-muted">
                            No rejected evaluations yet.
                          </td>
                        </tr>
                      ) : (
                        recentRejected.map((ev) => (
                          <tr key={ev.id}>
                            <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                            <td>{ev.faculty?.employee_id ?? "—"}</td>
                            <td>{ev.academic_year}</td>
                            <td style={{ fontWeight: 500 }}>
                              {ev.total_points ?? 0}
                            </td>
                            <td>{ev.reject_reason ?? "—"}</td>
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
                                style={{ marginLeft: "10px" }}
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

                {hodCounts.rejected > 5 && (
                  <div style={{ textAlign: 'right', marginTop: '12px' }}>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setHodPage(1)
                        setHodView('rejected')
                      }}
                    >
                      View all →
                    </button>
                  </div>
                )}
              </section>
            </>
          )}

          {hodView !== 'dashboard' && (
            <>
              <div className="mb-6">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
  setHodSearch('')
  setHodPage(1)
  setHodView('dashboard')
}}
                >
                  ← Back to Dashboard
                </button>
              </div>
              <div className="mb-6">
  <input
    type="text"
    placeholder="Search faculty name or employee ID"
    value={hodSearch}
    onChange={(e) => {
      setHodSearch(e.target.value)
      setHodPage(1)
    }}
    style={{
      width: '100%',
      maxWidth: '400px',
      padding: '10px',
    }}
  />
</div>
              {hodView === 'pending' && (
                <section className="section">
                  <div className="card table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Employee ID</th>
                          <th>Academic Year</th>
                          <th>Total Points</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {pending.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="td-muted">
                              No pending evaluations.
                            </td>
                          </tr>
                        ) : (
                          sortRecent(pending).map((ev) => (
                            <tr key={ev.id}>
                              <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                              <td>{ev.faculty?.employee_id ?? '—'}</td>
                              <td>{ev.academic_year}</td>
                              <td style={{ fontWeight: 500 }}>
                                {ev.total_points ?? 0}
                              </td>
                              <td>
                                <Link
                                  to={`/evaluation/${ev.id}/view`}
                                  className="link"
                                >
                                  View
                                </Link>

                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={async () => {
                                    try {
                                      await api.post(`/evaluations/${ev.id}/approve`)
                                      await refreshHodLists()

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
                                  style={{ marginLeft: '10px' }}
                                >
                                  Approve
                                </button>

                                <button
                                  type="button"
                                  className="btn btn-warning"
                                  onClick={async () => {
                                    const reason = prompt("Enter rejection reason:")
                                    if (!reason) return

                                    try {
                                      await api.post(`/evaluations/${ev.id}/reject`, {
                                        reason,
                                      })
                                      await refreshHodLists()

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
                                  style={{ marginLeft: '10px' }}
                                >
                                  Reject
                                </button>

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
                    {hodPages > 1 && (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === 1}
      onClick={() => setHodPage((page) => page - 1)}
    >
      ← Previous
    </button>

    <span>
      Page {hodPage} of {hodPages}
    </span>

    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === hodPages}
      onClick={() => setHodPage((page) => page + 1)}
    >
      Next →
    </button>
  </div>
)}
                  </div>
                </section>
              )}

              {hodView === 'approved' && (
                <section className="section">
                  <div className="card table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Employee ID</th>
                          <th>Academic Year</th>
                          <th>Total Points</th>
                          <th>Approved At</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {approved.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="td-muted">
                              No approved evaluations yet.
                            </td>
                          </tr>
                        ) : (
                          sortRecent(approved).map((ev) => (
                            <tr key={ev.id}>
                              <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                              <td>{ev.faculty?.employee_id ?? '—'}</td>
                              <td>{ev.academic_year}</td>
                              <td style={{ fontWeight: 500 }}>
                                {ev.total_points ?? 0}
                              </td>
                              <td>
                                {(ev as unknown as { approved_at?: string }).approved_at ?? '—'}
                              </td>
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
                    {hodPages > 1 && (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === 1}
      onClick={() => setHodPage((page) => page - 1)}
    >
      ← Previous
    </button>

    <span>
      Page {hodPage} of {hodPages}
    </span>

    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === hodPages}
      onClick={() => setHodPage((page) => page + 1)}
    >
      Next →
    </button>
  </div>
)}
                  </div>
                </section>
              )}

              {hodView === 'rejected' && (
                <section className="section">
                  <div className="card table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Employee ID</th>
                          <th>Academic Year</th>
                          <th>Total Points</th>
                          <th>Rejected Reason</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {rejected.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="td-muted">
                              No rejected evaluations yet.
                            </td>
                          </tr>
                        ) : (
                          sortRecent(rejected).map((ev) => (
                            <tr key={ev.id}>
                              <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                              <td>{ev.faculty?.employee_id ?? '—'}</td>
                              <td>{ev.academic_year}</td>
                              <td style={{ fontWeight: 500 }}>
                                {ev.total_points ?? 0}
                              </td>
                              <td>{ev.reject_reason ?? '—'}</td>
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
                    {hodPages > 1 && (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === 1}
      onClick={() => setHodPage((page) => page - 1)}
    >
      ← Previous
    </button>

    <span>
      Page {hodPage} of {hodPages}
    </span>

    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === hodPages}
      onClick={() => setHodPage((page) => page + 1)}
    >
      Next →
    </button>
  </div>
)}
                  </div>
                </section>
              )}

              {hodView === 'all' && (
                <section className="section">
                  <div className="card table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Faculty</th>
                          <th>Employee ID</th>
                          <th>Academic Year</th>
                          <th>Status</th>
                          <th>Total Points</th>
                          <th>Actions</th>
                        </tr>
                      </thead>

                      <tbody>
                        {allHodEvaluations.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="td-muted">
                              No evaluations yet.
                            </td>
                          </tr>
                        ) : (
                          sortRecent(allHodEvaluations).map((ev) => (
                            <tr key={ev.id}>
                              <td>{ev.faculty?.employee_name ?? ev.faculty_id}</td>
                              <td>{ev.faculty?.employee_id ?? '—'}</td>
                              <td>{ev.academic_year}</td>
                              <td>
                                <span className={`badge ${ev.status}`}>
                                  {ev.status}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500 }}>
                                {ev.total_points ?? 0}
                              </td>
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
                    {hodPages > 1 && (
  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === 1}
      onClick={() => setHodPage((page) => page - 1)}
    >
      ← Previous
    </button>

    <span>
      Page {hodPage} of {hodPages}
    </span>

    <button
      type="button"
      className="btn btn-secondary"
      disabled={hodPage === hodPages}
      onClick={() => setHodPage((page) => page + 1)}
    >
      Next →
    </button>
  </div>
)}
                  </div>
                </section>
              )}
            </>
          )}
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
                  <th>Rejection Reason</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {mine.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="td-muted">
                      No evaluations yet.
                    </td>
                  </tr>
                ) : (
                  mine
                    .slice()
                    .sort((a, b) => {
                      const dateA = Date.parse(a.created_at ?? '')
                      const dateB = Date.parse(b.created_at ?? '')
                      const hasDateA = !Number.isNaN(dateA)
                      const hasDateB = !Number.isNaN(dateB)

                      if (hasDateA && hasDateB && dateB !== dateA) {
                        return dateB - dateA
                      }

                      return Number(b.id) - Number(a.id)
                    })
                    .map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          {ev.faculty?.employee_name ?? ev.faculty_id} — {ev.academic_year}
                        </td>

                        <td>
                          <span className={`badge ${ev.status}`}>
                            {ev.status}
                          </span>
                        </td>

                        <td style={{ fontWeight: 500 }}>
                          {ev.total_points ?? 0}
                        </td>

                        <td>{ev.reject_reason ?? '—'}</td>

                        <td>
                          <Link
                            to={`/evaluation/${ev.id}/view`}
                            className="link"
                          >
                            View
                          </Link>

                          {ev.status === 'draft' && (
                            <Link
                              to={`/evaluation/${ev.id}/edit`}
                              className="link"
                            >
                              Edit
                            </Link>
                          )}
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
