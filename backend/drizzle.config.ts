import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  schemaFilter: ['app', 'ledger', 'read'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://tessera:tessera@localhost:54329/tessera',
  },
})
