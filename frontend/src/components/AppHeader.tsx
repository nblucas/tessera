import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/context'
import { isBoardMember } from '../data/board'
import { useSellers } from '../sellers/context'
import { TesseraMark } from './TesseraMark'

export function AppHeader() {
  const { user, signOut } = useAuth()
  const { findSellerByEmail } = useSellers()
  const isSeller = findSellerByEmail(user?.email) !== undefined
  const isBoard = isBoardMember(user?.email)

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
          {isSeller && <NavLink to="/sales">My sales</NavLink>}
          {isBoard && <NavLink to="/board">Board</NavLink>}
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
