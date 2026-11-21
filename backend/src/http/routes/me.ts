import { randomBytes } from 'node:crypto'
import { addressSchema } from '@tessera/shared'
import { and, eq, gt, inArray, or, sql } from 'drizzle-orm'
import { getAddress, verifyMessage } from 'viem'
import { z } from 'zod'
import { accounts, addressChallenges, authCodes, orders, sessions } from '../../db/schema'
import type { Deps } from '../../deps'
import type { Api } from '../api'
import { isBoardMember, requireAccount, SESSION_COOKIE, type Account } from '../auth'
import { badRequest, conflict } from '../errors'

const CHALLENGE_TTL_MS = 10 * 60_000

export async function meResponse(deps: Deps, account: Account) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    address: account.address,
    isBoardMember: await isBoardMember(deps, account),
  }
}

export function meRoutes(app: Api, deps: Deps) {
  const { db } = deps

  app.get('/me', async (request) => meResponse(deps, requireAccount(request)))

  app.post('/me/address/challenge', async (request) => {
    const account = requireAccount(request)
    const challenge = [
      'Register this wallet with Tessera.',
      `Account: ${account.id}`,
      `Nonce: ${randomBytes(16).toString('hex')}`,
    ].join('\n')
    const expiresAt = new Date(deps.now().getTime() + CHALLENGE_TTL_MS)
    await db
      .insert(addressChallenges)
      .values({ accountId: account.id, challenge, expiresAt })
      .onConflictDoUpdate({ target: addressChallenges.accountId, set: { challenge, expiresAt } })
    return { challenge }
  })

  app.post(
    '/me/address',
    {
      schema: {
        body: z.object({
          address: addressSchema,
          signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
        }),
      },
    },
    async (request) => {
      const account = requireAccount(request)
      if (account.address) throw conflict('This account already has a wallet address.')

      const [row] = await db
        .select()
        .from(addressChallenges)
        .where(
          and(
            eq(addressChallenges.accountId, account.id),
            gt(addressChallenges.expiresAt, deps.now()),
          ),
        )
      if (!row) throw badRequest('Ask for a new challenge first.')

      const valid = await verifyMessage({
        address: request.body.address,
        message: row.challenge,
        signature: request.body.signature as `0x${string}`,
      }).catch(() => false)
      if (!valid) throw badRequest('The signature does not match this address.')

      const address = getAddress(request.body.address)
      const [taken] = await db.select().from(accounts).where(eq(accounts.address, address))
      if (taken) throw conflict('This wallet address belongs to another account.')

      const [updated] = await db
        .update(accounts)
        .set({ address })
        .where(eq(accounts.id, account.id))
        .returning()
      await db.delete(addressChallenges).where(eq(addressChallenges.accountId, account.id))
      return meResponse(deps, updated)
    },
  )

  app.get('/me/nonce', async (request) => {
    const account = requireAccount(request)
    if (!account.address) throw badRequest('Register a wallet address first.')
    return { nonce: await deps.ledger.nextNonce(account.address as `0x${string}`) }
  })

  // Erases the person ↔ account link. The address stays, so the ledger history becomes
  // pseudonymous.
  app.delete('/me', async (request, reply) => {
    const account = requireAccount(request)
    if (await isBoardMember(deps, account)) {
      throw conflict('Directors cannot delete their data while in office.')
    }
    const [open] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.accountId, account.id),
          or(
            eq(orders.status, 'paid'),
            and(eq(orders.status, 'pending_payment'), gt(orders.expiresAt, deps.now())),
          ),
        ),
      )
      .limit(1)
    if (open) throw conflict('Wait until your order in progress finishes.')

    await db.transaction(async (tx) => {
      if (account.email) {
        await tx
          .delete(authCodes)
          .where(and(eq(authCodes.association, account.association), eq(authCodes.email, account.email)))
      }
      await tx.delete(sessions).where(eq(sessions.accountId, account.id))
      await tx
        .update(accounts)
        .set({ email: null, name: null, deletedAt: sql`now()` })
        .where(inArray(accounts.id, [account.id]))
    })
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })
}
