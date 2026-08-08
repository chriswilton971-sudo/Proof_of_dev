/**
 * Unit tests for the KeeperHub client config guard and the Minted event
 * topic hash used to gate the verify webhook. The Direct Execution calls
 * themselves (simulate/execute/poll) need a real KEEPERHUB_API_KEY and are
 * covered by the CI "keeperhub-smoke-test" job instead — see ci.yml. Pure
 * calldata encoding is covered separately in keeperhub-calldata.test.js.
 * Run: node --test tests/keeperhub.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { id as keccakId } from "ethers";

describe("keeperhub config guard", () => {
  it("isKeeperhubConfigured() is false for a placeholder key", async () => {
    process.env.KEEPERHUB_API_KEY = "your_kh_key_here";
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isKeeperhubConfigured(), false);
  });

  it("isKeeperhubConfigured() is false when unset", async () => {
    delete process.env.KEEPERHUB_API_KEY;
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isKeeperhubConfigured(), false);
  });

  it("isKeeperhubConfigured() is true for a real-looking key", async () => {
    process.env.KEEPERHUB_API_KEY = "kh_live_abc123";
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    assert.equal(mod.isKeeperhubConfigured(), true);
  });

  it("verifyMintOnChain() throws when contractAddress is missing", async () => {
    const mod = await import(`../services/analysis/keeperhub.js?t=${Date.now()}`);
    await assert.rejects(
      () => mod.verifyMintOnChain({ network: "sepolia", contractAddress: "", tokenId: "1" }),
      /contractAddress is required/,
    );
  });
});

describe("mint event topic hash", () => {
  it("MINTED_TOPIC0 matches keccak256(\"Minted(address,uint256,uint256)\")", async () => {
    const { MINTED_TOPIC0 } = await import("../services/analysis/chain-data/mintEvents.js");
    assert.equal(MINTED_TOPIC0, keccakId("Minted(address,uint256,uint256)"));
  });
});
