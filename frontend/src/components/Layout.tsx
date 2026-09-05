import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import {
  FaHome,
  FaPlus,
  FaUserPlus,
  FaSignOutAlt,
  FaUniversity,
} from 'react-icons/fa'

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
          <div className="logo-row">
            <FaUniversity size={24} />
            <h1>Faculty Eval</h1>
          </div>

          <div className="user-card">
            <p className="user-name">{user?.name}</p>
            <p className="user-email">{user?.email}</p>
            <p className="user-role">{user?.role?.toUpperCase()}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive ? 'nav-link active' : 'nav-link'
            }
          >
            <FaHome />
            <span>Dashboard</span>
          </NavLink>

          {user?.role === 'hod' && (
  <NavLink
    to="/faculty/new"
    className={({ isActive }) =>
      isActive ? 'nav-link active' : 'nav-link'
    }
  >
    <FaUserPlus />
    <span>Add Faculty</span>
  </NavLink>
)}

{user?.role === 'faculty' && (
  <>
    

    

    
  </>
)}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="logout-btn"
            onClick={handleLogout}
          >
            <FaSignOutAlt />
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