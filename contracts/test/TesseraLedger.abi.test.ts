import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hre from "hardhat";
import { tesseraLedgerAbi } from "../abi/TesseraLedger.js";

describe("TesseraLedger exported ABI", () => {
  it("matches the compiled contract (run `npm run export-abi` if not)", async () => {
    const artifact = await hre.artifacts.readArtifact("TesseraLedger");
    assert.deepEqual(tesseraLedgerAbi, artifact.abi);
  });
});
