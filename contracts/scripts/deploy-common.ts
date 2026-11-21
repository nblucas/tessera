// Shared by deploy.ts and deploy-demo.ts.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { network } from "hardhat";
import { parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ASSOCIATION, DEMO_ORACLE_KEY, DEMO_RELAYER_KEY, DEPLOYMENT_FILE } from "./demo-data.js";

// Enough test ETH for the backend's relayer to pay gas for a long demo.
const RELAYER_FUNDING = parseEther("100");

export const oracleAddress = privateKeyToAccount(DEMO_ORACLE_KEY).address;
export const relayerAddress = privateKeyToAccount(DEMO_RELAYER_KEY).address;

export async function deployLedger({ genesisAuthority }: { genesisAuthority: "deployer" | "relayer" }) {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  const send = async (hash: Hex) => {
    await publicClient.waitForTransactionReceipt({ hash });
  };

  const genesis: Address = genesisAuthority === "deployer" ? deployer.account.address : relayerAddress;

  console.log(`Deploying TesseraLedger from ${deployer.account.address}`);
  const ledger = await viem.deployContract("TesseraLedger", [ASSOCIATION, oracleAddress, genesis]);
  console.log(`  contract:          ${ledger.address}`);
  console.log(`  association:       ${ASSOCIATION}`);
  console.log(`  oracle:            ${oracleAddress}`);
  console.log(`  genesis authority: ${genesis} (${genesisAuthority})`);

  // The backend's relayer key is not one of the accounts Hardhat funds, so it starts with
  // no ETH and could not pay for any transaction.
  await send(await deployer.sendTransaction({ to: relayerAddress, value: RELAYER_FUNDING }));
  console.log(`  relayer:           ${relayerAddress} (funded with 100 test ETH)`);

  const chainId = await publicClient.getChainId();
  await mkdir(dirname(DEPLOYMENT_FILE), { recursive: true });
  await writeFile(
    DEPLOYMENT_FILE,
    JSON.stringify(
      { chainId, address: ledger.address, association: ASSOCIATION, oracle: oracleAddress, relayer: relayerAddress, genesisAuthority: genesis },
      null,
      2,
    ),
  );

  return { ledger, send, chainId };
}

export function printBackendSettings(chainId: number, address: Address) {
  console.log(`\nSaved to ${DEPLOYMENT_FILE}. Backend settings for this deployment:`);
  console.log(`  LEDGER_CHAIN_ID=${chainId}`);
  console.log(`  LEDGER_CONTRACT=${address}`);
}
