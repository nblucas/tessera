import { randomBytes, randomInt } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { accounts, authCodes, sessions } from '../../db/schema'
import type { Deps } from '../../deps'
import type { Api } from '../api'
import { SESSION_COOKIE, sha256 } from '../auth'
import { badRequest, tooManyRequests } from '../errors'
import { meResponse } from './me'

const CODE_TTL_MS = 10 * 60_000
const MAX_ATTEMPTS = 5
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())

const codeHash = (email: string, code: string) => sha256(`${email}:${code}`)

export function authRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id

  app.post(
    '/auth/code',
    { schema: { body: z.object({ email: emailSchema }) } },
    async (request, reply) => {
      const { email } = request.body
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await db.insert(authCodes).values({
        association,
        email,
        codeHash: codeHash(email, code),
        expiresAt: new Date(deps.now().getTime() + CODE_TTL_MS),
      })
      await deps.mailer.sendSignInCode(email, code)
      return reply.status(204).send()
    },
  )

  app.post(
    '/auth/session',
    {
      schema: {
        body: z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) }),
      },
    },
    async (request, reply) => {
      const { email, code } = request.body
      // Demo only: any 6-digit code signs in, so the demo stays one click.
      if (!config.demoMode) await useCode(email, code)

      const account = await findOrCreateAccount(email)
      const token = randomBytes(32).toString('base64url')
      const expiresAt = new Date(deps.now().getTime() + SESSION_TTL_MS)
      await db.insert(sessions).values({ id: sha256(token), accountId: account.id, expiresAt })

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/',
        expires: expiresAt,
      })
      return meResponse(deps, account)
    },
  )

  app.delete('/auth/session', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)))
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return reply.status(204).send()
  })

  async function useCode(email: string, code: string) {
    const [row] = await db
      .select()
      .from(authCodes)
      .where(
        and(
          eq(authCodes.association, association),
          eq(authCodes.email, email),
          isNull(authCodes.usedAt),
          gt(authCodes.expiresAt, deps.now()),
        ),
      )
      .orderBy(desc(authCodes.createdAt))
      .limit(1)

    if (!row) throw badRequest('This code expired or was not requested. Ask for a new one.')
    if (row.attempts >= MAX_ATTEMPTS) throw tooManyRequests('Too many attempts. Ask for a new code.')
    if (row.codeHash !== codeHash(email, code)) {
      await db
        .update(authCodes)
        .set({ attempts: sql`${authCodes.attempts} + 1` })
        .where(eq(authCodes.id, row.id))
      throw badRequest('Wrong code.')
    }
    await db.update(authCodes).set({ usedAt: deps.now() }).where(eq(authCodes.id, row.id))
  }

  async function findOrCreateAccount(email: string) {
    const [existing] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.association, association), eq(accounts.email, email)))
    if (existing) return existing
    const [created] = await db.insert(accounts).values({ association, email }).returning()
    return created
  }
}
