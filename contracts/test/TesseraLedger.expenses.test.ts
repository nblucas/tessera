import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connect } from "../test-support/helpers.js";

// Values of the contract's ExpenseStatus enum.
const PENDING = 0;
const APPROVED = 1;
const REJECTED = 2;

const RECEIPT_SHA256 = `0x${"a".repeat(64)}` as const;

describe("TesseraLedger expenses and votes", async () => {
  const { viem, deploy: deployLedger, addressOf, assertSameAddresses, wallets } = await connect();
  const { a, b, c, d, e, outsider } = wallets;
  type Wallet = typeof a;

  async function deploy(board: Wallet[] = [a, b, c]) {
    const { ledger, sign } = await deployLedger(board);

    const proposeExpense = async (
      actor: Wallet,
      expenseId = "x1",
      fields: { amountCents?: bigint; category?: string } = {},
    ) =>
      ledger.write.proposeExpense(
        await sign("ExpenseProposed", actor, {
          expenseId,
          amountCents: fields.amountCents ?? 120000n,
          category: fields.category ?? "Suppliers",
          eventId: "party",
          receiptSha256: RECEIPT_SHA256,
        }),
      );

    const vote = async (actor: Wallet, approve: boolean, expenseId = "x1") =>
      ledger.write.voteExpense(await sign("ExpenseVoted", actor, { expenseId, approve }));

    const proposeHandover = async (actor: Wallet, members: Wallet[], handoverId = "h1") =>
      ledger.write.proposeHandover(
        await sign("HandoverProposed", actor, { handoverId, members: members.map(addressOf) }),
      );
    const approveHandover = async (actor: Wallet, handoverId = "h1") =>
      ledger.write.approveHandover(await sign("HandoverApproved", actor, { handoverId }));

    async function statusOf(expenseId = "x1") {
      const [, , , status] = await ledger.read.getExpense([expenseId]);
      return status;
    }

    return { ledger, sign, proposeExpense, vote, proposeHandover, approveHandover, statusOf };
  }

  describe("proposing and voting", () => {
    it("proposing an expense counts as the first approval", async () => {
      const { ledger, proposeExpense, statusOf } = await deploy();
      await proposeExpense(a);
      const [exists, proposer, amountCents, , approvals, rejections] = await ledger.read.getExpense(["x1"]);
      assert.equal(exists, true);
      assert.equal(proposer.toLowerCase(), addressOf(a).toLowerCase());
      assert.equal(amountCents, 120000n);
      assertSameAddresses(approvals, [a]);
      assertSameAddresses(rejections, []);
      assert.equal(await statusOf(), PENDING);
    });

    it("a second approval from a 3-member board approves the expense", async () => {
      const { proposeExpense, vote, statusOf } = await deploy();
      await proposeExpense(a);
      await vote(b, true);
      assert.equal(await statusOf(), APPROVED);
    });

    it("two rejections from a 3-member board reject the expense", async () => {
      const { proposeExpense, vote, statusOf } = await deploy();
      await proposeExpense(a);
      await vote(b, false);
      await vote(c, false);
      assert.equal(await statusOf(), REJECTED);
    });

    it("one approval and one rejection keep the expense pending", async () => {
      const { proposeExpense, vote, statusOf } = await deploy();
      await proposeExpense(a);
      await vote(b, false);
      assert.equal(await statusOf(), PENDING);
    });

    it("a single-member board approves its own proposals at once", async () => {
      const { proposeExpense, statusOf } = await deploy([a]);
      await proposeExpense(a);
      assert.equal(await statusOf(), APPROVED);
    });

    it("deciding an expense announces it for the indexer", async () => {
      const { ledger, proposeExpense, vote } = await deploy();
      await proposeExpense(a);
      await viem.assertions.emitWithArgs(vote(b, true), ledger, "ExpenseDecided", ["x1", APPROVED]);
    });
  });

  describe("refused expenses and votes", () => {
    it("only board members can propose expenses", async () => {
      const { ledger, proposeExpense } = await deploy();
      await viem.assertions.revertWithCustomError(proposeExpense(outsider), ledger, "NotBoardMember");
    });

    it("an expense id is used once", async () => {
      const { ledger, proposeExpense } = await deploy();
      await proposeExpense(a);
      await viem.assertions.revertWithCustomError(proposeExpense(b), ledger, "ExpenseAlreadyExists");
    });

    it("expense amounts must be positive whole cents", async () => {
      const { ledger, proposeExpense } = await deploy();
      await viem.assertions.revertWithCustomError(
        proposeExpense(a, "x1", { amountCents: 0n }),
        ledger,
        "InvalidAmount",
      );
    });

    it("expense categories come from the app's list", async () => {
      const { ledger, proposeExpense } = await deploy();
      await viem.assertions.revertWithCustomError(
        proposeExpense(a, "x1", { category: "Party favours" }),
        ledger,
        "UnknownCategory",
      );
    });

    it("only board members can vote", async () => {
      const { ledger, proposeExpense, vote } = await deploy();
      await proposeExpense(a);
      await viem.assertions.revertWithCustomError(vote(outsider, true), ledger, "NotBoardMember");
    });

    it("each director votes once", async () => {
      const { ledger, proposeExpense, vote } = await deploy();
      await proposeExpense(a);
      await viem.assertions.revertWithCustomError(vote(a, true), ledger, "AlreadyVoted");
    });

    it("a decided expense takes no more votes", async () => {
      const { ledger, proposeExpense, vote } = await deploy();
      await proposeExpense(a);
      await vote(b, true);
      await viem.assertions.revertWithCustomError(vote(c, false), ledger, "ExpenseNotPending");
    });

    it("votes on an unknown expense are refused", async () => {
      const { ledger, vote } = await deploy();
      await viem.assertions.revertWithCustomError(vote(a, true, "missing"), ledger, "UnknownExpense");
    });

    it("a vote changed after signing is refused", async () => {
      const { ledger, sign, proposeExpense } = await deploy();
      await proposeExpense(a);
      const [message, signature] = await sign("ExpenseVoted", b, { expenseId: "x1", approve: true });
      await viem.assertions.revertWithCustomError(
        ledger.write.voteExpense([{ ...message, approve: false }, signature]),
        ledger,
        "BadSignature",
      );
    });
  });

  describe("votes across a board handover", () => {
    it("former directors can no longer vote", async () => {
      const { ledger, proposeExpense, vote, proposeHandover, approveHandover } = await deploy();
      await proposeExpense(a);
      await proposeHandover(a, [d, e]);
      await approveHandover(b);
      await viem.assertions.revertWithCustomError(vote(b, true), ledger, "NotBoardMember");
    });

    it("votes from former directors stop counting after a handover", async () => {
      const { proposeExpense, vote, proposeHandover, approveHandover, statusOf } = await deploy();
      await proposeExpense(a);
      await proposeHandover(a, [d, e]);
      await approveHandover(b);
      await vote(d, true);
      // A's approval no longer counts: one approval of the two the new board needs.
      assert.equal(await statusOf(), PENDING);
    });

    it("the new board decides pending expenses with its own votes", async () => {
      const { proposeExpense, vote, proposeHandover, approveHandover, statusOf } = await deploy();
      await proposeExpense(a);
      await proposeHandover(a, [d, e]);
      await approveHandover(b);
      await vote(d, true);
      await vote(e, true);
      assert.equal(await statusOf(), APPROVED);
    });

    it("a director who stays on the new board keeps their earlier vote", async () => {
      const { proposeExpense, vote, proposeHandover, approveHandover, statusOf } = await deploy();
      await proposeExpense(a);
      await proposeHandover(a, [a, d, e]);
      await approveHandover(b);
      await vote(d, true);
      assert.equal(await statusOf(), APPROVED);
    });

    it("a handover recounts pending expenses at once", async () => {
      const { proposeExpense, proposeHandover, approveHandover, statusOf } = await deploy();
      await proposeExpense(a);
      await proposeHandover(b, [a]);
      await approveHandover(c);
      // The new board is A alone, and A already approved.
      assert.equal(await statusOf(), APPROVED);
    });

    it("decided expenses stay decided after a handover", async () => {
      const { proposeExpense, vote, proposeHandover, approveHandover, statusOf } = await deploy();
      await proposeExpense(a);
      await vote(b, true);
      await proposeHandover(a, [d, e]);
      await approveHandover(c);
      assert.equal(await statusOf(), APPROVED);
    });

    it("a recount handles several pending expenses", async () => {
      const { proposeExpense, vote, proposeHandover, approveHandover, statusOf } = await deploy();
      await proposeExpense(a, "x1");
      await proposeExpense(b, "x2");
      await proposeExpense(a, "x3");
      await vote(c, true, "x3");
      await proposeHandover(b, [a]);
      await approveHandover(c);
      assert.equal(await statusOf("x1"), APPROVED);
      assert.equal(await statusOf("x2"), PENDING);
      assert.equal(await statusOf("x3"), APPROVED);
    });
  });
});
