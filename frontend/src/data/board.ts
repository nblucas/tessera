export type BoardMember = {
  name: string
  email: string
}

export const BOARD_MEMBERS: BoardMember[] = [
  { name: 'Diego Ramos', email: 'diego@demo.com' },
  { name: 'Elisa Prado', email: 'elisa@demo.com' },
  { name: 'Felipe Costa', email: 'felipe@demo.com' },
]

export const BOARD_MAJORITY = Math.floor(BOARD_MEMBERS.length / 2) + 1

export function boardMemberName(email: string): string {
  return BOARD_MEMBERS.find((member) => member.email === email)?.name ?? email
}

export function isBoardMember(email: string | undefined): boolean {
  return BOARD_MEMBERS.some((member) => member.email === email)
}
