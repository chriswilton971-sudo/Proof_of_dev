/**
 * Unit tests for the KeeperHub client config guards and the Minted event
 * topic hash used to gate the post-mint webhook.
 * Run: node --test tests/keeperhub.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { id as keccakId } from "ethers";

describe("keeperhub config guards", () => {
  it("isKeeperhubConfigured() is false for a placeholder key", async () => {
    process.env.KEEPERHUB_API_KEY = "your_kh_key_here";
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isKeeperhubConfigured(), false);
  });

  it("isKeeperhubConfigured() is true for a real-looking key", async () => {
    process.env.KEEPERHUB_API_KEY = "kh_live_abc123";
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isKeeperhubConfigured(), true);
  });

  it("isAgenticWalletConfigured() rejects the all-zero placeholder key", async () => {
    process.env.KEEPERHUB_WALLET_PRIVATE_KEY =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isAgenticWalletConfigured(), false);
  });

  it("isAgenticWalletConfigured() accepts a real-looking key", async () => {
    process.env.KEEPERHUB_WALLET_PRIVATE_KEY =
      "0x" + "1".repeat(64);
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isAgenticWalletConfigured(), true);
  });

  it("triggerPostMintVerification() throws when no workflow ID is set", async () => {
    delete process.env.KEEPERHUB_MARKVERIFIED_WORKFLOW_ID;
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    await assert.rejects(
      () => mod.triggerPostMintVerification({ tokenId: "1", account: "0x0", mintTxHash: "0x0" }),
      /KEEPERHUB_MARKVERIFIED_WORKFLOW_ID/,
    );
  });
});

describe("mint event topic hash", () => {
  it("MINTED_TOPIC0 matches keccak256(\"Minted(address,uint256,uint256)\")", async () => {
    const { MINTED_TOPIC0 } = await import("../services/analysis/chain-data/mintEvents.js");
    assert.equal(MINTED_TOPIC0, keccakId("Minted(address,uint256,uint256)"));
  });
});
