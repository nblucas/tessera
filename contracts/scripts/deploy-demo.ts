// Deploys TesseraLedger for the contracts-only demo (demo.ts), without the backend. The
// deployer is the genesis authority and writes the same genesis as the backend seed.
import { privateKeyToAccount } from "viem/accounts";
import { deployLedger, printBackendSettings } from "./deploy-common.js";
import { DEMO_DIRECTORS, SEED_BATCHES, demoPrivateKey } from "./demo-data.js";

const { ledger, send, chainId } = await deployLedger({ genesisAuthority: "deployer" });

const directors = DEMO_DIRECTORS.map((director) => ({
  ...director,
  address: privateKeyToAccount(demoPrivateKey(director.email)).address,
}));

console.log("\nGenesis");
await send(await ledger.write.setBoard([directors.map((director) => director.address)]));
for (const director of directors) console.log(`  director ${director.name}: ${director.address}`);

for (const batch of SEED_BATCHES) {
  await send(
    await ledger.write.createGenesisBatch([batch.eventId, batch.batchId, batch.priceCents, batch.quantity, batch.resaleCapPercent]),
  );
  if (batch.sold > 0n) {
    await send(
      await ledger.write.recordOpeningSales([
        batch.eventId,
        batch.batchId,
        batch.sold,
        batch.sold * batch.priceCents,
      ]),
    );
  }
  console.log(`  batch ${batch.eventId}/${batch.batchId}: ${batch.sold}/${batch.quantity} sold`);
}

printBackendSettings(chainId, ledger.address);
console.log("This deployment already has a genesis, so the backend seed cannot write one. Use it with demo:local only.");
