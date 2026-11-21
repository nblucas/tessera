import { inArray } from 'drizzle-orm'
import type { Address } from 'viem'
import type { Db } from '../db/client'
import { accounts } from '../db/schema'

export type Person = { address: Address; name: string | null }

// Names for ledger addresses. A deleted account keeps only its address.
export async function peopleByAddress(db: Db, addresses: Address[]): Promise<(address: Address) => Person> {
  const unique = [...new Set(addresses)]
  const rows = unique.length
    ? await db.select({ address: accounts.address, name: accounts.name }).from(accounts).where(inArray(accounts.address, unique))
    : []
  const names = new Map(rows.map((row) => [row.address, row.name]))
  return (address) => ({ address, name: names.get(address) ?? null })
}
