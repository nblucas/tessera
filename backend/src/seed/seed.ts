import { DEMO_SEED_DIRECTORS, demoPrivateKey, type GenesisRecord } from '@tessera/shared'
import { privateKeyToAccount } from 'viem/accounts'
import { accounts, associations, batchNames, events } from '../db/schema'
import type { Deps } from '../deps'
import { SEED_EVENTS } from './data'

// Writes the demo association: storefront data, the seed directors' accounts and the genesis
// records (board, batches and the past sales from before the app existed).
export async function seed(deps: Pick<Deps, 'config' | 'db' | 'genesis' | 'indexer'>) {
  const { config, db } = deps
  const association = config.association.id

  const directors = DEMO_SEED_DIRECTORS.map((director) => ({
    ...director,
    address: privateKeyToAccount(demoPrivateKey(director.email)).address,
  }))

  await db.transaction(async (tx) => {
    await tx.insert(associations).values({ id: association, name: config.association.name })
    await tx.insert(accounts).values(
      directors.map((director) => ({
        association,
        email: director.email,
        name: director.name,
        address: director.address,
      })),
    )
    for (const event of SEED_EVENTS) {
      await tx.insert(events).values({
        id: event.id,
        association,
        title: event.title,
        description: event.description,
        date: new Date(event.date),
        location: event.location,
        color: event.color,
      })
      await tx.insert(batchNames).values(
        event.batches.map((batch) => ({
          association,
          eventId: event.id,
          batchId: batch.id,
          name: batch.name,
        })),
      )
    }
  })

  const records: GenesisRecord[] = [
    { kind: 'BoardSet', actor: null, members: directors.map((director) => director.address) },
  ]
  for (const event of SEED_EVENTS) {
    for (const batch of event.batches) {
      records.push({
        kind: 'BatchCreated',
        actor: null,
        eventId: event.id,
        batchId: batch.id,
        priceCents: batch.priceCents,
        quantity: batch.quantity,
      })
      if (batch.sold > 0) {
        records.push({
          kind: 'OpeningSalesRecorded',
          actor: null,
          eventId: event.id,
          batchId: batch.id,
          count: batch.sold,
          amountCents: batch.sold * batch.priceCents,
        })
      }
    }
  }
  await deps.genesis.writeGenesis(association, records)
  await deps.indexer.catchUp()
}
