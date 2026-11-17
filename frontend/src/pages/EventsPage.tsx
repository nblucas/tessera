import { useAuth } from '../auth/context'

// Placeholder for requirement 2 (list of events).
export function EventsPage() {
  const { user, signOut } = useAuth()

  return (
    <>
      <header className="topbar">
        <strong>Tessera</strong>
        <div className="topbar-user">
          <span className="muted">{user?.email}</span>
          <button type="button" className="secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="page">
        <h1>Events</h1>
        <p className="muted">Coming soon.</p>
      </main>
    </>
  )
}
