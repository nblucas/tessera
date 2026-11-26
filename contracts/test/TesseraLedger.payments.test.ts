import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";
import { connect } from "../test-support/helpers.js";

// Payment outcomes reported by the oracle, resale, and replacing the oracle. The same cases as
// the payment, resale and oracle sections of shared/src/rules.examples.ts.
describe("TesseraLedger payments, resale and oracle", async () => {
  const { viem, deploy: deployLedger, addressOf, wallets } = await connect();
  const { oracle, a, b, c, d, outsider } = wallets;
  type Wallet = typeof a;

  const EVENT = "party";
  const BATCH = "b1";
  const PRICE = 5500n;
  const ref = (label: string) =>
    `0x${Buffer.from(label).toString("hex").padEnd(64, "0")}` as `0x${string}`;

  async function deploy() {
    const { ledger, sign } = await deployLedger([a, b, c]);
    await ledger.write.createGenesisBatch([EVENT, BATCH, PRICE, 100n, 120n]);

    const issue = async (ticketId: string, owner: Wallet = outsider, signer: Wallet = oracle) =>
      ledger.write.issueTicket(
        await sign("TicketIssued", signer, {
          ticketId,
          eventId: EVENT,
          batchId: BATCH,
          owner: addressOf(owner),
          priceCents: PRICE,
          orderRef: `order-${ticketId}`,
          paymentRef: ref(ticketId),
        }),
      );
    const refund = async (paymentRef: `0x${string}`, signer: Wallet = oracle) =>
      ledger.write.refundPayment(
        await sign("PaymentRefunded", signer, {
          paymentRef,
          amountCents: PRICE,
          orderRef: "order-r",
          reason: "batch is sold out",
        }),
      );
    const reverse = async (ticketId: string, paymentRef = ref(ticketId), signer: Wallet = oracle) =>
      ledger.write.reversePayment(
        await sign("PaymentReversed", signer, { paymentRef, ticketId, amountCents: PRICE }),
      );
    const list = async (ticketId: string, priceCents: bigint, owner: Wallet = outsider) =>
      ledger.write.listTicket(await sign("TicketListed", owner, { ticketId, priceCents }));
    const settle = async (
      listedTicketId: string,
      ticketId: string,
      priceCents: bigint,
      buyer: Wallet = d,
      split?: { royaltyCents: bigint; platformFeeCents: bigint; payoutCents: bigint },
    ) => {
      const royaltyCents = (priceCents * 10n + 50n) / 100n;
      const platformFeeCents = (priceCents * 5n + 50n) / 100n;
      return ledger.write.settleResale(
        await sign("ResaleSettled", oracle, {
          paymentRef: ref(ticketId),
          listedTicketId,
          ticketId,
          owner: addressOf(buyer),
          priceCents,
          ...(split ?? { royaltyCents, platformFeeCents, payoutCents: priceCents - royaltyCents - platformFeeCents }),
          orderRef: `order-${ticketId}`,
        }),
      );
    };
    const status = async (ticketId: string) => (await ledger.read.getTicket([ticketId]))[0];
    const sold = async () => (await ledger.read.getBatch([EVENT, BATCH]))[3];

    return { ledger, sign, issue, refund, reverse, list, settle, status, sold };
  }

  const VALID = 1;
  const LISTED = 2;
  const RESOLD = 3;
  const REVOKED = 4;

  describe("payment outcomes", () => {
    it("a payment produces one ticket only", async () => {
      const { ledger, sign } = await deploy();
      const issueWith = async (ticketId: string) =>
        ledger.write.issueTicket(
          await sign("TicketIssued", oracle, {
            ticketId,
            eventId: EVENT,
            batchId: BATCH,
            owner: addressOf(outsider),
            priceCents: PRICE,
            orderRef: "o",
            paymentRef: ref("p1"),
          }),
        );
      await issueWith("t1");
      await viem.assertions.revertWithCustomError(issueWith("t2"), ledger, "PaymentAlreadyReported");
    });

    it("a refunded payment cannot become a ticket", async () => {
      const { ledger, issue, refund } = await deploy();
      await refund(ref("t1"));
      await viem.assertions.revertWithCustomError(issue("t1"), ledger, "PaymentAlreadyReported");
    });

    it("only the oracle reports refunds and reversals", async () => {
      const { ledger, issue, refund, reverse } = await deploy();
      await viem.assertions.revertWithCustomError(refund(ref("p1"), a), ledger, "OnlyOracleReports");
      await issue("t1");
      await viem.assertions.revertWithCustomError(reverse("t1", ref("t1"), a), ledger, "OnlyOracleReports");
    });

    it("a reversed payment revokes its ticket and returns it to stock", async () => {
      const { issue, reverse, status, sold } = await deploy();
      await issue("t1");
      await reverse("t1");
      assert.equal(await status("t1"), REVOKED);
      assert.equal(await sold(), 0n);
    });

    it("a reversal must name the payment of that ticket, once", async () => {
      const { ledger, issue, reverse } = await deploy();
      await issue("t1");
      await issue("t2");
      await viem.assertions.revertWithCustomError(reverse("t1", ref("t2")), ledger, "PaymentDoesNotMatchTicket");
      await reverse("t1");
      await viem.assertions.revertWithCustomError(reverse("t1"), ledger, "PaymentAlreadyReversed");
    });

    it("reporting a refund announces it for the indexer", async () => {
      const { ledger, refund } = await deploy();
      await viem.assertions.emitWithArgs(refund(ref("p1")), ledger, "PaymentRefunded", [
        getAddress(addressOf(oracle)),
        ref("p1"),
        PRICE,
        "order-r",
        "batch is sold out",
      ]);
    });
  });

  describe("resale", () => {
    it("the owner lists within the cap, and above it is refused", async () => {
      const { ledger, issue, list, status } = await deploy();
      await issue("t1");
      await viem.assertions.revertWithCustomErrorWithArgs(list("t1", 6601n), ledger, "AboveResaleCap", [6600n]);
      await list("t1", 6600n);
      assert.equal(await status("t1"), LISTED);
    });

    it("only the owner lists, and only a valid ticket", async () => {
      const { ledger, issue, list, reverse } = await deploy();
      await issue("t1");
      await viem.assertions.revertWithCustomError(list("t1", 5000n, d), ledger, "OnlyOwnerLists");
      await list("t1", 5000n);
      await viem.assertions.revertWithCustomError(list("t1", 5500n), ledger, "TicketNotValidForResale");
      await issue("t2");
      await reverse("t2");
      await viem.assertions.revertWithCustomError(list("t2", 5000n), ledger, "TicketNotValidForResale");
    });

    it("the owner cancels a listing", async () => {
      const { ledger, sign, issue, list, status } = await deploy();
      await issue("t1");
      await list("t1", 5000n);
      await ledger.write.cancelListing(await sign("ListingCancelled", outsider, { ticketId: "t1" }));
      assert.equal(await status("t1"), VALID);
    });

    it("a paid resale moves the ticket to the buyer", async () => {
      const { ledger, issue, list, settle, status, sold } = await deploy();
      await issue("t1");
      await list("t1", 6000n);
      await settle("t1", "t2", 6000n);
      assert.equal(await status("t1"), RESOLD);
      assert.equal(await status("t2"), VALID);
      assert.equal(getAddress((await ledger.read.getTicket(["t2"]))[1]), getAddress(addressOf(d)));
      assert.equal(await sold(), 1n);
    });

    it("a resale must match the listing and the fixed split", async () => {
      const { ledger, issue, list, settle } = await deploy();
      await viem.assertions.revertWithCustomError(settle("t9", "t2", 6000n), ledger, "TicketNotListed");
      await issue("t1");
      await list("t1", 6000n);
      await viem.assertions.revertWithCustomError(settle("t1", "t2", 5000n), ledger, "ListedPriceMismatch");
      await viem.assertions.revertWithCustomError(
        settle("t1", "t2", 6000n, d, { royaltyCents: 0n, platformFeeCents: 300n, payoutCents: 5700n }),
        ledger,
        "ResaleSplitMismatch",
      );
      await viem.assertions.revertWithCustomError(settle("t1", "t2", 6000n, outsider), ledger, "OwnListing");
    });

    it("a reversal after a resale is recorded, and the buyer keeps their ticket", async () => {
      const { issue, list, settle, reverse, status, sold } = await deploy();
      await issue("t1");
      await list("t1", 6000n);
      await settle("t1", "t2", 6000n);
      await reverse("t1");
      assert.equal(await status("t1"), RESOLD);
      assert.equal(await status("t2"), VALID);
      assert.equal(await sold(), 1n);
    });
  });

  describe("replacing the oracle", () => {
    it("a board majority replaces the oracle, and the former one is refused", async () => {
      const { ledger, sign, issue } = await deploy();
      await ledger.write.proposeOracleChange(
        await sign("OracleChangeProposed", a, { proposalId: "o1", newOracle: addressOf(d) }),
      );
      assert.equal(getAddress(await ledger.read.oracle()), getAddress(addressOf(oracle)));
      await ledger.write.approveOracleChange(await sign("OracleChangeApproved", b, { proposalId: "o1" }));
      assert.equal(getAddress(await ledger.read.oracle()), getAddress(addressOf(d)));

      await viem.assertions.revertWithCustomError(issue("t1"), ledger, "OnlyOracle");
      await issue("t1", outsider, d);
    });

    it("only directors propose, one change at a time, and the proposer cancels", async () => {
      const { ledger, sign } = await deploy();
      const propose = async (actor: Wallet, proposalId: string) =>
        ledger.write.proposeOracleChange(
          await sign("OracleChangeProposed", actor, { proposalId, newOracle: addressOf(d) }),
        );
      await viem.assertions.revertWithCustomError(propose(outsider, "o1"), ledger, "NotBoardMember");
      await propose(a, "o1");
      await viem.assertions.revertWithCustomError(propose(b, "o2"), ledger, "OracleChangeAlreadyOpen");
      await ledger.write.cancelOracleChange(await sign("OracleChangeCancelled", a, { proposalId: "o1" }));
      assert.equal(getAddress(await ledger.read.oracle()), getAddress(addressOf(oracle)));
    });
  });
});
