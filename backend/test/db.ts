import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { createDb } from '../src/db/client'
import { ADMIN_URL, TEMPLATE_DB, urlFor } from './dbUrls'

// A fresh, migrated database for one test file.
export async function createTestDb() {
  const name = `tessera_test_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DB}`)
  await admin.end()

  const url = urlFor(name)
  const { pool, db } = createDb(url)

  async function drop() {
    await pool.end()
    const client = new pg.Client({ connectionString: ADMIN_URL })
    await client.connect()
    await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await client.end()
  }

  return { url, pool, db, drop }
}
