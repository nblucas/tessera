import { signedActionSchema } from '@tessera/shared'
import { z } from 'zod'
import type { Deps } from '../../deps'
import { reconcile } from '../../queries/payments'
import { expectAction } from '../actions'
import type { Api } from '../api'
import { requireBoard } from '../auth'

// Who reports off-chain payments, what they reported, and how the board replaces them.
export function oracleRoutes(app: Api, deps: Deps) {
  const { db, config } = deps
  const association = config.association.id
  const actionBody = z.object({ action: signedActionSchema })
  const proposal = z.object({ proposalId: z.string().min(1).max(100) })

  app.get('/reconciliation', async () => reconcile(db, association, deps.oracle.address, deps.now()))

  app.get('/oracle', async () => (await reconcile(db, association, deps.oracle.address, deps.now())).oracle)

  app.post('/oracle/changes', { schema: { body: actionBody } }, async (request) => {
    await requireBoard(deps, request)
    await deps.relayer.submit(expectAction(request.body.action, 'OracleChangeProposed', association))
    return (await reconcile(db, association, deps.oracle.address, deps.now())).oracle
  })

  app.post(
    '/oracle/changes/:proposalId/approvals',
    { schema: { params: proposal, body: actionBody } },
    async (request) => {
      await requireBoard(deps, request)
      const action = expectAction(request.body.action, 'OracleChangeApproved', association, {
        proposalId: request.params.proposalId,
      })
      await deps.relayer.submit(action)
      return (await reconcile(db, association, deps.oracle.address, deps.now())).oracle
    },
  )

  app.post(
    '/oracle/changes/:proposalId/cancel',
    { schema: { params: proposal, body: actionBody } },
    async (request) => {
      await requireBoard(deps, request)
      const action = expectAction(request.body.action, 'OracleChangeCancelled', association, {
        proposalId: request.params.proposalId,
      })
      await deps.relayer.submit(action)
      return (await reconcile(db, association, deps.oracle.address, deps.now())).oracle
    },
  )
}
