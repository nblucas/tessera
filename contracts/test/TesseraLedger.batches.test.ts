import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connect } from "../test-support/helpers.js";

describe("TesseraLedger batches and tickets", async () => {
  const { viem, deploy: deployLedger, addressOf, wallets } = await connect();
  const { deployer, oracle, a, b, c, d, outsider } = wallets;
  type Wallet = typeof a;

  const EVENT = "party";
  const BATCH = "b1";
  const PRICE = 5500n;

  // Every test starts with board [a, b, c] and, unless told otherwise, one genesis batch
  // "party/b1" at R$ 55,00 with `quantity` tickets.
  async function deploy({ quantity = 100n, genesisBatch = true } = {}) {
    const { ledger, sign } = await deployLedger([a, b, c]);
    type Tweak = Parameters<typeof sign>[3];
    if (genesisBatch) await ledger.write.createGenesisBatch([EVENT, BATCH, PRICE, quantity]);

    const batchFields = (batchId: string, priceCents: bigint, quantity: bigint) => ({
      eventId: EVENT,
      batchId,
      priceCents,
      quantity,
    });

    const createBatch = async (actor: Wallet, batchId: string, priceCents: bigint, quantity: bigint) =>
      ledger.write.createBatch(await sign("BatchCreated", actor, batchFields(batchId, priceCents, quantity)));
    const updateBatch = async (actor: Wallet, batchId: string, priceCents: bigint, quantity: bigint) =>
      ledger.write.updateBatch(await sign("BatchUpdated", actor, batchFields(batchId, priceCents, quantity)));
    const removeBatch = async (actor: Wallet, batchId: string) =>
      ledger.write.removeBatch(await sign("BatchRemoved", actor, { eventId: EVENT, batchId }));

    let nextTicket = 1;
    const issueTicket = async (
      fields: { ticketId?: string; batchId?: string; priceCents?: bigint; signer?: Wallet } = {},
      tweak?: Tweak,
    ) =>
      ledger.write.issueTicket(
        await sign(
          "TicketIssued",
          fields.signer ?? oracle,
          {
            ticketId: fields.ticketId ?? `t${nextTicket++}`,
            eventId: EVENT,
            batchId: fields.batchId ?? BATCH,
            owner: addressOf(outsider),
            priceCents: fields.priceCents ?? PRICE,
            orderRef: "order-1",
          },
          tweak,
        ),
      );

    async function sold(batchId = BATCH) {
      const [, , , soldCount] = await ledger.read.getBatch([EVENT, batchId]);
      return soldCount;
    }

    return { ledger, createBatch, updateBatch, removeBatch, issueTicket, sold };
  }

  describe("genesis batches and opening sales", () => {
    it("opening sales count as sold tickets", async () => {
      const { ledger, sold } = await deploy();
      await ledger.write.recordOpeningSales([EVENT, BATCH, 30n, 30n * PRICE]);
      assert.equal(await sold(), 30n);
    });

    it("opening sales cannot exceed the batch quantity", async () => {
      const { ledger } = await deploy({ quantity: 10n });
      await viem.assertions.revertWithCustomError(
        ledger.write.recordOpeningSales([EVENT, BATCH, 11n, 11n * PRICE]),
        ledger,
        "OpeningSalesExceedQuantity",
      );
    });

    it("only the genesis authority writes genesis batches", async () => {
      const { ledger } = await deploy({ genesisBatch: false });
      await viem.assertions.revertWithCustomError(
        ledger.write.createGenesisBatch([EVENT, BATCH, PRICE, 10n], { account: outsider.account }),
        ledger,
        "NotGenesisAuthority",
      );
    });

    it("genesis batches are refused once a signed action exists", async () => {
      const { ledger, createBatch } = await deploy({ genesisBatch: false });
      await createBatch(a, "b2", PRICE, 10n);
      await viem.assertions.revertWithCustomError(
        ledger.write.createGenesisBatch([EVENT, BATCH, PRICE, 10n], { account: deployer.account }),
        ledger,
        "GenesisClosed",
      );
    });
  });

  describe("batches", () => {
    it("directors create batches", async () => {
      const { ledger, createBatch } = await deploy();
      await createBatch(a, "b2", 7000n, 50n);
      const [exists, priceCents, quantity, soldCount] = await ledger.read.getBatch([EVENT, "b2"]);
      assert.deepEqual([exists, priceCents, quantity, soldCount], [true, 7000n, 50n, 0n]);
    });

    it("only directors create batches", async () => {
      const { ledger, createBatch } = await deploy();
      await viem.assertions.revertWithCustomError(
        createBatch(d, "b2", 7000n, 50n),
        ledger,
        "NotBoardMember",
      );
    });

    it("a batch id is used once per event", async () => {
      const { ledger, createBatch } = await deploy();
      await viem.assertions.revertWithCustomError(
        createBatch(a, BATCH, 7000n, 50n),
        ledger,
        "BatchAlreadyExists",
      );
    });

    it("batch prices must be positive whole cents", async () => {
      const { ledger, createBatch } = await deploy();
      await viem.assertions.revertWithCustomError(createBatch(a, "b2", 0n, 50n), ledger, "InvalidPrice");
    });

    it("batch quantities must be positive whole numbers", async () => {
      const { ledger, createBatch } = await deploy();
      await viem.assertions.revertWithCustomError(createBatch(a, "b2", 7000n, 0n), ledger, "InvalidQuantity");
    });

    it("amounts above what JavaScript can read exactly are refused", async () => {
      const { ledger, createBatch } = await deploy();
      await viem.assertions.revertWithCustomError(
        createBatch(a, "b2", 2n ** 53n, 50n),
        ledger,
        "InvalidPrice",
      );
    });

    it("a batch without sales can be changed", async () => {
      const { ledger, updateBatch } = await deploy();
      await updateBatch(b, BATCH, 6000n, 80n);
      const [, priceCents, quantity] = await ledger.read.getBatch([EVENT, BATCH]);
      assert.deepEqual([priceCents, quantity], [6000n, 80n]);
    });

    it("a batch is frozen after its first sale", async () => {
      const { ledger, updateBatch, issueTicket } = await deploy();
      await issueTicket();
      await viem.assertions.revertWithCustomError(updateBatch(b, BATCH, 6000n, 80n), ledger, "BatchFrozen");
    });

    it("a batch with sales cannot be removed", async () => {
      const { ledger, removeBatch, issueTicket } = await deploy();
      await issueTicket();
      await viem.assertions.revertWithCustomError(removeBatch(b, BATCH), ledger, "BatchFrozen");
    });

    it("a removed batch sells no tickets", async () => {
      const { ledger, removeBatch, issueTicket } = await deploy();
      await removeBatch(b, BATCH);
      await viem.assertions.revertWithCustomError(issueTicket(), ledger, "UnknownBatch");
    });
  });

  describe("tickets", () => {
    it("the oracle issues tickets", async () => {
      const { ledger, issueTicket, sold } = await deploy();
      await issueTicket({ ticketId: "t1" });
      assert.equal(await sold(), 1n);
      assert.equal(await ledger.read.isTicketIssued(["t1"]), true);
    });

    it("only the oracle issues tickets", async () => {
      const { ledger, issueTicket } = await deploy();
      await viem.assertions.revertWithCustomError(issueTicket({ signer: a }), ledger, "OnlyOracle");
    });

    it("a ticket is issued at the batch price", async () => {
      const { ledger, issueTicket } = await deploy();
      await viem.assertions.revertWithCustomError(
        issueTicket({ priceCents: PRICE - 1n }),
        ledger,
        "PriceMismatch",
      );
    });

    it("a ticket id is issued once", async () => {
      const { ledger, issueTicket } = await deploy();
      await issueTicket({ ticketId: "t1" });
      await viem.assertions.revertWithCustomError(
        issueTicket({ ticketId: "t1" }),
        ledger,
        "TicketAlreadyIssued",
      );
    });

    it("a sold-out batch issues no more tickets", async () => {
      const { ledger, issueTicket } = await deploy({ quantity: 1n });
      await issueTicket();
      await viem.assertions.revertWithCustomError(issueTicket(), ledger, "BatchSoldOut");
    });

    it("a ticket for an unknown batch is refused", async () => {
      const { ledger, issueTicket } = await deploy();
      await viem.assertions.revertWithCustomError(
        issueTicket({ batchId: "missing" }),
        ledger,
        "UnknownBatch",
      );
    });

    it("issuing a ticket announces it for the indexer", async () => {
      const { ledger, issueTicket } = await deploy();
      await viem.assertions.emitWithArgs(issueTicket({ ticketId: "t1" }), ledger, "TicketIssued", [
        addressOf(oracle),
        "t1",
        EVENT,
        BATCH,
        addressOf(outsider),
        PRICE,
        "order-1",
      ]);
    });
  });
});
