import { createContext, useContext } from 'react'
import type { BoardView } from '../api/types'

export type NewDirector = { name: string; email: string }

export type BoardContextValue = {
  board: BoardView | null
  loading: boolean
  refresh: () => Promise<void>
  proposeHandover: (members: NewDirector[]) => Promise<void>
  // Signs and submits the proposal once every proposed director has a wallet address.
  submitProposal: () => Promise<void>
  approveHandover: () => Promise<void>
  cancelHandover: () => Promise<void>
}

export const BoardContext = createContext<BoardContextValue | null>(null)

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) {
    throw new Error('useBoard must be used inside <BoardProvider>')
  }
  return value
}
