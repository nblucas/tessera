// Demo only. The same genesis the backend seed writes to its fake ledger, so the contract
// starts in the state the backend expects. Every key here is public: never use them on a
// real network.
import { keccak256, stringToBytes, type Hex } from "viem";

export const ASSOCIATION = "atletica-integrada";

// From backend/src/config.ts (DEMO_ORACLE_KEY and DEMO_RELAYER_KEY).
export const DEMO_ORACLE_KEY: Hex = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
export const DEMO_RELAYER_KEY: Hex = "0x3c1f6d1b0f2a4e8d9c7b5a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f";

// From shared/src/demo.ts: the seed directors' keys come from their e-mail and a public salt.
export const DEMO_DIRECTORS = [
  { name: "Diego Ramos", email: "diego@demo.com" },
  { name: "Elisa Prado", email: "elisa@demo.com" },
  { name: "Felipe Costa", email: "felipe@demo.com" },
] as const;

export function demoPrivateKey(email: string): Hex {
  return keccak256(stringToBytes(`tessera-demo-seed-key:${email.trim().toLowerCase()}`));
}

// From backend/src/seed/data.ts: price, quantity and the sales made before the app existed.
export const SEED_BATCHES = [
  { eventId: "end-of-year-party", batchId: "b1", priceCents: 4000n, quantity: 200n, sold: 200n },
  { eventId: "end-of-year-party", batchId: "b2", priceCents: 5500n, quantity: 300n, sold: 214n },
  { eventId: "end-of-year-party", batchId: "b3", priceCents: 7000n, quantity: 200n, sold: 0n },
  { eventId: "freshers-welcome", batchId: "b1", priceCents: 2500n, quantity: 150n, sold: 32n },
  { eventId: "freshers-welcome", batchId: "b2", priceCents: 5000n, quantity: 350n, sold: 41n },
  { eventId: "interuniversity-games", batchId: "b1", priceCents: 18000n, quantity: 400n, sold: 97n },
  { eventId: "interuniversity-games", batchId: "b2", priceCents: 7000n, quantity: 300n, sold: 12n },
  { eventId: "halloween-night", batchId: "b1", priceCents: 3500n, quantity: 250n, sold: 250n },
] as const;

// Where deploy.ts saves the contract address for demo.ts.
export const DEPLOYMENT_FILE = "deployments/localhost.json";
