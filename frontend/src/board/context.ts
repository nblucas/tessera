import { createContext, useContext } from 'react'
import type { BoardMember, BoardState } from '../data/board'

export type BoardContextValue = BoardState & {
  members: BoardMember[]
  majority: number
  isBoardMember: (email: string | undefined) => boolean
  memberName: (email: string) => string
  proposeHandover: (proposedBy: string, newMembers: BoardMember[]) => void
  approveHandover: (email: string) => void
  cancelHandover: (email: string) => void
}

export const BoardContext = createContext<BoardContextValue | null>(null)

export function useBoard(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) {
    throw new Error('useBoard must be used inside <BoardProvider>')
  }
  return value
}
