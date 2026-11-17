import { Link } from 'react-router'
import { useAuth } from '../auth/context'
import { TesseraMark } from './TesseraMark'

export function AppHeader() {
  const { user, signOut } = useAuth()

  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand">
        <TesseraMark size={24} />
        Tessera
      </Link>
      <div className="topbar-user">
        <span className="muted">{user?.email}</span>
        <button type="button" className="secondary" onClick={signOut}>
          Sign out
        </button>
      </div>
    </header>
  )
}
