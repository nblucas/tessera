import type { ReactNode } from 'react'
import { useAuth } from '../auth/context'
import { isBoardMember } from '../data/board'
import { AppHeader } from './AppHeader'

export function BoardOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (!isBoardMember(user?.email)) {
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
