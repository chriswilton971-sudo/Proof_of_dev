/**
 * KeeperHub Direct Execution API client.
 *
 * Matches the real API at https://docs.keeperhub.com/api/direct-execution.
 * Auth is a single `kh_` organization API key — KeeperHub custodies the
 * signing wallet itself (server-side Turnkey enclave, configured in the
 * KeeperHub dashboard under Wallet Management). This app never holds,
 * receives, or passes a private key for it.
 *
 * Follows KeeperHub's documented "safe first-write sequence":
 *   1. simulate: true  -> must return success && !wouldRevert
 *   2. same body, simulate removed, unique Idempotency-Key added
 *   3. poll GET /api/execute/{executionId}/status until completed/failed
 *
 * See docs/integrations/keeperhub-mcp.md.
 */

import { randomUUID } from "node:crypto";
import { fetchJson } from "./chain-data/http.js";

export const KEEPERHUB_BASE_URL = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com";
export const KEEPERHUB_API_KEY  = process.env.KEEPERHUB_API_KEY ?? "";

function isPlaceholderKey(val) {
  if (!val || !String(val).trim()) return true;
  const v = String(val).trim();
  return v.includes("your_") || v.includes("_here");
}

/** True when KEEPERHUB_API_KEY isn't set to a real value yet. */
export function isKeeperhubConfigured() {
  return !isPlaceholderKey(KEEPERHUB_API_KEY);
}

async function keeperhubRequest(path, options = {}) {
  if (!isKeeperhubConfigured()) {
    throw new Error("KEEPERHUB_API_KEY is not configured");
  }

  return fetchJson(`${KEEPERHUB_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Connectivity check -- GET /api/chains is a cheap authenticated read that
 * confirms the API key and base URL work without spending anything.
 */
export async function checkKeeperhubConnection() {
  return keeperhubRequest("/api/chains", { method: "GET" });
}

/**
 * Call a smart contract function via KeeperHub's org wallet, following the
 * documented safe first-write sequence: simulate, then broadcast with an
 * idempotency key, then poll status. Throws on a would-revert simulate or
 * on a failed execution rather than returning a partial/ambiguous result.
 *
 * @param {object} params
 * @param {string} params.contractAddress
 * @param {number} params.chainId
 * @param {string} params.functionName
 * @param {unknown[]} params.functionArgs - plain array, JSON-stringified internally
 * @param {string} [params.abi] - JSON-stringified ABI; auto-fetched from block explorer if omitted
 * @param {string} [params.value] - native value in ether units, for payable functions
 * @param {{ pollIntervalMs?: number, maxPolls?: number }} [opts]
 */
export async function executeContractCall(
  { contractAddress, chainId, functionName, functionArgs = [], abi, value },
  opts = {}
) {
  const body = {
    contractAddress,
    chainId,
    functionName,
    functionArgs: JSON.stringify(functionArgs),
    ...(abi ? { abi } : {}),
    ...(value ? { value } : {}),
  };

  // 1. Simulate -- catches bad ABI/args/reverts before spending gas.
  const sim = await keeperhubRequest("/api/execute/contract-call", {
    method: "POST",
    body: JSON.stringify({ ...body, simulate: true }),
  }).catch((err) => {
    throw new Error(`KeeperHub simulation failed: ${err.message}`);
  });

  if (sim?.wouldRevert) {
    throw new Error(`KeeperHub simulation would revert: ${sim.revertReason ?? "unknown reason"}`);
  }

  // Read (view/pure) calls resolve immediately with `result` and are not writes.
  if (Object.prototype.hasOwnProperty.call(sim ?? {}, "result") && sim.status !== "simulated") {
    return sim;
  }

  // 2. Broadcast -- same body, no `simulate`, unique Idempotency-Key.
  const broadcastResult = await keeperhubRequest("/api/execute/contract-call", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: JSON.stringify(body),
  });

  // Read functions return { result } directly with no executionId to poll.
  if (!broadcastResult.executionId) {
    return broadcastResult;
  }

  // 3. Poll to a terminal state.
  return pollExecutionStatus(broadcastResult.executionId, opts);
}

async function pollExecutionStatus(executionId, { pollIntervalMs = 2000, maxPolls = 30 } = {}) {
  for (let i = 0; i < maxPolls; i++) {
    const status = await keeperhubRequest(`/api/execute/${executionId}/status`, { method: "GET" });
    if (status.status === "completed" || status.status === "failed") {
      if (status.status === "failed") {
        throw new Error(`KeeperHub execution ${executionId} failed: ${status.error ?? "unknown error"}`);
      }
      return status;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`KeeperHub execution ${executionId} did not complete within ${maxPolls} polls`);
}
