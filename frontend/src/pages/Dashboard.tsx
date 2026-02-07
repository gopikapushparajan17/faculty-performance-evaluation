import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import type { Evaluation, FacultyProfile } from '../types/evaluation'

export default function Dashboard() {
  const { user } = useAuth()
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [facultyList, setFacultyList] = useState<FacultyProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        if (user?.role === 'hod') {
          const [evRes, facRes] = await Promise.all([
            api.get<Evaluation[]>('/evaluations'),
            api.get<FacultyProfile[]>('/faculty'),
          ])
          setEvaluations(evRes.data)
          setFacultyList(facRes.data)
        } else if (user?.role === 'faculty') {
          const res = await api.get<Evaluation[]>('/evaluations/mine')
          setEvaluations(res.data)
        } else if (user?.role === 'principal') {
          const res = await api.get<Evaluation[]>('/evaluations/all')
          setEvaluations(res.data)
        }
      } catch {
        setEvaluations([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.role])

  const statusLabel: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    faculty_signed: 'Faculty Signed',
    hod_signed: 'HOD Signed',
    approved: 'Approved',
  }

  if (loading) return <div className="loading-text">Loading...</div>

  return (
    <div>
      <h1 className="page-title">
        {user?.role === 'hod' && 'Department Evaluations'}
        {user?.role === 'faculty' && 'My Evaluation'}
        {user?.role === 'principal' && 'Institution-wide Evaluations'}
      </h1>

      {user?.role === 'hod' && (
        <div className="mb-6">
          <Link to="/faculty/new" className="btn btn-secondary">
            Add Faculty
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
            {evaluations.length === 0 ? (
              <tr>
                <td colSpan={4} className="td-muted">No evaluations yet.</td>
              </tr>
            ) : (
              evaluations.map((ev) => (
                <tr key={ev.id}>
                  <td>{ev.faculty?.employee_name ?? ev.faculty_id} — {ev.academic_year}</td>
                  <td>
                    <span className="badge">{statusLabel[ev.status] ?? ev.status}</span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{ev.total_points ?? 0}</td>
                  <td>
                    <Link to={`/evaluation/${ev.id}/view`} className="link">View</Link>
                    <Link to={`/evaluation/${ev.id}/edit`} className="link">Edit</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {user?.role === 'hod' && facultyList.length > 0 && (
        <section className="section">
          <h2 className="section-title">Faculty</h2>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {facultyList.map((f) => (
                  <tr key={f.id}>
                    <td>{f.employee_name}</td>
                    <td>{f.employee_id}</td>
                    <td>{f.department_name}</td>
                    <td>
                      <Link to={`/faculty/${f.id}/edit`} className="link">Edit</Link>
                      <Link to={`/evaluation/new/${f.id}`} className="link">New Evaluation</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
