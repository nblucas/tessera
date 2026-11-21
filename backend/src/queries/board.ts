import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db, Tx } from '../db/client'
import { boardTerms } from '../db/schema'

// The board term in office: the latest one that has not ended.
export async function currentTerm(db: Db | Tx, association: string) {
  const [term] = await db
    .select()
    .from(boardTerms)
    .where(and(eq(boardTerms.association, association), isNull(boardTerms.endedAt)))
    .orderBy(desc(boardTerms.term))
    .limit(1)
  return term
}
