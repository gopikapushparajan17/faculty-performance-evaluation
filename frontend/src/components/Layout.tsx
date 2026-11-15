import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  FaUniversity,
  FaHome,
  FaUserPlus,
  FaSignOutAlt,
  FaChevronRight,
} from 'react-icons/fa'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const pageName = location.pathname.startsWith('/evaluation/new')
    ? 'New evaluation'
    : location.pathname.includes('/edit')
      ? 'Edit evaluation'
      : location.pathname.includes('/view')
        ? 'Evaluation record'
        : location.pathname.startsWith('/faculty/new')
          ? 'Faculty directory'
          : 'Overview'

  const initials = (user?.name || user?.email || 'FE')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol"><FaUniversity /></div>
          <div className="brand-copy">
            <span className="brand-name">Faculty<span>Eval</span></span>
            <span className="brand-caption">ACADEMIC RECORDS</span>
          </div>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavLink to="/dashboard" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <FaHome /><span>Overview</span><FaChevronRight className="nav-chevron" />
          </NavLink>
          {user?.role === 'hod' && (
            <NavLink to="/faculty/new" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <FaUserPlus /><span>Faculty directory</span><FaChevronRight className="nav-chevron" />
            </NavLink>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-year"><span className="year-dot" /> Academic year 2026</div>
          <div className="sidebar-user">
            <div className="avatar">{initials}</div>
            <div className="sidebar-user-copy">
              <strong>{user?.name || 'Signed-in user'}</strong>
              <span>{user?.role || 'Member'}</span>
            </div>
            <button type="button" className="logout-icon" onClick={handleLogout} aria-label="Log out" title="Log out">
              <FaSignOutAlt />
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb"><span>FACULTY EVALUATION</span><FaChevronRight /><strong>{pageName}</strong></div>
          <div className="topbar-meta"><span className="topbar-live-dot" /> Secure academic workspace</div>
        </header>
        <main className="main">
          <div className="page-enter"><Outlet /></div>
          <footer className="app-footer"><span>FACULTY PERFORMANCE EVALUATION</span><span>Institutional record · 2026</span></footer>
        </main>
      </div>
    </div>
  )
}
