import { ledgerDomain } from '@tessera/shared'
import { z } from 'zod'
import type { Deps } from '../../deps'
import { openAccounts } from '../../queries/openAccounts'
import { resetDemo } from '../../seed/reset'
import type { Api } from '../api'
import { notFound } from '../errors'

export function publicRoutes(app: Api, deps: Deps) {
  const { config } = deps

  app.get('/config', async () => ({ demoMode: config.demoMode, association: config.association }))

  app.get('/accounts', async () => openAccounts(deps.db, config.association.id))

  // The raw ledger, so anyone can rebuild the open accounts without trusting the indexer.
  app.get(
    '/ledger/events',
    {
      schema: {
        querystring: z.object({
          cursor: z.string().regex(/^\d+(?::\d+)?$/).optional(),
          limit: z.coerce.number().int().min(1).max(500).default(100),
        }),
      },
    },
    async (request) => deps.ledger.readEvents(request.query.cursor ?? null, request.query.limit),
  )

  app.get('/ledger/domain', async () => ({
    ...ledgerDomain(config.ledgerDomain),
    association: config.association.id,
  }))

  app.post('/demo/reset', async (_request, reply) => {
    if (!config.demoMode) throw notFound()
    await resetDemo(deps)
    return reply.status(204).send()
  })
}
