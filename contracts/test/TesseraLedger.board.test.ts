import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";
import { connect } from "../test-support/helpers.js";

describe("TesseraLedger board and handover", async () => {
  const { viem, deploy: deployLedger, addressOf, assertSameAddresses: sameAddresses, wallets } = await connect();
  const { a, b, c, d, e, outsider } = wallets;
  type Wallet = typeof a;

  async function deploy(board: Wallet[] = [a, b, c]) {
    const { ledger, sign } = await deployLedger(board);
    type Tweak = Parameters<typeof sign>[3];

    const propose = async (actor: Wallet, handoverId: string, members: Wallet[], tweak?: Tweak) =>
      ledger.write.proposeHandover(
        await sign("HandoverProposed", actor, { handoverId, members: members.map(addressOf) }, tweak),
      );
    const approve = async (actor: Wallet, handoverId: string, tweak?: Tweak) =>
      ledger.write.approveHandover(await sign("HandoverApproved", actor, { handoverId }, tweak));
    const cancel = async (actor: Wallet, handoverId: string, tweak?: Tweak) =>
      ledger.write.cancelHandover(await sign("HandoverCancelled", actor, { handoverId }, tweak));

    async function handoverIsOpen() {
      const [open] = await ledger.read.openHandover();
      return open;
    }

    return { ledger, propose, approve, cancel, handoverIsOpen };
  }

  describe("initial board (genesis)", () => {
    it("the genesis authority sets the first board, which starts term 1", async () => {
      const { ledger } = await deploy();
      assert.equal(await ledger.read.term(), 1n);
      sameAddresses(await ledger.read.currentBoard(), [a, b, c]);
    });

    it("the genesis authority can be an address other than the deployer", async () => {
      // With the backend, the relayer writes the genesis through the ledger adapter.
      const relayer = e;
      const ledger = await viem.deployContract("TesseraLedger", [
        "atletica-integrada",
        addressOf(d),
        addressOf(relayer),
      ]);
      await viem.assertions.revertWithCustomError(
        ledger.write.setBoard([[addressOf(a)]]),
        ledger,
        "NotGenesisAuthority",
      );
      await ledger.write.setBoard([[addressOf(a)]], { account: relayer.account });
      assert.equal(await ledger.read.term(), 1n);
    });

    it("the board is set once", async () => {
      const { ledger } = await deploy();
      await viem.assertions.revertWithCustomError(
        ledger.write.setBoard([[addressOf(d)]]),
        ledger,
        "BoardAlreadySet",
      );
    });

    it("only the genesis authority sets the board", async () => {
      const { ledger } = await deploy([]);
      await viem.assertions.revertWithCustomError(
        ledger.write.setBoard([[addressOf(a)]], { account: outsider.account }),
        ledger,
        "NotGenesisAuthority",
      );
    });

    it("the board cannot list the same address twice", async () => {
      const { ledger } = await deploy([]);
      await viem.assertions.revertWithCustomError(
        ledger.write.setBoard([[addressOf(a), addressOf(a)]]),
        ledger,
        "DuplicateDirector",
      );
    });
  });

  describe("checks on every signed action", () => {
    it("refuses an action signed by someone other than the actor", async () => {
      const { ledger, propose } = await deploy();
      await viem.assertions.revertWithCustomError(
        propose(a, "h1", [d, e], { signedBy: outsider }),
        ledger,
        "BadSignature",
      );
    });

    it("refuses an action past its deadline", async () => {
      const { ledger, propose } = await deploy();
      await viem.assertions.revertWithCustomError(
        propose(a, "h1", [d, e], { deadline: 1n }),
        ledger,
        "DeadlineExpired",
      );
    });

    it("refuses a nonce that was already used", async () => {
      const { ledger, propose, cancel } = await deploy();
      await propose(a, "h1", [d, e]);
      await viem.assertions.revertWithCustomError(
        cancel(a, "h1", { nonce: 0n }),
        ledger,
        "BadNonce",
      );
    });

    it("refuses an action signed for another association", async () => {
      const { ledger, propose } = await deploy();
      await viem.assertions.revertWithCustomError(
        propose(a, "h1", [d, e], { association: "other-association" }),
        ledger,
        "WrongAssociation",
      );
    });

    it("closes genesis after the first signed action", async () => {
      const { ledger, propose, cancel } = await deploy();
      await propose(a, "h1", [d, e]);
      await cancel(a, "h1");
      assert.equal(await ledger.read.genesisClosed(), true);
    });
  });

  describe("handover", () => {
    it("proposing a handover counts as the first approval", async () => {
      const { ledger, propose } = await deploy();
      await propose(a, "h1", [d, e]);
      const [open, , proposer, members, approvals] = await ledger.read.openHandover();
      assert.equal(open, true);
      assert.equal(getAddress(proposer), getAddress(addressOf(a)));
      sameAddresses(members, [d, e]);
      assert.equal(approvals, 1n);
      assert.equal(await ledger.read.term(), 1n);
    });

    it("a majority of the current board starts the new term", async () => {
      const { ledger, propose, approve, handoverIsOpen } = await deploy();
      await propose(a, "h1", [d, e]);
      await approve(b, "h1");
      assert.equal(await ledger.read.term(), 2n);
      sameAddresses(await ledger.read.currentBoard(), [d, e]);
      assert.equal(await handoverIsOpen(), false);
    });

    it("a single-member board hands over at once", async () => {
      const { ledger, propose } = await deploy([a]);
      await propose(a, "h1", [d]);
      assert.equal(await ledger.read.term(), 2n);
      sameAddresses(await ledger.read.currentBoard(), [d]);
    });

    it("only current directors can propose a handover", async () => {
      const { ledger, propose } = await deploy();
      await viem.assertions.revertWithCustomError(
        propose(outsider, "h1", [d, e]),
        ledger,
        "NotBoardMember",
      );
    });

    it("only one handover can be open at a time", async () => {
      const { ledger, propose } = await deploy();
      await propose(a, "h1", [d, e]);
      await viem.assertions.revertWithCustomError(
        propose(b, "h2", [d]),
        ledger,
        "HandoverAlreadyOpen",
      );
    });

    it("a proposed board needs at least one director", async () => {
      const { ledger, propose } = await deploy();
      await viem.assertions.revertWithCustomError(propose(a, "h1", []), ledger, "EmptyBoard");
    });

    it("a proposed board cannot list the same address twice", async () => {
      const { ledger, propose } = await deploy();
      await viem.assertions.revertWithCustomError(
        propose(a, "h1", [d, d]),
        ledger,
        "DuplicateDirector",
      );
    });

    it("each director approves a handover once", async () => {
      const { ledger, propose, approve } = await deploy([a, b, c, d, e]);
      await propose(a, "h1", [outsider]);
      await approve(b, "h1");
      await viem.assertions.revertWithCustomError(approve(b, "h1"), ledger, "AlreadyApproved");
    });

    it("the proposer's own approval was already counted", async () => {
      const { ledger, propose, approve } = await deploy();
      await propose(a, "h1", [d, e]);
      await viem.assertions.revertWithCustomError(approve(a, "h1"), ledger, "AlreadyApproved");
    });

    it("approvals must name the open handover", async () => {
      const { ledger, propose, approve } = await deploy();
      await propose(a, "h1", [d, e]);
      await viem.assertions.revertWithCustomError(
        approve(b, "other"),
        ledger,
        "NoOpenHandoverWithThisId",
      );
    });

    it("the proposer can cancel an open handover", async () => {
      const { ledger, propose, cancel, handoverIsOpen } = await deploy();
      await propose(a, "h1", [d, e]);
      await cancel(a, "h1");
      assert.equal(await handoverIsOpen(), false);
      assert.equal(await ledger.read.term(), 1n);
    });

    it("only the proposer can cancel a handover", async () => {
      const { ledger, propose, cancel } = await deploy();
      await propose(a, "h1", [d, e]);
      await viem.assertions.revertWithCustomError(
        cancel(b, "h1"),
        ledger,
        "OnlyProposerCanCancel",
      );
    });

    it("approvals from a cancelled proposal do not carry over", async () => {
      const { ledger, propose, approve, cancel } = await deploy([a, b, c, d, e]);
      await propose(a, "h1", [outsider]);
      await approve(b, "h1");
      await cancel(a, "h1");
      await propose(c, "h2", [outsider]);
      await approve(b, "h2");
      const [, , , , approvals] = await ledger.read.openHandover();
      assert.equal(approvals, 2n);
    });

    it("former directors can no longer act after a handover", async () => {
      const { ledger, propose, approve } = await deploy();
      await propose(a, "h1", [d, e]);
      await approve(b, "h1");
      await viem.assertions.revertWithCustomError(
        propose(a, "h2", [a]),
        ledger,
        "NotBoardMember",
      );
    });

    it("the new board can start its own handover", async () => {
      const { ledger, propose, approve } = await deploy();
      await propose(a, "h1", [d, e]);
      await approve(b, "h1");
      await propose(d, "h2", [a, b]);
      await approve(e, "h2");
      assert.equal(await ledger.read.term(), 3n);
      sameAddresses(await ledger.read.currentBoard(), [a, b]);
    });
  });
});
