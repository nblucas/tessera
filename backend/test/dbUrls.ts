export const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://tessera:tessera@localhost:54329/tessera'
export const TEMPLATE_DB = 'tessera_test_template'

export function urlFor(database: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  return url.toString()
}
