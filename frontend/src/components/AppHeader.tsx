import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/context'
import { TesseraMark } from './TesseraMark'

export function AppHeader() {
  const { user, signOut } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="topbar-brand">
          <TesseraMark size={24} />
          Tessera
        </Link>
        <nav className="topbar-nav">
          <NavLink to="/" end>
            Events
          </NavLink>
          <NavLink to="/resale">Resale</NavLink>
          <NavLink to="/tickets">My tickets</NavLink>
        </nav>
      </div>
      <div className="topbar-user">
        <span className="muted">{user?.email}</span>
        <button type="button" className="secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
    </header>
  )
}
