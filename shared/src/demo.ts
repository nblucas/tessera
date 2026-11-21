// Demo only. The seed directors need wallet addresses before anyone signs in, so their keys
// are derived from their e-mail and a public salt. Anyone reading this code can sign as them;
// that is acceptable for seed data and never used for accounts created later.
import { keccak256, stringToBytes, type Hex } from 'viem'

export const DEMO_SEED_DIRECTORS = [
  { name: 'Diego Ramos', email: 'diego@demo.com' },
  { name: 'Elisa Prado', email: 'elisa@demo.com' },
  { name: 'Felipe Costa', email: 'felipe@demo.com' },
] as const

export function demoPrivateKey(email: string): Hex {
  return keccak256(stringToBytes(`tessera-demo-seed-key:${email.trim().toLowerCase()}`))
}

export function isDemoSeedDirector(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  return DEMO_SEED_DIRECTORS.some((director) => director.email === normalized)
}
