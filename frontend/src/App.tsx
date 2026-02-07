import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import FacultyDetails from './pages/FacultyDetails'
import EvaluationForm from './pages/EvaluationForm'
import EvaluationView from './pages/EvaluationView'

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="faculty/new" element={<ProtectedRoute allowedRoles={['hod']}><FacultyDetails /></ProtectedRoute>} />
        <Route path="faculty/:id/edit" element={<ProtectedRoute allowedRoles={['hod']}><FacultyDetails /></ProtectedRoute>} />
        <Route path="evaluation/new/:facultyId" element={<ProtectedRoute allowedRoles={['hod']}><EvaluationForm /></ProtectedRoute>} />
        <Route path="evaluation/:evaluationId/edit" element={<EvaluationForm />} />
        <Route path="evaluation/:evaluationId/view" element={<EvaluationView />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
