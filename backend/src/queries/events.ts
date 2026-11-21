import { and, asc, count, eq, gt, inArray, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import { batches, batchNames, events, orders } from '../db/schema'

export type BatchView = {
  id: string
  name: string
  priceCents: number
  quantity: number
  sold: number
  available: number
}

export type EventView = {
  id: string
  title: string
  description: string
  date: string
  location: string
  color: string
  batches: BatchView[]
}

// Open orders hold a ticket each: paid but not issued yet, or waiting for payment and not
// expired.
export function openOrderFilter(now: Date) {
  return or(eq(orders.status, 'paid'), and(eq(orders.status, 'pending_payment'), gt(orders.expiresAt, now)))
}

export async function listEvents(
  db: Db,
  association: string,
  now: Date,
  eventIds?: string[],
): Promise<EventView[]> {
  const eventRows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.association, association),
        eventIds ? inArray(events.id, eventIds) : undefined,
      ),
    )
    .orderBy(asc(events.date))
  if (eventRows.length === 0) return []
  const ids = eventRows.map((event) => event.id)

  const [batchRows, nameRows, holdRows] = await Promise.all([
    db
      .select()
      .from(batches)
      .where(
        and(
          eq(batches.association, association),
          inArray(batches.eventId, ids),
          eq(batches.removed, false),
        ),
      )
      .orderBy(asc(batches.createdAt), asc(batches.batchId)),
    db
      .select()
      .from(batchNames)
      .where(and(eq(batchNames.association, association), inArray(batchNames.eventId, ids))),
    db
      .select({ eventId: orders.eventId, batchId: orders.batchId, held: count() })
      .from(orders)
      .where(and(inArray(orders.eventId, ids), openOrderFilter(now)))
      .groupBy(orders.eventId, orders.batchId),
  ])

  const key = (eventId: string, batchId: string) => `${eventId}/${batchId}`
  const names = new Map(nameRows.map((row) => [key(row.eventId, row.batchId), row.name]))
  const holds = new Map(holdRows.map((row) => [key(row.eventId, row.batchId), row.held]))

  return eventRows.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    date: event.date.toISOString(),
    location: event.location,
    color: event.color,
    batches: batchRows
      .filter((batch) => batch.eventId === event.id)
      .map((batch) => {
        const held = holds.get(key(batch.eventId, batch.batchId)) ?? 0
        return {
          id: batch.batchId,
          name: names.get(key(batch.eventId, batch.batchId)) ?? batch.batchId,
          priceCents: batch.priceCents,
          quantity: batch.quantity,
          sold: batch.sold,
          available: Math.max(0, batch.quantity - batch.sold - held),
        }
      }),
  }))
}

export async function findEvent(db: Db, association: string, now: Date, eventId: string) {
  const [event] = await listEvents(db, association, now, [eventId])
  return event
}
