import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { api } from '../api/client'
import { useAccountData } from '../api/useAccountData'
import type { BoardView } from '../api/types'
import { useAuth } from '../auth/context'
import { BoardContext, type NewDirector } from './context'

const loadBoard = () => api.get<BoardView>('/board')

export function BoardProvider({ children }: { children: ReactNode }) {
  const { user, sign, refreshUser } = useAuth()
  const { data: board, loading, refresh, update } = useAccountData<BoardView | null>(
    user?.isBoardMember ? user.id : null,
    loadBoard,
    null,
  )
  const setBoard = (next: BoardView) => update(() => next)

  function openHandover() {
    const handover = board?.handover
    if (!handover) throw new Error('No handover in progress.')
    return handover
  }

  async function proposeHandover(members: NewDirector[]) {
    setBoard(await api.post<BoardView>('/handover', { members }))
  }

  async function submitProposal() {
    const handover = openHandover()
    const action = await sign('HandoverProposed', {
      handoverId: handover.id,
      members: handover.members.map((member) => member.address as Address),
    })
    setBoard(await api.post<BoardView>(`/handover/${handover.id}/propose`, { action }))
  }

  async function approveHandover() {
    const handover = openHandover()
    const action = await sign('HandoverApproved', { handoverId: handover.id })
    setBoard(await api.post<BoardView>(`/handover/${handover.id}/approvals`, { action }))
    // A completed handover can take the current user off the board.
    await refreshUser()
  }

  async function cancelHandover() {
    const handover = openHandover()
    const action =
      handover.status === 'open'
        ? await sign('HandoverCancelled', { handoverId: handover.id })
        : undefined
    setBoard(await api.post<BoardView>(`/handover/${handover.id}/cancel`, { action }))
  }

  return (
    <BoardContext.Provider
      value={{
        board,
        loading,
        refresh,
        proposeHandover,
        submitProposal,
        approveHandover,
        cancelHandover,
      }}
    >
      {children}
    </BoardContext.Provider>
  )
}
