/**
 * Offline unit test for the KeeperHub calldata encoding — no network calls,
 * safe to run in CI on every PR (unlike the connectivity smoke test, which
 * needs a real KEEPERHUB_API_KEY and only runs where that secret exists).
 *
 * Run: node --test tests/keeperhub-calldata.test.js
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Interface } from "ethers";
import { buildMarkVerifiedCalldata } from "../services/analysis/keeperhub.js";

describe("buildMarkVerifiedCalldata", () => {
  it("encodes markVerified(uint256) identically to a fresh ethers Interface", () => {
    const iface = new Interface(["function markVerified(uint256 tokenId)"]);
    const expected = iface.encodeFunctionData("markVerified", [42n]);
    assert.equal(buildMarkVerifiedCalldata(42), expected);
  });

  it("starts with the correct 4-byte function selector", () => {
    const iface = new Interface(["function markVerified(uint256 tokenId)"]);
    const selector = iface.getFunction("markVerified").selector;
    assert.equal(buildMarkVerifiedCalldata(1).slice(0, 10), selector);
  });

  it("accepts string, number, and bigint tokenIds identically", () => {
    const a = buildMarkVerifiedCalldata("7");
    const b = buildMarkVerifiedCalldata(7);
    const c = buildMarkVerifiedCalldata(7n);
    assert.equal(a, b);
    assert.equal(b, c);
  });
});
