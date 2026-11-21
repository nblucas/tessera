import { randomBytes } from 'node:crypto'
import { signedActionSchema, type SignedAction } from '@tessera/shared'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { batchNames, events } from '../../db/schema'
import type { Deps } from '../../deps'
import { findEvent, listEvents } from '../../queries/events'
import type { Api } from '../api'
import { requireAccount, requireBoard } from '../auth'
import { badRequest, notFound } from '../errors'

const BATCH_KINDS = new Set(['BatchCreated', 'BatchUpdated', 'BatchRemoved'])

const detailsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000),
  date: z.iso.datetime({ offset: true }),
  location: z.string().trim().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

const batchChangesSchema = z.object({
  changes: z
    .array(
      z.object({
        batchId: z.string().min(1).max(100),
        name: z.string().trim().min(1).max(100).optional(),
        action: signedActionSchema.optional(),
      }),
    )
    .min(1),
})

function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'event'}-${randomBytes(2).toString('hex')}`
}

export function eventRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id

  async function eventOr404(eventId: string) {
    const event = await findEvent(db, association, deps.now(), eventId)
    if (!event) throw notFound('Event not found.')
    return event
  }

  app.get('/events', async (request) => {
    requireAccount(request)
    return listEvents(db, association, deps.now())
  })

  app.get(
    '/events/:eventId',
    { schema: { params: z.object({ eventId: z.string() }) } },
    async (request) => {
      requireAccount(request)
      return eventOr404(request.params.eventId)
    },
  )

  app.post('/events', { schema: { body: detailsSchema } }, async (request, reply) => {
    await requireBoard(deps, request)
    const { title, description, date, location, color } = request.body
    const id = slugify(title)
    await db
      .insert(events)
      .values({ id, association, title, description, date: new Date(date), location, color })
    return reply.status(201).send(await eventOr404(id))
  })

  app.patch(
    '/events/:eventId',
    { schema: { params: z.object({ eventId: z.string() }), body: detailsSchema.partial() } },
    async (request) => {
      await requireBoard(deps, request)
      const { eventId } = request.params
      await eventOr404(eventId)
      const { date, ...rest } = request.body
      const changes = { ...rest, ...(date ? { date: new Date(date) } : {}) }
      if (Object.keys(changes).length > 0) {
        await db
          .update(events)
          .set(changes)
          .where(and(eq(events.association, association), eq(events.id, eventId)))
      }
      return eventOr404(eventId)
    },
  )

  // Applies batch changes in order: signed ledger actions (create, update, remove) and name
  // changes, which are storefront data and allowed even after sales.
  app.post(
    '/events/:eventId/batches',
    { schema: { params: z.object({ eventId: z.string() }), body: batchChangesSchema } },
    async (request) => {
      await requireBoard(deps, request)
      const { eventId } = request.params
      await eventOr404(eventId)

      for (const [index, change] of request.body.changes.entries()) {
        const action = change.action as SignedAction | undefined
        if (action) {
          if (!BATCH_KINDS.has(action.kind)) {
            throw badRequest(`Change ${index + 1}: only batch actions are allowed here.`)
          }
          const message = action.message as { eventId: string; batchId: string; association: string }
          if (message.eventId !== eventId || message.batchId !== change.batchId) {
            throw badRequest(`Change ${index + 1}: the action is signed for another batch.`)
          }
          if (message.association !== association) {
            throw badRequest(`Change ${index + 1}: the action is signed for another association.`)
          }
          if (action.kind === 'BatchCreated' && !change.name) {
            throw badRequest(`Change ${index + 1}: a new batch needs a name.`)
          }
          await deps.relayer.submit(action)
        } else if (!change.name) {
          throw badRequest(`Change ${index + 1}: nothing to change.`)
        }

        if (change.name) {
          await db
            .insert(batchNames)
            .values({ association, eventId, batchId: change.batchId, name: change.name })
            .onConflictDoUpdate({
              target: [batchNames.association, batchNames.eventId, batchNames.batchId],
              set: { name: change.name },
            })
        }
      }
      return eventOr404(eventId)
    },
  )
}
