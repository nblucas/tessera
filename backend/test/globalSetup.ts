import pg from 'pg'
import { runMigrations } from '../src/db/migrate'
import { ADMIN_URL, TEMPLATE_DB, urlFor } from './dbUrls'

// Builds a migrated template database once; each test file then copies it.
export default async function setup() {
  const admin = new pg.Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`)
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`)
  await admin.end()
  await runMigrations(urlFor(TEMPLATE_DB))
}
