export type BoardMember = {
  name: string
  email: string
}

export type BoardTerm = {
  number: number
  members: BoardMember[]
  startedAt: string
  endedAt?: string
}

export type Handover = {
  proposedBy: string
  newMembers: BoardMember[]
  approvals: string[]
  createdAt: string
}

export type BoardState = {
  current: BoardTerm
  past: BoardTerm[]
  handover: Handover | null
}

export const SEED_BOARD: BoardState = {
  current: {
    number: 1,
    members: [
      { name: 'Diego Ramos', email: 'diego@demo.com' },
      { name: 'Elisa Prado', email: 'elisa@demo.com' },
      { name: 'Felipe Costa', email: 'felipe@demo.com' },
    ],
    startedAt: '2026-03-01T00:00:00-03:00',
  },
  past: [],
  handover: null,
}

export function majorityOf(count: number): number {
  return Math.floor(count / 2) + 1
}
