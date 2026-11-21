// Deploys TesseraLedger for the backend. The genesis is left empty on purpose: the backend's
// relayer is the genesis authority, and the backend seed writes the board and batches through
// its ledger adapter when it starts with an empty database.
import { deployLedger, printBackendSettings } from "./deploy-common.js";

const { ledger, chainId } = await deployLedger({ genesisAuthority: "relayer" });

console.log("\nGenesis is empty. Start the backend with an empty database so its seed writes it.");
printBackendSettings(chainId, ledger.address);
