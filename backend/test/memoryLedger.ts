import type { LedgerRecord } from '@tessera/shared'
import type { Ledger, LedgerEvent } from '../src/ledger/types'

// An event source for indexer tests: records are appended as events without any checks.
export class MemoryEventSource implements Pick<Ledger, 'readEvents'> {
  private readonly events: LedgerEvent[] = []

  append(association: string, ...records: LedgerRecord[]) {
    for (const record of records) {
      const seq = this.events.length + 1
      this.events.push({
        cursor: String(seq),
        association,
        record,
        signature: null,
        prevHash: '',
        hash: `hash-${seq}`,
        recordedAt: new Date(Date.UTC(2026, 10, 1, 0, seq)).toISOString(),
      })
    }
  }

  async readEvents(fromCursor: string | null, limit: number) {
    const after = fromCursor === null ? 0 : Number(fromCursor)
    const events = this.events.filter((event) => Number(event.cursor) > after).slice(0, limit)
    return { events, next: events.at(-1)?.cursor ?? fromCursor }
  }
}
