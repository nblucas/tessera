import { useState, type ReactNode } from 'react'
import { AuthContext, type User } from './context'

// MVP: fake sign-in. The user is kept in localStorage so a page reload
// does not log them out. No password, no backend.
const STORAGE_KEY = 'tessera.user'

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function saveUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Storage unavailable (e.g. private mode): keep the session in memory only.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadUser)

  function signIn(email: string) {
    const next = { email: email.trim().toLowerCase() }
    saveUser(next)
    setUser(next)
  }

  function signOut() {
    saveUser(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
