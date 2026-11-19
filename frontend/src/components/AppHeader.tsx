import { Link, NavLink } from 'react-router'
import { useAuth } from '../auth/context'
import { useBoard } from '../board/context'
import { FEATURES } from '../features'
import { useSellers } from '../sellers/context'
import { TesseraMark } from './TesseraMark'

export function AppHeader() {
  const { user, signOut } = useAuth()
  const { findSellerByEmail } = useSellers()
  const { isBoardMember } = useBoard()
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
          {user && (
            <>
              <NavLink to="/" end>
                Events
              </NavLink>
              {FEATURES.resale && <NavLink to="/resale">Resale</NavLink>}
              <NavLink to="/tickets">My tickets</NavLink>
              {FEATURES.sellers && isSeller && <NavLink to="/sales">My sales</NavLink>}
            </>
          )}
          <NavLink to="/transparency">Open accounts</NavLink>
          {isBoard && (
            <>
              <NavLink to="/board">Board</NavLink>
              {FEATURES.gate && <NavLink to="/gate">Gate</NavLink>}
            </>
          )}
        </nav>
      </div>
      <div className="topbar-user">
        {user ? (
          <>
            <span className="muted">{user.email}</span>
            <button type="button" className="secondary" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" className="button-link secondary-link topbar-signin">
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
