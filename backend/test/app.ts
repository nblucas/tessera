import {
  demoPrivateKey,
  isDemoSeedDirector,
  type SignedAction,
  type SignedKind,
} from '@tessera/shared'
import type { LightMyRequestResponse } from 'fastify'
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalFileStore } from '../src/adapters/fileStore'
import type { Mailer } from '../src/adapters/mailer'
import { FakePixProvider } from '../src/adapters/pix'
import { buildApp } from '../src/app'
import type { Config } from '../src/config'
import type { Deps } from '../src/deps'
import { Indexer } from '../src/indexer/indexer'
import { InlineJobs } from '../src/jobs'
import { FakeLedger } from '../src/ledger/fakeLedger'
import { registerOracle } from '../src/oracle'
import { Relayer } from '../src/relayer'
import { seed } from '../src/seed/seed'
import { createTestDb } from './db'
import { signAction, TEST_DOMAIN } from './sign'

export class MemoryMailer implements Mailer {
  readonly sent: { email: string; code: string }[] = []

  async sendSignInCode(email: string, code: string) {
    this.sent.push({ email, code })
  }

  lastCodeFor(email: string): string {
    const found = this.sent.findLast((item) => item.email === email)
    if (!found) throw new Error(`no code sent to ${email}`)
    return found.code
  }
}

export const ASSOCIATION = 'atletica-integrada'

export type TestApp = Awaited<ReturnType<typeof createTestApp>>

// A seeded app on its own database, with fakes for every outside service.
export async function createTestApp(overrides: Partial<Config> = {}) {
  const testDb = await createTestDb()
  const clock = { now: new Date() }
  const now = () => clock.now
  const oracle = privateKeyToAccount(generatePrivateKey())
  const relayerKey = privateKeyToAccount(generatePrivateKey())
  const config: Config = {
    port: 0,
    databaseUrl: testDb.url,
    demoMode: false,
    association: { id: ASSOCIATION, name: 'Atlética Integrada' },
    ledgerDomain: TEST_DOMAIN,
    ledgerRpcUrl: null,
    oraclePrivateKey: generatePrivateKey(),
    relayerPrivateKey: generatePrivateKey(),
    pixWebhookSecret: 'test-webhook-secret',
    filesDir: await mkdtemp(join(tmpdir(), 'tessera-files-')),
    cookieSecure: false,
    ...overrides,
  }
  const mailer = new MemoryMailer()
  const pix = new FakePixProvider(config.pixWebhookSecret)
  const jobs = new InlineJobs()
  const ledger = new FakeLedger(testDb.db, {
    domain: config.ledgerDomain,
    oracle: oracle.address,
    relayer: relayerKey.address,
    now,
  })
  const indexer = new Indexer(testDb.db, ledger)
  const deps: Deps = {
    config,
    db: testDb.db,
    ledger,
    genesis: ledger,
    indexer,
    relayer: new Relayer(relayerKey, ledger, indexer),
    mailer,
    pix,
    files: new LocalFileStore(config.filesDir),
    jobs,
    oracle,
    now,
  }
  await seed(deps)
  await registerOracle(deps)
  const app = buildApp(deps)
  await app.ready()

  const wallets = new Map<string, PrivateKeyAccount>()

  function walletFor(email: string): PrivateKeyAccount {
    let wallet = wallets.get(email)
    if (!wallet) {
      const key = isDemoSeedDirector(email) ? demoPrivateKey(email) : generatePrivateKey()
      wallet = privateKeyToAccount(key)
      wallets.set(email, wallet)
    }
    return wallet
  }

  // A signed-in user with helpers to call the API and sign ledger actions.
  async function signIn(email: string) {
    await app.inject({ method: 'POST', url: '/auth/code', payload: { email } })
    const response = await app.inject({
      method: 'POST',
      url: '/auth/session',
      payload: { email, code: mailer.lastCodeFor(email) },
    })
    if (response.statusCode !== 200) throw new Error(`sign-in failed: ${response.body}`)
    const cookie = response.cookies.find((item) => item.name === 'tessera_session')!
    const cookieHeader = `${cookie.name}=${cookie.value}`

    const request = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
      app.inject({ method, url, payload: payload as object, headers: { cookie: cookieHeader } })

    const user = {
      email,
      cookie: cookieHeader,
      wallet: walletFor(email),
      get: (url: string) => request('GET', url),
      post: (url: string, payload?: unknown) => request('POST', url, payload ?? {}),
      patch: (url: string, payload?: unknown) => request('PATCH', url, payload ?? {}),
      delete: (url: string) => request('DELETE', url),
      async registerAddress() {
        const { challenge } = (await user.post('/me/address/challenge')).json()
        const signature = await user.wallet.signMessage({ message: challenge })
        return user.post('/me/address', { address: user.wallet.address, signature })
      },
      async sign<K extends SignedKind>(
        kind: K,
        fields: Parameters<typeof signAction<K>>[2],
      ): Promise<SignedAction<K>> {
        const nonce = await ledger.nextNonce(user.wallet.address)
        return signAction(user.wallet, kind, fields, {
          nonce,
          association: ASSOCIATION,
          domain: config.ledgerDomain,
        })
      },
    }
    return user
  }

  // Delivers the webhook the payment provider would send once the order is paid.
  async function pay(order: { txid: string; priceCents: number }) {
    const webhook = pix.simulatePayment(order.txid, order.priceCents)
    return app.inject({ method: 'POST', url: '/webhooks/pix', headers: webhook.headers, payload: webhook.payload })
  }

  return {
    app,
    deps,
    mailer,
    pix,
    jobs,
    pay,
    clock,
    ledger,
    signIn,
    walletFor,
    async close() {
      await app.close()
      await testDb.drop()
    },
  }
}

export function body<T = Record<string, unknown>>(response: LightMyRequestResponse): T {
  return response.json() as T
}
