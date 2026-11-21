import { createHash, randomUUID } from 'node:crypto'
import { signedActionSchema, type SignedAction } from '@tessera/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import { events, expenseDetails, expenses, receipts } from '../../db/schema'
import type { Deps } from '../../deps'
import { peopleByAddress } from '../../queries/accounts'
import type { Api } from '../api'
import { isBoardMember, requireBoard } from '../auth'
import { badRequest, conflict, forbidden, HttpError, notFound } from '../errors'

export const MAX_RECEIPT_BYTES = 1024 * 1024

function isAllowedMime(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType === 'application/pdf'
}

export function expenseRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id

  async function expenseViews(expenseIds?: string[]) {
    const rows = await db
      .select({ expense: expenses, details: expenseDetails, receipt: receipts, eventTitle: events.title })
      .from(expenses)
      .innerJoin(expenseDetails, eq(expenseDetails.expenseId, expenses.expenseId))
      .innerJoin(receipts, eq(receipts.id, expenseDetails.receiptId))
      .leftJoin(events, eq(events.id, expenses.eventId))
      .where(
        and(
          eq(expenses.association, association),
          expenseIds ? inArray(expenses.expenseId, expenseIds) : undefined,
        ),
      )
      .orderBy(desc(expenses.proposedAt))
    const person = await peopleByAddress(
      db,
      rows.flatMap(({ expense }) => [expense.proposer, ...expense.approvals, ...expense.rejections]),
    )
    return rows.map(({ expense, details, receipt, eventTitle }) => ({
      id: expense.expenseId,
      description: details.description,
      amountCents: expense.amountCents,
      category: expense.category,
      eventId: expense.eventId,
      eventTitle,
      status: expense.status,
      proposedBy: person(expense.proposer),
      approvals: expense.approvals.map(person),
      rejections: expense.rejections.map(person),
      proposedAt: expense.proposedAt.toISOString(),
      decidedAt: expense.decidedAt?.toISOString() ?? null,
      receipt: receiptView(receipt),
    }))
  }

  async function expenseView(expenseId: string) {
    const [view] = await expenseViews([expenseId])
    if (!view) throw notFound('Expense not found.')
    return view
  }

  // The client sends the SHA-256 it computed; the server recomputes it and refuses a mismatch.
  app.post(
    '/receipts',
    { schema: { querystring: z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) }) } },
    async (request: FastifyRequest<{ Querystring: { sha256: string } }>, reply) => {
      const account = await requireBoard(deps, request)
      const file = await request.file({ limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } })
      if (!file) throw badRequest('Attach the receipt file.')
      if (!isAllowedMime(file.mimetype)) throw badRequest('The receipt must be an image or a PDF.')
      const data = await file.toBuffer().catch((error: { statusCode?: number }) => {
        if (error.statusCode === 413) throw new HttpError(413, 'too_large', 'The receipt must be at most 1 MB.')
        throw error
      })

      const sha256 = createHash('sha256').update(data).digest('hex')
      if (sha256 !== request.query.sha256) {
        throw badRequest('The file does not match the hash computed by the app. Try again.')
      }
      const id = randomUUID()
      const storageKey = `${association}/${id}`
      await deps.files.put(storageKey, data)
      const [receipt] = await db
        .insert(receipts)
        .values({
          id,
          association,
          uploadedBy: account.id,
          fileName: file.filename,
          mimeType: file.mimetype,
          sizeBytes: data.length,
          sha256,
          storageKey,
        })
        .returning()
      return reply.status(201).send(receiptView(receipt))
    },
  )

  // Public for approved expenses; directors only while pending or after a rejection.
  app.get(
    '/receipts/:receiptId',
    { schema: { params: z.object({ receiptId: z.uuid() }) } },
    async (request, reply) => {
      const [row] = await db
        .select({ receipt: receipts, status: expenses.status })
        .from(receipts)
        .leftJoin(expenseDetails, eq(expenseDetails.receiptId, receipts.id))
        .leftJoin(expenses, eq(expenses.expenseId, expenseDetails.expenseId))
        .where(and(eq(receipts.id, request.params.receiptId), eq(receipts.association, association)))
      if (!row || row.receipt.erasedAt) throw notFound('Receipt not found.')

      if (row.status !== 'approved') {
        const allowed = request.account && (await isBoardMember(deps, request.account))
        if (!allowed) throw forbidden('This receipt is public once its expense is approved.')
      }
      const data = await deps.files.get(row.receipt.storageKey)
      if (!data) throw notFound('Receipt file not found.')
      return reply
        .header('content-type', row.receipt.mimeType)
        .header('content-disposition', `attachment; filename="${encodeURIComponent(row.receipt.fileName)}"`)
        .send(data)
    },
  )

  app.get('/expenses', async (request) => {
    await requireBoard(deps, request)
    return expenseViews()
  })

  app.post(
    '/expenses',
    {
      schema: {
        body: z.object({
          description: z.string().trim().min(1).max(500),
          receiptId: z.uuid(),
          action: signedActionSchema,
        }),
      },
    },
    async (request, reply) => {
      await requireBoard(deps, request)
      const { description, receiptId } = request.body
      const action = request.body.action as SignedAction
      if (action.kind !== 'ExpenseProposed') throw badRequest('Expected an ExpenseProposed action.')
      if (action.message.association !== association) {
        throw badRequest('The action is signed for another association.')
      }

      const [receipt] = await db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, receiptId), eq(receipts.association, association)))
      if (!receipt) throw notFound('Receipt not found.')
      if (receipt.sha256 !== action.message.receiptSha256) {
        throw badRequest('The signed receipt hash does not match the uploaded receipt.')
      }
      const [used] = await db.select().from(expenseDetails).where(eq(expenseDetails.receiptId, receiptId))
      if (used) throw conflict('This receipt is already attached to an expense.')

      await deps.relayer.submit(action)
      await db
        .insert(expenseDetails)
        .values({ expenseId: action.message.expenseId, association, description, receiptId })
      return reply.status(201).send(await expenseView(action.message.expenseId))
    },
  )

  app.post(
    '/expenses/:expenseId/votes',
    { schema: { params: z.object({ expenseId: z.string() }), body: z.object({ action: signedActionSchema }) } },
    async (request) => {
      await requireBoard(deps, request)
      const action = request.body.action as SignedAction
      if (action.kind !== 'ExpenseVoted' || action.message.expenseId !== request.params.expenseId) {
        throw badRequest('Expected an ExpenseVoted action for this expense.')
      }
      if (action.message.association !== association) {
        throw badRequest('The action is signed for another association.')
      }
      await deps.relayer.submit(action)
      return expenseView(request.params.expenseId)
    },
  )
}

export function receiptView(receipt: typeof receipts.$inferSelect) {
  return {
    id: receipt.id,
    fileName: receipt.fileName,
    mimeType: receipt.mimeType,
    sizeBytes: receipt.sizeBytes,
    sha256: receipt.sha256,
  }
}
