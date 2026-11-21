import type { LedgerDomain } from '@tessera/shared'
import type { Hex } from 'viem'

export type Config = {
  port: number
  databaseUrl: string
  demoMode: boolean
  association: { id: string; name: string }
  ledgerDomain: LedgerDomain
  oraclePrivateKey: Hex
  relayerPrivateKey: Hex
  pixWebhookSecret: string
  filesDir: string
  cookieSecure: boolean
}

// Demo only: fixed secrets so the demo runs without setup. Never used outside DEMO_MODE.
const DEMO_ORACLE_KEY: Hex = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba'
const DEMO_RELAYER_KEY: Hex = '0x3c1f6d1b0f2a4e8d9c7b5a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f'
const DEMO_WEBHOOK_SECRET = 'tessera-demo-webhook-secret'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const demoMode = env.DEMO_MODE === 'true'
  const required = (name: string, demoDefault: string) => {
    const value = env[name] ?? (demoMode ? demoDefault : undefined)
    if (!value) throw new Error(`${name} is required outside DEMO_MODE`)
    return value
  }

  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL ?? 'postgres://tessera:tessera@localhost:54329/tessera',
    demoMode,
    association: {
      id: env.ASSOCIATION_ID ?? 'atletica-integrada',
      name: env.ASSOCIATION_NAME ?? 'Atlética Integrada',
    },
    ledgerDomain: {
      chainId: Number(env.LEDGER_CHAIN_ID ?? 31337),
      verifyingContract: (env.LEDGER_CONTRACT ??
        '0x0000000000000000000000000000000000000001') as Hex,
    },
    oraclePrivateKey: required('ORACLE_PRIVATE_KEY', DEMO_ORACLE_KEY) as Hex,
    relayerPrivateKey: required('RELAYER_PRIVATE_KEY', DEMO_RELAYER_KEY) as Hex,
    pixWebhookSecret: required('PIX_WEBHOOK_SECRET', DEMO_WEBHOOK_SECRET),
    filesDir: env.FILES_DIR ?? './data/receipts',
    cookieSecure: env.COOKIE_SECURE === 'true',
  }
}

