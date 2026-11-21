import { afterAll, describe, expect, it } from 'vitest'
import { body, createTestApp } from './app'

const t = await createTestApp()
afterAll(() => t.close())

const diego = await t.signIn('diego@demo.com')
const elisa = await t.signIn('elisa@demo.com')
const student = await t.signIn('student@demo.com')

type Board = {
  current: { term: number; members: { address: string; name: string | null }[] }
  past: { term: number }[]
  majority: number
  handover: null | {
    id: string
    status: 'draft' | 'open'
    members: { name: string; email: string; address: string | null }[]
    missing: string[]
    approvals: { address: string }[]
  }
}

async function registered(email: string) {
  const user = await t.signIn(email)
  await user.registerAddress()
  return user
}

const nina = await registered('nina@student.edu')
const otto = await registered('otto@student.edu')

const nextBoard = [
  { name: 'Elisa Prado', email: 'elisa@demo.com' },
  { name: 'Nina Alves', email: 'nina@student.edu' },
  { name: 'Otto Reis', email: 'otto@student.edu' },
]

async function draft(members = nextBoard) {
  const response = await diego.post('/handover', { members })
  expect(response.statusCode).toBe(201)
  return body<Board>(response).handover!
}

async function propose(handover: NonNullable<Board['handover']>) {
  const action = await diego.sign('HandoverProposed', {
    handoverId: handover.id,
    // A missing address gets a placeholder: the API must refuse before checking the signature.
    members: handover.members.map((member) => (member.address ?? student.wallet.address) as `0x${string}`),
  })
  return diego.post(`/handover/${handover.id}/propose`, { action })
}

async function cancelDraft(id: string) {
  expect((await diego.post(`/handover/${id}/cancel`)).statusCode).toBe(200)
}

describe('board', () => {
  it('shows the current board and the majority needed', async () => {
    const board = body<Board>(await diego.get('/board'))
    expect(board.current.term).toBe(1)
    expect(board.current.members.map((member) => member.name)).toEqual([
      'Diego Ramos',
      'Elisa Prado',
      'Felipe Costa',
    ])
    expect(board.majority).toBe(2)
    expect(board.handover).toBeNull()
  })

  it('is visible to directors only', async () => {
    expect((await student.get('/board')).statusCode).toBe(403)
  })
})

describe('handover', () => {
  it('keeps proposals to current directors', async () => {
    expect((await student.post('/handover', { members: nextBoard })).statusCode).toBe(403)
  })

  it('waits for every proposed director to register a wallet', async () => {
    const pending = await draft([...nextBoard, { name: 'Pia Lopes', email: 'pia@student.edu' }])
    expect(pending.status).toBe('draft')
    expect(pending.missing).toEqual(['pia@student.edu'])
    expect((await propose(pending)).statusCode).toBe(409)

    await registered('pia@student.edu')
    const ready = body<Board>(await diego.get('/board')).handover!
    expect(ready.missing).toEqual([])
    await cancelDraft(ready.id)
  })

  it('lets only the proposer cancel a draft', async () => {
    const pending = await draft()
    expect((await elisa.post(`/handover/${pending.id}/cancel`)).statusCode).toBe(403)
    await cancelDraft(pending.id)
    expect(body<Board>(await diego.get('/board')).handover).toBeNull()
  })

  it('rejects a proposal signed with other members', async () => {
    const pending = await draft()
    const action = await diego.sign('HandoverProposed', {
      handoverId: pending.id,
      members: [student.wallet.address],
    })
    expect((await diego.post(`/handover/${pending.id}/propose`, { action })).statusCode).toBe(400)
    await cancelDraft(pending.id)
  })

  it('cancels an open proposal with a signed action', async () => {
    const pending = await draft()
    expect((await propose(pending)).statusCode).toBe(200)

    const action = await diego.sign('HandoverCancelled', { handoverId: pending.id })
    const response = await diego.post(`/handover/${pending.id}/cancel`, { action })
    expect(response.statusCode).toBe(200)
    expect(body<Board>(response).handover).toBeNull()
  })

  it('hands the board over once a majority approves', async () => {
    const pending = await draft()
    const proposed = body<Board>(await propose(pending)).handover!
    expect(proposed).toMatchObject({ status: 'open', approvals: [{ address: diego.wallet.address }] })

    const action = await elisa.sign('HandoverApproved', { handoverId: pending.id })
    const response = await elisa.post(`/handover/${pending.id}/approvals`, { action })
    const board = body<Board>(response)

    expect(board.current.term).toBe(2)
    expect(board.current.members.map((member) => member.name)).toEqual([
      'Elisa Prado',
      'Nina Alves',
      'Otto Reis',
    ])
    expect(board.past.map((term) => term.term)).toEqual([1])
    expect(board.handover).toBeNull()

    expect(body(await diego.get('/me'))).toMatchObject({ isBoardMember: false })
    expect((await diego.get('/board')).statusCode).toBe(403)
    expect(body(await nina.get('/me'))).toMatchObject({ isBoardMember: true })
    expect((await otto.get('/board')).statusCode).toBe(200)
  })
})
