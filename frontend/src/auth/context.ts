import { createContext, useContext } from 'react'
import type { AppConfig, Me } from '../api/types'
import type { Sign } from '../wallet/wallet'

export type AuthContextValue = {
  user: Me | null
  config: AppConfig | null
  loading: boolean
  // Set when this browser cannot sign for the account (see connectWallet).
  walletError: string | null
  requestCode: (email: string) => Promise<void>
  signIn: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
  // Reloads the account, for example after a handover changes who is on the board.
  refreshUser: () => Promise<void>
  sign: Sign
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return value
}
