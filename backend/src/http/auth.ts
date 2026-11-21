import { includesAddress } from '@tessera/shared'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Address } from 'viem'
import type { Db } from '../db/client'
import { accounts, sessions } from '../db/schema'
import { sha256Hex } from '../crypto'
import type { Deps } from '../deps'
import { currentTerm } from '../queries/board'
import { forbidden, unauthorized } from './errors'

export const SESSION_COOKIE = 'tessera_session'

export type Account = typeof accounts.$inferSelect

declare module 'fastify' {
  interface FastifyRequest {
    account: Account | null
    rawBody?: string
  }
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
          eq(sessions.id, sha256Hex(token)),
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
  return (await currentTerm(db, association))?.members ?? []
}

export async function isBoardMember(deps: Deps, account: Account): Promise<boolean> {
  if (!account.address) return false
  const members = await currentBoardMembers(deps.db, deps.config.association.id)
  return includesAddress(members, account.address)
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
