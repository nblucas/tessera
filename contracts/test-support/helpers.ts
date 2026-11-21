import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, type Address, type Hex } from "viem";
import { ledgerDomain, types, type ActionKind } from "../lib/eip712.js";

export const ASSOCIATION = "atletica-integrada";
export const FAR_DEADLINE = 2_000_000_000n;

// Opens a fresh in-memory chain. Account 0 deploys and relays, account 1 is the payment
// oracle, and the rest are people who sign.
export async function connect() {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [deployer, oracle, a, b, c, d, e, outsider] = await viem.getWalletClients();
  type Wallet = typeof a;

  // Options to build invalid actions on purpose.
  type Tweak = { signedBy?: Wallet; nonce?: bigint; deadline?: bigint; association?: string };

  const addressOf = (wallet: Wallet) => wallet.account.address;

  function assertSameAddresses(actual: readonly Address[], expected: Wallet[]) {
    assert.deepEqual(
      actual.map((address) => getAddress(address)),
      expected.map((wallet) => getAddress(addressOf(wallet))),
    );
  }

  async function deploy(board: Wallet[] = [a, b, c]) {
    const ledger = await viem.deployContract("TesseraLedger", [
      ASSOCIATION,
      addressOf(oracle),
      addressOf(deployer),
    ]);
    if (board.length > 0) await ledger.write.setBoard([board.map(addressOf)]);

    const domain = ledgerDomain(await publicClient.getChainId(), ledger.address);

    // Builds the message the way the app does and signs it. Returns the arguments for the
    // contract function: [message, signature].
    async function sign(
      kind: ActionKind,
      actor: Wallet,
      fields: Record<string, unknown>,
      tweak: Tweak = {},
    ): Promise<readonly [any, Hex]> {
      const message = {
        actor: addressOf(actor),
        nonce: tweak.nonce ?? (await ledger.read.nonces([addressOf(actor)])),
        deadline: tweak.deadline ?? FAR_DEADLINE,
        association: tweak.association ?? ASSOCIATION,
        ...fields,
      };
      const signature = await (tweak.signedBy ?? actor).signTypedData({
        domain,
        types: { [kind]: types[kind] },
        primaryType: kind,
        message,
      } as any);
      return [message, signature] as const;
    }

    return { ledger, sign };
  }

  return { viem, deploy, addressOf, assertSameAddresses, wallets: { deployer, oracle, a, b, c, d, e, outsider } };
}
