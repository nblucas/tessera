import { majorityOf, signedActionSchema } from '@tessera/shared'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { getAddress } from 'viem'
import { z } from 'zod'
import { accounts, boardTerms, handoverDrafts, handovers } from '../../db/schema'
import type { Deps } from '../../deps'
import { peopleByAddress } from '../../queries/accounts'
import { expectAction } from '../actions'
import type { Api } from '../api'
import { requireBoard } from '../auth'
import { badRequest, conflict, forbidden, notFound } from '../errors'

const memberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
})

type Draft = typeof handoverDrafts.$inferSelect

export function boardRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id

  // The handover in progress: a draft still waiting to be proposed, or a proposal open on the
  // ledger.
  async function activeDraft(): Promise<Draft | undefined> {
    const rows = await db
      .select({ draft: handoverDrafts, ledgerStatus: handovers.status })
      .from(handoverDrafts)
      .leftJoin(
        handovers,
        and(eq(handovers.association, association), eq(handovers.handoverId, sql`${handoverDrafts.id}::text`)),
      )
      .where(
        and(
          eq(handoverDrafts.association, association),
          or(eq(handoverDrafts.status, 'draft'), eq(handoverDrafts.status, 'proposed')),
        ),
      )
      .orderBy(desc(handoverDrafts.createdAt))
    const active = rows.find(
      (row) => row.draft.status === 'draft' || row.ledgerStatus === 'open',
    )
    return active?.draft
  }

  async function addressesByEmail(emails: string[]) {
    const rows = await db
      .select({ email: accounts.email, address: accounts.address })
      .from(accounts)
      .where(and(eq(accounts.association, association), inArray(accounts.email, emails)))
    return new Map(rows.map((row) => [row.email!, row.address]))
  }

  async function boardView() {
    const terms = await db
      .select()
      .from(boardTerms)
      .where(eq(boardTerms.association, association))
      .orderBy(desc(boardTerms.term))
    const draft = await activeDraft()
    const [ledgerHandover] = draft
      ? await db.select().from(handovers).where(and(eq(handovers.association, association), eq(handovers.handoverId, draft.id)))
      : []
    const [proposer] = draft
      ? await db.select().from(accounts).where(eq(accounts.id, draft.proposedBy))
      : []
    const resolved = draft ? await addressesByEmail(draft.members.map((member) => member.email)) : new Map()
    const person = await peopleByAddress(db, [
      ...terms.flatMap((term) => term.members),
      ...(ledgerHandover?.approvals ?? []),
    ])

    const [current, ...past] = terms
    const termView = (term: (typeof terms)[number]) => ({
      term: term.term,
      members: term.members.map(person),
      startedAt: term.startedAt.toISOString(),
      endedAt: term.endedAt?.toISOString() ?? null,
    })
    return {
      current: termView(current),
      past: past.map(termView),
      majority: majorityOf(current.members.length),
      handover: draft
        ? {
            id: draft.id,
            status: draft.status === 'draft' ? ('draft' as const) : ('open' as const),
            proposedBy: { address: proposer.address, name: proposer.name },
            members: draft.members.map((member) => ({
              ...member,
              address: resolved.get(member.email) ?? null,
            })),
            missing: draft.members
              .filter((member) => !resolved.get(member.email))
              .map((member) => member.email),
            approvals: (ledgerHandover?.approvals ?? []).map(person),
          }
        : null,
    }
  }

  async function draftOr404(id: string) {
    const draft = await activeDraft()
    if (!draft || draft.id !== id) throw notFound('No handover in progress with this id.')
    return draft
  }

  app.get('/board', async (request) => {
    await requireBoard(deps, request)
    return boardView()
  })

  // Starts a draft. People who never signed in get an account with their name, so the draft
  // resolves as soon as they register a wallet.
  app.post(
    '/handover',
    { schema: { body: z.object({ members: z.array(memberSchema).min(1).max(20) }) } },
    async (request, reply) => {
      const account = await requireBoard(deps, request)
      const { members } = request.body
      if (new Set(members.map((member) => member.email)).size !== members.length) {
        throw badRequest('Each director must have a different e-mail.')
      }
      if (await activeDraft()) throw conflict('A handover is already in progress.')

      await db.transaction(async (tx) => {
        for (const member of members) {
          await tx
            .insert(accounts)
            .values({ association, email: member.email, name: member.name })
            .onConflictDoNothing()
          await tx
            .update(accounts)
            .set({ name: member.name })
            .where(
              and(
                eq(accounts.association, association),
                eq(accounts.email, member.email),
                isNull(accounts.name),
              ),
            )
        }
        await tx.insert(handoverDrafts).values({ association, proposedBy: account.id, members })
      })
      return reply.status(201).send(await boardView())
    },
  )

  app.post(
    '/handover/:id/propose',
    { schema: { params: z.object({ id: z.uuid() }), body: z.object({ action: signedActionSchema }) } },
    async (request) => {
      const account = await requireBoard(deps, request)
      const draft = await draftOr404(request.params.id)
      if (draft.proposedBy !== account.id) throw forbidden('Only the proposer can submit it.')
      if (draft.status !== 'draft') throw conflict('This handover was already proposed.')

      const resolved = await addressesByEmail(draft.members.map((member) => member.email))
      const missing = draft.members.filter((member) => !resolved.get(member.email))
      if (missing.length > 0) {
        throw conflict(`Waiting for ${missing.map((member) => member.email).join(', ')} to sign in.`)
      }
      const action = expectAction(request.body.action, 'HandoverProposed', association, {
        handoverId: draft.id,
      })
      const expected = draft.members.map((member) => getAddress(resolved.get(member.email)!))
      const signed = action.message.members.map((member) => getAddress(member))
      if (signed.join() !== expected.join()) {
        throw badRequest('The signed proposal lists different directors.')
      }

      await deps.relayer.submit(action)
      await db.update(handoverDrafts).set({ status: 'proposed' }).where(eq(handoverDrafts.id, draft.id))
      return boardView()
    },
  )

  app.post(
    '/handover/:id/approvals',
    { schema: { params: z.object({ id: z.uuid() }), body: z.object({ action: signedActionSchema }) } },
    async (request) => {
      await requireBoard(deps, request)
      const draft = await draftOr404(request.params.id)
      const action = expectAction(request.body.action, 'HandoverApproved', association, {
        handoverId: draft.id,
      })
      await deps.relayer.submit(action)
      return boardView()
    },
  )

  // A draft is cancelled in the backend only; an open proposal needs the proposer's signed
  // HandoverCancelled.
  app.post(
    '/handover/:id/cancel',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({ action: signedActionSchema.optional() }),
      },
    },
    async (request) => {
      const account = await requireBoard(deps, request)
      const draft = await draftOr404(request.params.id)
      if (draft.proposedBy !== account.id) throw forbidden('Only the proposer can cancel it.')

      if (draft.status === 'proposed') {
        const action = expectAction(request.body.action, 'HandoverCancelled', association, {
          handoverId: draft.id,
        })
        await deps.relayer.submit(action)
      }
      await db.update(handoverDrafts).set({ status: 'cancelled' }).where(eq(handoverDrafts.id, draft.id))
      return boardView()
    },
  )
}
