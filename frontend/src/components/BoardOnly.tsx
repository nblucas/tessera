import type { ReactNode } from 'react'
import { useAuth } from '../auth/context'
import { AppHeader } from './AppHeader'

export function BoardOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (!user?.isBoardMember) {
    return (
      <>
        <AppHeader />
        <main className="page">
          <h1>Board only</h1>
          <p className="muted">This area is only available to the association's board.</p>
        </main>
      </>
    )
  }
  return children
}
