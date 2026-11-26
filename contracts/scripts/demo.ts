// Uses the deployed contract the way the app and the backend do: people sign in their own
// "browser" (a local key), and the relayer (Hardhat account 0) sends the transactions.
// Run deploy-demo.ts first.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { network } from "hardhat";
import { BaseError, ContractFunctionRevertedError, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { ledgerDomain, types, type ActionKind } from "../lib/eip712.js";
import { ASSOCIATION, DEMO_ORACLE_KEY, DEPLOYMENT_FILE, demoPrivateKey } from "./demo-data.js";

const deployment = JSON.parse(await readFile(DEPLOYMENT_FILE, "utf8")) as { chainId: number; address: Address };

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [relayer, student] = await viem.getWalletClients();
const ledger = await viem.getContractAt("TesseraLedger", deployment.address);
const domain = ledgerDomain(deployment.chainId, deployment.address);

const diego = privateKeyToAccount(demoPrivateKey("diego@demo.com"));
const elisa = privateKeyToAccount(demoPrivateKey("elisa@demo.com"));
const oracle = privateKeyToAccount(DEMO_ORACLE_KEY);

// What the app does in the browser: fill in the envelope and sign the typed message.
async function sign(kind: ActionKind, signer: PrivateKeyAccount, fields: Record<string, unknown>) {
  const message = {
    actor: signer.address,
    nonce: await ledger.read.nonces([signer.address]),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    association: ASSOCIATION,
    ...fields,
  };
  const signature = await signer.signTypedData({
    domain,
    types: { [kind]: types[kind] },
    primaryType: kind,
    message,
  } as any);
  return [message, signature] as [any, Hex];
}

async function step(title: string, send: () => Promise<Hex>) {
  try {
    const hash = await send();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✔ ${title}\n    block ${receipt.blockNumber}, gas ${receipt.gasUsed}, sent by the relayer`);
  } catch (error) {
    const reverted =
      error instanceof BaseError ? error.walk((e) => e instanceof ContractFunctionRevertedError) : null;
    const reason = reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : String(error);
    console.log(`✘ ${title}\n    refused by the contract: ${reason}`);
  }
}

async function showBatch(eventId: string, batchId: string) {
  const [exists, priceCents, quantity, sold] = await ledger.read.getBatch([eventId, batchId]);
  console.log(`    ${eventId}/${batchId}: exists=${exists} price=${priceCents} sold=${sold}/${quantity}`);
}

async function showExpense(expenseId: string) {
  const [, , amountCents, status, approvals, rejections] = await ledger.read.getExpense([expenseId]);
  const statusName = ["pending", "approved", "rejected"][status];
  console.log(
    `    ${expenseId}: ${statusName}, amount=${amountCents}, approvals=${approvals.length}, rejections=${rejections.length}`,
  );
}

if ((await ledger.read.term()) === 0n) {
  console.log("This deployment has no board yet. Run `npm run deploy:local:demo` first.");
  process.exit(1);
}

console.log(`Contract ${deployment.address}, term ${await ledger.read.term()}`);
console.log(`Board: ${(await ledger.read.currentBoard()).join(", ")}\n`);

await step("Diego creates a 4th batch for the End of Year Party", async () =>
  ledger.write.createBatch(
    await sign("BatchCreated", diego, {
      eventId: "end-of-year-party",
      batchId: "b4",
      priceCents: 8000n,
      quantity: 100n,
      resaleCapPercent: 120n,
    }),
  ),
);
await showBatch("end-of-year-party", "b4");

await step("The oracle issues a ticket from the 3rd batch after a Pix payment", async () =>
  ledger.write.issueTicket(
    await sign("TicketIssued", oracle, {
      ticketId: `demo-ticket-${Date.now()}`,
      eventId: "end-of-year-party",
      batchId: "b3",
      owner: student.account.address,
      priceCents: 7000n,
      orderRef: "demo-order",
      paymentRef: keccak256(toHex(`demo-payment-${Date.now()}`)),
    }),
  ),
);
await showBatch("end-of-year-party", "b3");

await step("Elisa tries to raise the 3rd batch's price after its first sale", async () =>
  ledger.write.updateBatch(
    await sign("BatchUpdated", elisa, {
      eventId: "end-of-year-party",
      batchId: "b3",
      priceCents: 9000n,
      quantity: 200n,
      resaleCapPercent: 120n,
    }),
  ),
);

await step("Diego tries to issue a ticket himself", async () =>
  ledger.write.issueTicket(
    await sign("TicketIssued", diego, {
      ticketId: `fake-ticket-${Date.now()}`,
      eventId: "end-of-year-party",
      batchId: "b3",
      owner: diego.address,
      priceCents: 7000n,
      orderRef: "none",
      paymentRef: keccak256(toHex("fake-payment")),
    }),
  ),
);

const receipt = "Invoice 123: sound system rental, R$ 1.200,00";
const receiptSha256 = `0x${createHash("sha256").update(receipt).digest("hex")}`;
const expenseId = `demo-expense-${Date.now()}`;

await step("Diego proposes a R$ 1.200,00 expense with its receipt hash", async () =>
  ledger.write.proposeExpense(
    await sign("ExpenseProposed", diego, {
      expenseId,
      amountCents: 120000n,
      category: "Suppliers",
      eventId: "end-of-year-party",
      receiptSha256,
    }),
  ),
);
await showExpense(expenseId);

await step("Elisa approves it: 2 of 3 directors", async () =>
  ledger.write.voteExpense(await sign("ExpenseVoted", elisa, { expenseId, approve: true })),
);
await showExpense(expenseId);

await step("The relayer tries to change Elisa's vote before sending it", async () => {
  const [message, signature] = await sign("ExpenseVoted", elisa, { expenseId, approve: true });
  return ledger.write.voteExpense([{ ...message, approve: false }, signature]);
});

console.log(`\nRelayer ${relayer.account.address} paid the gas for every transaction above.`);
