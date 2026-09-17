
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Evaluation } from '../types/evaluation'

type PrincipalView =
  | 'awaiting_review'
  | 'final_approved'
  | 'rejected'
  | 'total'

export default function PrincipalDashboard() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  const [counts, setCounts] = useState({
    awaiting_review: 0,
    final_approved: 0,
    rejected: 0,
    total: 0,
  })

  const [activeView, setActiveView] =
    useState<PrincipalView>('awaiting_review')

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const getStatus = () => {
    switch (activeView) {
      case 'awaiting_review':
        return 'hod_approved'
      case 'final_approved':
        return 'approved'
      case 'rejected':
        return 'rejected'
      case 'total':
        return ''
    }
  }

  const getSectionTitle = () => {
    switch (activeView) {
      case 'awaiting_review':
        return 'Evaluations Awaiting Approval'
      case 'final_approved':
        return 'Final Approved Evaluations'
      case 'rejected':
        return 'Rejected Evaluations'
      case 'total':
        return 'All Evaluations'
    }
  }

  const getSectionDescription = () => {
    switch (activeView) {
      case 'awaiting_review':
        return 'HOD-approved evaluations waiting for final Principal review.'
      case 'final_approved':
        return 'Evaluations that have received final approval from the Principal.'
      case 'rejected':
        return 'Evaluations that have been rejected during the workflow.'
      case 'total':
        return 'All evaluations across the evaluation workflow.'
    }
  }

  useEffect(() => {
    const loadEvaluations = async () => {
      setLoading(true)
      setMessage(null)

      try {
        const status = getStatus()

        const statusQuery = status
          ? `&status=${status}`
          : ''

        const [evaluationsResponse, countsResponse] =
          await Promise.all([
            api.get(
              `/evaluations/paginated?page=${page}&page_size=25${statusQuery}&search=${encodeURIComponent(search)}`
            ),
            api.get('/evaluations/principal-counts'),
          ])

        setEvaluations(evaluationsResponse.data.items)
        setPages(evaluationsResponse.data.pages)
        setCounts(countsResponse.data)
      } catch {
        setEvaluations([])
        setPages(1)
        setCounts({
          awaiting_review: 0,
          final_approved: 0,
          rejected: 0,
          total: 0,
        })
        setMessage('Failed to load evaluations.')
      } finally {
        setLoading(false)
      }
    }

    loadEvaluations()
  }, [page, search, activeView])

  const handleViewChange = (view: PrincipalView) => {
    setActiveView(view)
    setPage(1)
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  if (loading) {
    return <div className="loading-text">Loading...</div>
  }

  return (
    <div>
      <h1 className="page-title">
        Principal Dashboard
      </h1>

      {message && (
        <div className="card card-body error-card mb-6">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
      )}

      <div className="stats-grid">
        <div
          className="stat-card"
          onClick={() => handleViewChange('awaiting_review')}
          style={{
            cursor: 'pointer',
            border:
              activeView === 'awaiting_review'
                ? '2px solid var(--primary)'
                : '2px solid transparent',
          }}
        >
          <h3>{counts.awaiting_review}</h3>
          <p>Awaiting Review</p>
        </div>

        <div
          className="stat-card"
          onClick={() => handleViewChange('final_approved')}
          style={{
            cursor: 'pointer',
            border:
              activeView === 'final_approved'
                ? '2px solid var(--primary)'
                : '2px solid transparent',
          }}
        >
          <h3>{counts.final_approved}</h3>
          <p>Final Approved</p>
        </div>

        <div
          className="stat-card"
          onClick={() => handleViewChange('rejected')}
          style={{
            cursor: 'pointer',
            border:
              activeView === 'rejected'
                ? '2px solid var(--primary)'
                : '2px solid transparent',
          }}
        >
          <h3>{counts.rejected}</h3>
          <p>Rejected</p>
        </div>

        <div
          className="stat-card"
          onClick={() => handleViewChange('total')}
          style={{
            cursor: 'pointer',
            border:
              activeView === 'total'
                ? '2px solid var(--primary)'
                : '2px solid transparent',
          }}
        >
          <h3>{counts.total}</h3>
          <p>Total Evaluations</p>
        </div>
      </div>

      <section className="section">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 className="section-title">
              {getSectionTitle()}
            </h2>

            <p
              style={{
                margin: '6px 0 0',
                color: 'var(--text-muted)',
              }}
            >
              {getSectionDescription()}
            </p>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) =>
              handleSearchChange(e.target.value)
            }
            placeholder="Search faculty name or employee ID"
            style={{
              width: '280px',
              maxWidth: '100%',
              padding: '11px 14px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {evaluations.length === 0 ? (
          <div className="card card-body">
            <h3 style={{ marginTop: 0 }}>
              No evaluations found
            </h3>

            <p style={{ marginBottom: 0 }}>
              {search
                ? 'No evaluations match your search.'
                : 'There are currently no evaluations in this section.'}
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                width: '100%',
                overflowX: 'auto',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                background: 'white',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: '900px',
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-dark)',
                        fontWeight: 600,
                      }}
                    >
                      Faculty
                    </th>

                    <th
                      style={{
                        textAlign: 'left',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-dark)',
                        fontWeight: 600,
                      }}
                    >
                      Employee ID
                    </th>

                    <th
                      style={{
                        textAlign: 'left',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-dark)',
                        fontWeight: 600,
                      }}
                    >
                      Academic Year
                    </th>

                    <th
                      style={{
                        textAlign: 'left',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-dark)',
                        fontWeight: 600,
                      }}
                    >
                      Total Points
                    </th>

                    <th
                      style={{
                        textAlign: 'left',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-dark)',
                        fontWeight: 600,
                      }}
                    >
                      Status
                    </th>

                    <th
                      style={{
                        textAlign: 'right',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--text-dark)',
                        fontWeight: 600,
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {evaluations.map((ev) => (
                    <tr key={ev.id}>
                      <td
                        style={{
                          padding: '18px 20px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {ev.faculty?.employee_name ??
                          ev.faculty_id}
                      </td>

                      <td
                        style={{
                          padding: '18px 20px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {ev.faculty?.employee_id ?? '—'}
                      </td>

                      <td
                        style={{
                          padding: '18px 20px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {ev.academic_year || '—'}
                      </td>

                      <td
                        style={{
                          padding: '18px 20px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {ev.total_points ?? 0}
                      </td>

                      <td
                        style={{
                          padding: '18px 20px',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <span
                          className={`badge ${
                            ev.status === 'approved'
                              ? 'approved'
                              : ev.status === 'rejected'
                                ? 'rejected'
                                : 'approved'
                          }`}
                        >
                          {ev.status === 'approved'
                            ? 'Final Approved'
                            : ev.status === 'rejected'
                              ? 'Rejected'
                              : 'HOD Approved'}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '18px 20px',
                          borderBottom: '1px solid var(--border)',
                          textAlign: 'right',
                        }}
                      >
                        <Link
                          to={`/evaluation/${ev.id}/view`}
                          className="btn btn-outline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pages > 1 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '16px',
                  marginTop: '24px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    setPage((current) =>
                      Math.max(current - 1, 1)
                    )
                  }
                  disabled={page === 1}
                >
                  Previous
                </button>

                <span>
                  Page {page} of {pages}
                </span>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(current + 1, pages)
                    )
                  }
                  disabled={page === pages}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
