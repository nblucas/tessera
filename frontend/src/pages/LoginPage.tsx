import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router'
import { useAuth } from '../auth/context'
import { TesseraMark } from '../components/TesseraMark'
import { LoginArt } from './LoginArt'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from ? from.pathname + from.search : '/'

  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid e-mail address.')
      return
    }
    signIn(email)
    navigate(redirectTo, { replace: true })
  }

  return (
    <main className="login">
      <section className="login-form">
        <div className="card">
          <h1 className="card-title">
            <TesseraMark size={32} />
            Tessera
          </h1>
          <p className="muted">Tickets and open accounts for your association.</p>

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@university.edu"
              className={error ? 'invalid' : undefined}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
              autoFocus
            />
            {error && <p className="error">{error}</p>}
            <button type="submit">Sign in</button>
          </form>

          <p className="hint">Demo mode: any e-mail works, no password needed.</p>
          <p className="hint">
            <Link to="/transparency">See the association's open accounts →</Link>
          </p>
        </div>
      </section>
      <LoginArt />
    </main>
  )
}
