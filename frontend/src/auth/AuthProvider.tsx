import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PrivateKeyAccount } from 'viem'
import { api, ApiError } from '../api/client'
import type { AppConfig, Me } from '../api/types'
import { connectWallet, signerFor, type Sign } from '../wallet/wallet'
import { AuthContext } from './context'

// The session is an httpOnly cookie set by the backend; this provider only asks who is signed in.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null)
  const [walletError, setWalletError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const connect = useCallback(async (me: Me) => {
    const result = await connectWallet(me)
    setUser(result.me)
    setAccount(result.account)
    setWalletError(result.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [appConfig, me] = await Promise.all([
          api.get<AppConfig>('/config'),
          api.get<Me>('/me').catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 401) return null
            throw error
          }),
        ])
        if (cancelled) return
        setConfig(appConfig)
        if (me) await connect(me)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [connect])

  async function requestCode(email: string) {
    await api.post('/auth/code', { email })
  }

  async function signIn(email: string, code: string) {
    const me = await api.post<Me>('/auth/session', { email, code })
    await connect(me)
  }

  async function signOut() {
    await api.delete('/auth/session')
    setUser(null)
    setAccount(null)
    setWalletError(null)
  }

  async function refreshUser() {
    setUser(await api.get<Me>('/me'))
  }

  const sign: Sign = (kind, fields) => {
    if (!account) {
      return Promise.reject(new Error(walletError ?? 'Sign in first.'))
    }
    return signerFor(account)(kind, fields)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        loading,
        walletError,
        requestCode,
        signIn,
        signOut,
        refreshUser,
        sign,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
