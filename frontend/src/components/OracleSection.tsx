import { useEffect, useState, type FormEvent } from 'react'
import type { Address } from 'viem'
import { api, errorMessage } from '../api/client'
import type { OracleView } from '../api/types'
import { useAuth } from '../auth/context'
import { useBoard } from '../board/context'

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

// The payment oracle is the one key trusted to report Pix payments. A board majority can
// replace it, like a handover, for example if the backend that holds it is compromised.
export function OracleSection() {
  const { user, sign } = useAuth()
  const { board } = useBoard()
  const [oracle, setOracle] = useState<OracleView | null>(null)
  const [newOracle, setNewOracle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<OracleView>('/oracle')
      .then(setOracle)
      .catch(() => setOracle(null))
  }, [])

  async function run(action: () => Promise<OracleView>) {
    setBusy(true)
    setError(null)
    try {
      setOracle(await action())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ADDRESS_PATTERN.test(newOracle.trim())) {
      setError('Enter the new oracle address (0x followed by 40 hex characters).')
      return
    }
    run(async () => {
      const action = await sign('OracleChangeProposed', {
        proposalId: crypto.randomUUID(),
        newOracle: newOracle.trim() as Address,
      })
      const next = await api.post<OracleView>('/oracle/changes', { action })
      setNewOracle('')
      return next
    })
  }

  if (!oracle) return null
  const pending = oracle.pendingChange
  const approved = pending?.approvals.some((address) => address.toLowerCase() === user?.address?.toLowerCase())

  return (
    <section className="term-card">
      <div className="term-heading">
        <p className="batch-name">Payment oracle</p>
        <p className="muted">{oracle.since ? 'Replaced by the board' : 'Set at deployment'}</p>
      </div>
      <p className="hint expense-meta">
        The only key trusted to report Pix payments: <code className="hash">{oracle.address}</code>. It
        may issue tickets, report refunds and reversals, and settle resales; it cannot vote or move
        anyone's ticket without a payment. A majority of the board can replace it.
      </p>

      {pending ? (
        <>
          <p className="hint expense-meta">
            Proposed replacement: <code className="hash">{pending.newOracle}</code> ·{' '}
            {pending.approvals.length}/{board?.majority ?? 0} approvals
          </p>
          <div className="expense-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  api.post<OracleView>(`/oracle/changes/${pending.proposalId}/cancel`, {
                    action: await sign('OracleChangeCancelled', { proposalId: pending.proposalId }),
                  }),
                )
              }
            >
              Cancel proposal
            </button>
            {!approved && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () =>
                    api.post<OracleView>(`/oracle/changes/${pending.proposalId}/approvals`, {
                      action: await sign('OracleChangeApproved', { proposalId: pending.proposalId }),
                    }),
                  )
                }
              >
                Approve replacement
              </button>
            )}
          </div>
        </>
      ) : (
        <form className="member-editor-row" onSubmit={propose} noValidate>
          <input
            placeholder="New oracle address (0x…)"
            value={newOracle}
            onChange={(event) => setNewOracle(event.target.value)}
          />
          <button type="submit" disabled={busy}>
            Propose replacement
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
