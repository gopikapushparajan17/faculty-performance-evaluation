import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Faculty Eval</h1>
          <p className="user-name">{user?.name}</p>
          <p className="user-role">{user?.role}</p>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
          {user?.role === 'faculty' && (
            <NavLink to="/faculty/new" className={({ isActive }) => (isActive ? 'active' : '')}>
              New Faculty
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
