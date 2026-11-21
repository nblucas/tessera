// Demo wallet storage: one private key per e-mail in IndexedDB. Clearing the browser data
// loses the key (see BACKEND.md, "Identity and signing").
import { demoPrivateKey, isDemoSeedDirector } from '@tessera/shared'
import type { Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

const DB_NAME = 'tessera-wallet'
const STORE = 'keys'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      }),
  )
}

// The seed directors' keys are fixed (demo only); everyone else gets a random key on first use.
export async function loadOrCreateKey(email: string): Promise<Hex> {
  if (isDemoSeedDirector(email)) return demoPrivateKey(email)
  const stored = await run<Hex | undefined>('readonly', (store) => store.get(email))
  if (stored) return stored
  const key = generatePrivateKey()
  await run('readwrite', (store) => store.put(key, email))
  return key
}
