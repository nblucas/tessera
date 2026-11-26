import { describe, expect, it } from 'vitest'
import { applyRecord, checkRecord, currentOracle, EMPTY_STATE, type LedgerState } from './rules'
import { ORACLE, RULE_EXAMPLES } from './rules.examples'

function run(state: LedgerState, record: Parameters<typeof checkRecord>[1]) {
  const error = checkRecord(state, record, { oracle: ORACLE })
  if (error) throw new Error(`given record rejected: ${error}`)
  return applyRecord(state, record)
}

describe('ledger rules', () => {
  for (const example of RULE_EXAMPLES) {
    it(example.name, () => {
      const state = example.given.reduce(run, EMPTY_STATE)
      const error = checkRecord(state, example.when, { oracle: ORACLE })

      if ('rejected' in example.then) {
        expect(error).toContain(example.then.rejected)
        return
      }

      expect(error).toBeNull()
      const next = applyRecord(state, example.when)
      const expected = example.then.accepted
      if (expected.board) expect(next.board).toEqual(expected.board)
      if (expected.term !== undefined) expect(next.term).toBe(expected.term)
      if (expected.handoverOpen !== undefined) {
        expect(next.handover !== null).toBe(expected.handoverOpen)
      }
      for (const [id, status] of Object.entries(expected.expenseStatus ?? {})) {
        expect(next.expenses[id]?.status).toBe(status)
      }
      for (const [key, sold] of Object.entries(expected.sold ?? {})) {
        expect(next.batches[key]?.sold).toBe(sold)
      }
      for (const [id, status] of Object.entries(expected.ticketStatus ?? {})) {
        expect(next.tickets[id]?.status).toBe(status)
      }
      for (const [id, owner] of Object.entries(expected.ticketOwner ?? {})) {
        expect(next.tickets[id]?.owner).toBe(owner)
      }
      if (expected.oracle) expect(currentOracle(next, { oracle: ORACLE })).toBe(expected.oracle)
    })
  }
})
