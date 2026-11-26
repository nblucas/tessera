import { signedActionSchema } from '@tessera/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { batches, batchNames, events, orders, tickets } from '../../db/schema'
import type { Deps } from '../../deps'
import { openOrderFilter } from '../../queries/events'
import { expectAction } from '../actions'
import type { Api } from '../api'
import { requireAccount } from '../auth'
import { notFound } from '../errors'
import { ticketView } from './orders'

// Resale: the owner signs a listing (the ledger checks ownership and the batch's resale cap),
// and a buyer pays by Pix like any other order. The oracle then settles it on the ledger.
export function resaleRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id
  const params = z.object({ ticketId: z.string().min(1).max(100) })

  async function myTicket(ticketId: string, owner: string) {
    const [row] = await db
      .select({ ticket: tickets, event: events, batch: batches, batchName: batchNames.name })
      .from(tickets)
      .innerJoin(events, and(eq(events.association, tickets.association), eq(events.id, tickets.eventId)))
      .innerJoin(
        batches,
        and(
          eq(batches.association, tickets.association),
          eq(batches.eventId, tickets.eventId),
          eq(batches.batchId, tickets.batchId),
        ),
      )
      .leftJoin(
        batchNames,
        and(
          eq(batchNames.association, tickets.association),
          eq(batchNames.eventId, tickets.eventId),
          eq(batchNames.batchId, tickets.batchId),
        ),
      )
      .where(and(eq(tickets.association, association), eq(tickets.ticketId, ticketId)))
    if (!row) throw notFound('Ticket not found.')
    return row.ticket.owner === owner ? ticketView(row.ticket, row.event, row.batch, row.batchName) : null
  }

  app.get('/resale', async (request) => {
    const account = requireAccount(request)
    const listed = await db
      .select({ ticket: tickets, event: events, batch: batches, batchName: batchNames.name })
      .from(tickets)
      .innerJoin(events, and(eq(events.association, tickets.association), eq(events.id, tickets.eventId)))
      .innerJoin(
        batches,
        and(
          eq(batches.association, tickets.association),
          eq(batches.eventId, tickets.eventId),
          eq(batches.batchId, tickets.batchId),
        ),
      )
      .leftJoin(
        batchNames,
        and(
          eq(batchNames.association, tickets.association),
          eq(batchNames.eventId, tickets.eventId),
          eq(batchNames.batchId, tickets.batchId),
        ),
      )
      .where(and(eq(tickets.association, association), eq(tickets.status, 'listed')))
      .orderBy(asc(events.date))
    const ids = listed.map((row) => row.ticket.ticketId)
    const held = ids.length
      ? await db
          .select({ listedTicketId: orders.listedTicketId })
          .from(orders)
          .where(and(inArray(orders.listedTicketId, ids), openOrderFilter(deps.now())))
      : []
    const heldIds = new Set(held.map((row) => row.listedTicketId))
    return listed
      .filter((row) => !heldIds.has(row.ticket.ticketId))
      .map(({ ticket, event, batch, batchName }) => ({
        ticketId: ticket.ticketId,
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date.toISOString(),
        color: event.color,
        batchName: batchName ?? ticket.batchId,
        faceValueCents: batch.priceCents,
        priceCents: ticket.listingPriceCents!,
        isMine: ticket.owner === account.address,
      }))
  })

  app.post(
    '/tickets/:ticketId/listing',
    { schema: { params, body: z.object({ action: signedActionSchema }) } },
    async (request) => {
      const account = requireAccount(request)
      const { ticketId } = request.params
      const action = expectAction(request.body.action, 'TicketListed', association, { ticketId })
      await deps.relayer.submit(action)
      return myTicket(ticketId, account.address ?? '')
    },
  )

  app.post(
    '/tickets/:ticketId/listing/cancel',
    { schema: { params, body: z.object({ action: signedActionSchema }) } },
    async (request) => {
      const account = requireAccount(request)
      const { ticketId } = request.params
      const action = expectAction(request.body.action, 'ListingCancelled', association, { ticketId })
      await deps.relayer.submit(action)
      return myTicket(ticketId, account.address ?? '')
    },
  )
}
