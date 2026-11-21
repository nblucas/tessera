import { createHash, randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { body, createTestApp } from './app'
import { multipart } from './multipart'

const t = await createTestApp()
afterAll(() => t.close())

const diego = await t.signIn('diego@demo.com')
const elisa = await t.signIn('elisa@demo.com')
const student = await t.signIn('student@demo.com')

type Expense = {
  id: string
  description: string
  status: string
  approvals: { address: string; name: string | null }[]
  receipt: { id: string; fileName: string; sha256: string }
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')

function upload(user: typeof diego, data: Buffer, options: { sha256?: string; mime?: string } = {}) {
  const form = multipart('invoice.pdf', options.mime ?? 'application/pdf', data)
  return t.app.inject({
    method: 'POST',
    url: `/receipts?sha256=${options.sha256 ?? sha256(data)}`,
    payload: form.payload,
    headers: { ...form.headers, cookie: user.cookie },
  })
}

async function proposeExpense(description = 'Sound system rental') {
  const file = Buffer.from(`invoice ${randomUUID()}`)
  const receipt = body<{ id: string; sha256: string }>(await upload(diego, file))
  const expenseId = randomUUID()
  const action = await diego.sign('ExpenseProposed', {
    expenseId,
    amountCents: 120000,
    category: 'Suppliers',
    eventId: 'end-of-year-party',
    receiptSha256: receipt.sha256,
  })
  const response = await diego.post('/expenses', { description, receiptId: receipt.id, action })
  return { response, expense: body<Expense>(response), file, expenseId }
}

async function vote(user: typeof diego, expenseId: string, approve: boolean) {
  const action = await user.sign('ExpenseVoted', { expenseId, approve })
  return user.post(`/expenses/${expenseId}/votes`, { action })
}

describe('receipts', () => {
  it('stores a receipt and returns its hash', async () => {
    const data = Buffer.from('%PDF-1.4 fake invoice')
    const response = await upload(diego, data)
    expect(response.statusCode).toBe(201)
    expect(body(response)).toMatchObject({ fileName: 'invoice.pdf', sha256: sha256(data) })
  })

  it('rejects a file whose hash differs from the one the client computed', async () => {
    const response = await upload(diego, Buffer.from('real file'), { sha256: 'f'.repeat(64) })
    expect(response.statusCode).toBe(400)
  })

  it('rejects files over 1 MB', async () => {
    const response = await upload(diego, Buffer.alloc(1024 * 1024 + 1))
    expect(response.statusCode).toBe(413)
  })

  it('accepts only images and PDFs', async () => {
    const response = await upload(diego, Buffer.from('x'), { mime: 'text/plain' })
    expect(response.statusCode).toBe(400)
  })

  it('keeps uploads to the board', async () => {
    expect((await upload(student, Buffer.from('x'))).statusCode).toBe(403)
  })
})

describe('expenses', () => {
  it('starts pending with the proposer as the first approval', async () => {
    const { response, expense } = await proposeExpense()
    expect(response.statusCode).toBe(201)
    expect(expense).toMatchObject({ description: 'Sound system rental', status: 'pending' })
    expect(expense.approvals).toEqual([expect.objectContaining({ name: 'Diego Ramos' })])
  })

  it('rejects a proposal signed for a different receipt', async () => {
    const receipt = body<{ id: string }>(await upload(diego, Buffer.from(`other ${randomUUID()}`)))
    const action = await diego.sign('ExpenseProposed', {
      expenseId: randomUUID(),
      amountCents: 5000,
      category: 'Other',
      eventId: '',
      receiptSha256: 'a'.repeat(64),
    })
    const response = await diego.post('/expenses', { description: 'x', receiptId: receipt.id, action })
    expect(response.statusCode).toBe(400)
  })

  it('rejects an expense for an event that does not exist', async () => {
    const file = Buffer.from(`invoice ${randomUUID()}`)
    const receipt = body<{ id: string; sha256: string }>(await upload(diego, file))
    const action = await diego.sign('ExpenseProposed', {
      expenseId: randomUUID(),
      amountCents: 5000,
      category: 'Other',
      eventId: 'no-such-event',
      receiptSha256: receipt.sha256,
    })
    const response = await diego.post('/expenses', { description: 'x', receiptId: receipt.id, action })
    expect(response.statusCode).toBe(400)
  })

  it('is approved once a second director approves', async () => {
    const { expenseId } = await proposeExpense()
    const response = await vote(elisa, expenseId, true)
    expect(body<Expense>(response).status).toBe('approved')
  })

  it('lets each director vote once', async () => {
    const { expenseId } = await proposeExpense()
    expect((await vote(diego, expenseId, true)).statusCode).toBe(409)
  })

  it('lists pending and decided expenses for the board only', async () => {
    const { expenseId } = await proposeExpense('Security team')
    const list = body<Expense[]>(await elisa.get('/expenses'))
    expect(list.find((expense) => expense.id === expenseId)?.description).toBe('Security team')

    expect((await student.get('/expenses')).statusCode).toBe(403)
  })

  it('makes a receipt public only once its expense is approved', async () => {
    const { expense, expenseId, file } = await proposeExpense()
    const url = `/receipts/${expense.receipt.id}`

    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(403)
    expect((await elisa.get(url)).statusCode).toBe(200)

    await vote(elisa, expenseId, true)
    const download = await t.app.inject({ method: 'GET', url })
    expect(download.statusCode).toBe(200)
    expect(download.rawPayload.equals(file)).toBe(true)
    expect(download.headers['content-disposition']).toContain('invoice.pdf')
  })

  it('erases a receipt file for privacy but keeps its hash in the open accounts', async () => {
    const { expense, expenseId } = await proposeExpense('Supplier with personal data')
    await vote(elisa, expenseId, true)

    expect((await student.delete(`/receipts/${expense.receipt.id}/file`)).statusCode).toBe(403)
    expect((await diego.delete(`/receipts/${expense.receipt.id}/file`)).statusCode).toBe(204)

    const download = await t.app.inject({ method: 'GET', url: `/receipts/${expense.receipt.id}` })
    expect(download.statusCode).toBe(410)
    const accounts = body<{ events: { expenses: { id: string; receiptSha256: string; receipt: { erased: boolean } }[] }[] }>(
      await t.app.inject({ method: 'GET', url: '/accounts' }),
    )
    const line = accounts.events.flatMap((event) => event.expenses).find((item) => item.id === expenseId)
    expect(line).toMatchObject({ receiptSha256: expense.receipt.sha256, receipt: { erased: true } })
  })
})
