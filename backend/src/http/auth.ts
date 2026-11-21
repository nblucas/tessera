import { createHash } from 'node:crypto'
import { includesAddress } from '@tessera/shared'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Address } from 'viem'
import type { Db } from '../db/client'
import { accounts, boardTerms, sessions } from '../db/schema'
import type { Deps } from '../deps'
import { forbidden, unauthorized } from './errors'

export const SESSION_COOKIE = 'tessera_session'

export type Account = typeof accounts.$inferSelect

declare module 'fastify' {
  interface FastifyRequest {
    account: Account | null
    rawBody?: string
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function registerAuth(app: FastifyInstance, deps: Deps) {
  app.decorateRequest('account', null)
  app.addHook('preHandler', async (request) => {
    const token = request.cookies[SESSION_COOKIE]
    if (!token) return
    const [row] = await deps.db
      .select({ account: accounts })
      .from(sessions)
      .innerJoin(accounts, eq(sessions.accountId, accounts.id))
      .where(
        and(
          eq(sessions.id, sha256(token)),
          gt(sessions.expiresAt, deps.now()),
          isNull(accounts.deletedAt),
        ),
      )
    request.account = row?.account ?? null
  })
}

export function requireAccount(request: FastifyRequest): Account {
  if (!request.account) throw unauthorized()
  return request.account
}

export async function currentBoardMembers(db: Db, association: string): Promise<Address[]> {
  const [term] = await db
    .select({ members: boardTerms.members })
    .from(boardTerms)
    .where(and(eq(boardTerms.association, association), isNull(boardTerms.endedAt)))
    .orderBy(desc(boardTerms.term))
    .limit(1)
  return term?.members ?? []
}

export async function isBoardMember(deps: Deps, account: Account): Promise<boolean> {
  if (!account.address) return false
  const members = await currentBoardMembers(deps.db, deps.config.association.id)
  return includesAddress(members, account.address as Address)
}

// The API checks board membership early for a friendly error; the ledger enforces it anyway.
export async function requireBoard(
  deps: Deps,
  request: FastifyRequest,
): Promise<Account & { address: Address }> {
  const account = requireAccount(request)
  if (!(await isBoardMember(deps, account))) throw forbidden('Board only.')
  return account as Account & { address: Address }
}
