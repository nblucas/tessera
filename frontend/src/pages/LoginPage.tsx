import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router'
import { errorMessage } from '../api/client'
import { useAuth } from '../auth/context'
import { TesseraMark } from '../components/TesseraMark'
import { resetDemoData } from '../lib/demo'
import { LoginArt } from './LoginArt'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CODE_PATTERN = /^\d{6}$/
// Demo mode accepts any 6-digit code, so sign-in stays one click.
const DEMO_CODE = '000000'

export function LoginPage() {
  const { user, config, loading, requestCode, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from ? from.pathname + from.search : '/'

  if (loading) return null
  if (user) {
    return <Navigate to={redirectTo} replace />
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid e-mail address.')
      return
    }
    run(async () => {
      if (config?.demoMode) {
        await signIn(email, DEMO_CODE)
        navigate(redirectTo, { replace: true })
      } else {
        await requestCode(email)
        setStep('code')
      }
    })
  }

  function handleCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!CODE_PATTERN.test(code.trim())) {
      setError('Enter the 6-digit code from the e-mail.')
      return
    }
    run(async () => {
      await signIn(email, code.trim())
      navigate(redirectTo, { replace: true })
    })
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

          {step === 'email' ? (
            <form onSubmit={handleEmail} noValidate>
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
              <button type="submit" disabled={busy}>
                {config?.demoMode ? 'Sign in' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCode} noValidate>
              <label htmlFor="code">Code sent to {email}</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className={error ? 'invalid' : undefined}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value)
                  setError(null)
                }}
                autoFocus
              />
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>
                Sign in
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setStep('email')
                  setCode('')
                  setError(null)
                }}
              >
                Use another e-mail
              </button>
            </form>
          )}

          {config?.demoMode && (
            <p className="hint">Demo mode: any e-mail works, no code needed.</p>
          )}
          <p className="hint">
            <Link to="/transparency">See the association's open accounts →</Link>
          </p>
          {config?.demoMode && (
            <p className="hint">
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  const confirmed = window.confirm(
                    'Delete all tickets, sales, expenses and changes made in this demo?',
                  )
                  if (confirmed) {
                    resetDemoData().catch((cause: unknown) => setError(errorMessage(cause)))
                  }
                }}
              >
                Reset demo data
              </button>
            </p>
          )}
        </div>
      </section>
      <LoginArt />
    </main>
  )
}
