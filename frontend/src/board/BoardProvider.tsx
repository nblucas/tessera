import { useState, type ReactNode } from 'react'
import { SEED_BOARD, majorityOf, type BoardMember, type BoardState } from '../data/board'
import { BoardContext } from './context'

const STORAGE_KEY = 'tessera.board'

function loadBoard(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as BoardState) : SEED_BOARD
  } catch {
    return SEED_BOARD
  }
}

function persist(board: BoardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  } catch {
    // Storage unavailable: keep the board in memory only.
  }
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<BoardState>(loadBoard)
  const members = board.current.members
  const majority = majorityOf(members.length)

  function update(change: (current: BoardState) => BoardState) {
    setBoard((current) => {
      const next = change(current)
      persist(next)
      return next
    })
  }

  function isBoardMember(email: string | undefined) {
    return members.some((member) => member.email === email)
  }

  function memberName(email: string) {
    const all = [board.current, ...board.past].flatMap((term) => term.members)
    return all.find((member) => member.email === email)?.name ?? email
  }

  function proposeHandover(proposedBy: string, newMembers: BoardMember[]) {
    update((current) =>
      current.handover
        ? current
        : {
            ...current,
            handover: {
              proposedBy,
              newMembers,
              approvals: [proposedBy],
              createdAt: new Date().toISOString(),
            },
          },
    )
  }

  function approveHandover(email: string) {
    update((current) => {
      const { handover } = current
      const isMember = current.current.members.some((member) => member.email === email)
      if (!handover || !isMember || handover.approvals.includes(email)) return current

      const approvals = [...handover.approvals, email]
      if (approvals.length < majorityOf(current.current.members.length)) {
        return { ...current, handover: { ...handover, approvals } }
      }

      const now = new Date().toISOString()
      return {
        current: {
          number: current.current.number + 1,
          members: handover.newMembers,
          startedAt: now,
        },
        past: [{ ...current.current, endedAt: now }, ...current.past],
        handover: null,
      }
    })
  }

  function cancelHandover(email: string) {
    update((current) =>
      current.handover?.proposedBy === email ? { ...current, handover: null } : current,
    )
  }

  return (
    <BoardContext.Provider
      value={{
        ...board,
        members,
        majority,
        isBoardMember,
        memberName,
        proposeHandover,
        approveHandover,
        cancelHandover,
      }}
    >
      {children}
    </BoardContext.Provider>
  )
}
