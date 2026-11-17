export type BoardMember = {
  name: string
  email: string
}

export const BOARD_MEMBERS: BoardMember[] = [
  { name: 'Diego Ramos', email: 'diego@demo.com' },
  { name: 'Elisa Prado', email: 'elisa@demo.com' },
  { name: 'Felipe Costa', email: 'felipe@demo.com' },
]

export function isBoardMember(email: string | undefined): boolean {
  return BOARD_MEMBERS.some((member) => member.email === email)
}
