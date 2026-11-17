import { createContext, useContext } from 'react'

export type User = {
  email: string
}

export type AuthContextValue = {
  user: User | null
  signIn: (email: string) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return value
}
