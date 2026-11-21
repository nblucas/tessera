import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString })
  const db = drizzle(pool, { schema })
  return { pool, db }
}

export type Db = ReturnType<typeof createDb>['db']
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
