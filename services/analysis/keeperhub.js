/**
 * KeeperHub Direct Execution client.
 *
 * Wires the app to a real, demoable on-chain action: after a wallet mints
 * its ProofOfDev NFT, `verifyMintOnChain()` has KeeperHub's automation
 * wallet call `markVerified(tokenId)` on the contract — the exact hook
 * contracts/ProofOfDev.sol documents as "intended to be called by an
 * automation bot (e.g. a KeeperHub workflow) as a post-mint follow-up
 * step." That function is `onlyOwner`, so ownership must be transferred to
 * (or the contract deployed with) the wallet address KeeperHub provisions
 * for this org — see docs/integrations/keeperhub-mcp.md.
 *
 * Follows KeeperHub's documented Safe First-Write Sequence:
 *   1. simulate: true   — dry-run, no broadcast, surfaces revert reasons early
 *   2. execute for real — with an Idempotency-Key so a retried request can
 *      never double-submit the same on-chain write
 *   3. poll execution status until it reaches a terminal state
 *
 * Every call also posts a local audit event (trigger / simulation / outcome,
 * with tx hash and gas used once known) to KEEPERHUB_AUDIT_WEBHOOK if
 * configured — KeeperHub's own dashboard already tracks this per-execution,
 * but a local, app-controlled record is worth the one extra fetch.
 *
 * Field names (`network`, `address`, `abiFunction`, `args`) follow the
 * naming KeeperHub uses for its web3/write-contract action config
 * (confirmed via docs.keeperhub.com/ai-tools/mcp-server). The exact request
 * body for the single-call Direct Execution endpoint is documented at
 * docs.keeperhub.com/api/direct-execution — re-check this shape against
 * that page (everything below is isolated in buildExecutionRequestBody()
 * for exactly this reason) before relying on it for a real broadcast.
 *
 * See docs/integrations/keeperhub-mcp.md for setup, auth, and status.
 */

import { Interface } from "ethers";
import { randomUUID } from "crypto";
import { sleep } from "./chain-data/http.js";
import { chainIdFromNetwork } from "./config.js";

export const KEEPERHUB_BASE_URL = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com";
export const KEEPERHUB_API_KEY  = process.env.KEEPERHUB_API_KEY ?? "";

// Shared secret the caller of POST /keeperhub/verify must send back as
// `x-webhook-secret`. This gates a route that (once a real Minted event is
// confirmed) drives a real, gas-spending KeeperHub execution — never leave
// it unset outside local/mock development.
export const KEEPERHUB_WEBHOOK_SECRET = process.env.KEEPERHUB_WEBHOOK_SECRET ?? "";

// Optional: URL that receives {stage, ...} audit events for each Direct
// Execution call — trigger, simulation result, submitted tx, gas used,
// outcome, timestamp, matching the audit-trail shape KeeperHub's own
// platform tracks natively. This is a belt-and-suspenders local record —
// KeeperHub's dashboard already logs the same data per execution — but
// having it land somewhere this app controls too (and can show a judge
// without a KeeperHub login) is worth the one extra fetch call.
export const KEEPERHUB_AUDIT_WEBHOOK = process.env.KEEPERHUB_AUDIT_WEBHOOK ?? "";

async function logAuditEvent(event) {
  if (!KEEPERHUB_AUDIT_WEBHOOK) return;
  try {
    await fetch(KEEPERHUB_AUDIT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
    });
  } catch (err) {
    // Never let audit logging itself break the actual execution flow.
    console.warn("[keeperhub] audit webhook post failed:", err.message);
  }
}

// ProofOfDev.markVerified(uint256) — the primary write call this
// integration makes. Kept as a minimal, single-function ABI fragment
// rather than importing the full contract ABI, since that's all
// KeeperHub needs to encode the call.
const MARK_VERIFIED_ABI = ["function markVerified(uint256 tokenId)"];
const markVerifiedIface = new Interface(MARK_VERIFIED_ABI);

// Ownable2Step.acceptOwnership() — the second step of the ownership
// handoff to KeeperHub's wallet (see scripts/transfer-ownership-to-keeperhub.mjs).
// Reuses the same generic contract-call machinery below rather than a
// second, independently-guessed request shape — that duplication is
// exactly what caused two scripts in this repo to disagree on field names
// until this was fixed.
const ACCEPT_OWNERSHIP_ABI = ["function acceptOwnership()"];
const acceptOwnershipIface = new Interface(ACCEPT_OWNERSHIP_ABI);

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_TIMEOUT_MS  = 2 * 60 * 1000; // 2 minutes

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

  const resp = await fetch(`${KEEPERHUB_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const bodyText = await resp.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  if (!resp.ok) {
    const detail = body && typeof body === "object" ? (body.detail ?? body.error) : body;
    const err = new Error(`KeeperHub ${options.method ?? "GET"} ${path} → HTTP ${resp.status}${detail ? `: ${detail}` : ""}`);
    err.status = resp.status;
    err.body = body;
    throw err;
  }

  return { body, headers: resp.headers };
}

/**
 * Connectivity/auth check against a real, authenticated REST endpoint.
 * (Not `/mcp` — that path is the MCP JSON-RPC transport, which expects a
 * protocol handshake, not a plain GET, so it isn't a meaningful health
 * check on its own.)
 */
export async function checkKeeperhubConnection() {
  const { body } = await keeperhubRequest("/api/api-keys", { method: "GET" });
  return body;
}

/**
 * Builds the calldata for `markVerified(tokenId)`. Pure/offline — no
 * network call, safe to unit test.
 */
export function buildMarkVerifiedCalldata(tokenId) {
  return markVerifiedIface.encodeFunctionData("markVerified", [BigInt(tokenId)]);
}

/**
 * Builds the request body for POST /api/execute/contract-call. This is the
 * ONE place in the repo that constructs this shape — scripts/transfer-
 * ownership-to-keeperhub.mjs previously duplicated this with different,
 * unverified field names (chainId/contractAddress/functionName/functionArgs)
 * and now imports simulateContractCall/executeContractCall from here
 * instead. If the live schema turns out to differ, there's exactly one
 * function to fix, not two to keep in sync.
 *
 * Field names (`network`, `address`, `abiFunction`, `args`) match what
 * docs.keeperhub.com/ai-tools/mcp-server documents for the equivalent
 * web3/write-contract action config ("the abiFunction field is the
 * function as it appears in the contract's ABI") — the same underlying
 * wallet/execution layer, so this is a well-founded inference, not a
 * blind guess, but the exact Direct Execution REST body has not been
 * independently confirmed against a live call. Test with simulate:true
 * before trusting this for a real broadcast.
 */
function buildContractCallRequestBody({ network, contractAddress, abiFunctionSignature, args, calldata, simulate }) {
  const chainId = chainIdFromNetwork(network);
  return {
    network: String(chainId),
    address: contractAddress,
    abiFunction: abiFunctionSignature,
    args: args.map(String),
    data: calldata,
    simulate: Boolean(simulate),
  };
}

/**
 * Generic simulate-only call against POST /api/execute/contract-call.
 * Never broadcasts. Surfaces revert reasons before a real write.
 */
export async function simulateContractCall({ network, contractAddress, abiFunctionSignature, args, calldata }) {
  const { body } = await keeperhubRequest("/api/execute/contract-call", {
    method: "POST",
    body: JSON.stringify(buildContractCallRequestBody({
      network, contractAddress, abiFunctionSignature, args, calldata, simulate: true,
    })),
  });
  return body;
}

/**
 * Generic real-broadcast call against POST /api/execute/contract-call.
 * `idempotencyKey` should be stable per (contract, network, call) so a
 * client retry can never cause a double-submit.
 */
export async function executeContractCall({ network, contractAddress, abiFunctionSignature, args, calldata, idempotencyKey }) {
  const { body } = await keeperhubRequest("/api/execute/contract-call", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey ?? randomUUID() },
    body: JSON.stringify(buildContractCallRequestBody({
      network, contractAddress, abiFunctionSignature, args, calldata, simulate: false,
    })),
  });
  return body; // expected to include an execution id to poll
}

/** Dry-run only — never broadcasts. Surfaces revert reasons before a real write. */
export async function simulateMarkVerified({ network, contractAddress, tokenId }) {
  return simulateContractCall({
    network,
    contractAddress,
    abiFunctionSignature: "function markVerified(uint256 tokenId)",
    args: [tokenId],
    calldata: buildMarkVerifiedCalldata(tokenId),
  });
}

/**
 * Broadcasts the real transaction. `idempotencyKey` should be stable for a
 * given (tokenId, contractAddress, network) so a client retry can never
 * cause a double-submit; verifyMintOnChain() below always passes a
 * deterministic one.
 */
export async function executeMarkVerified({ network, contractAddress, tokenId, idempotencyKey }) {
  return executeContractCall({
    network,
    contractAddress,
    abiFunctionSignature: "function markVerified(uint256 tokenId)",
    args: [tokenId],
    calldata: buildMarkVerifiedCalldata(tokenId),
    idempotencyKey,
  });
}

/**
 * Simulate-only check of acceptOwnership() — used by
 * scripts/transfer-ownership-to-keeperhub.mjs, which deliberately stops
 * after this and never calls the execute counterpart itself (accepting
 * ownership is irreversible and gated behind an explicit human
 * confirmation at a higher level — see scripts/submit-hackathon.mjs).
 */
export async function simulateAcceptOwnership({ network, contractAddress }) {
  return simulateContractCall({
    network,
    contractAddress,
    abiFunctionSignature: "function acceptOwnership()",
    args: [],
    calldata: acceptOwnershipIface.encodeFunctionData("acceptOwnership", []),
  });
}

/** Real broadcast of acceptOwnership() — irreversible, use deliberately. */
export async function executeAcceptOwnership({ network, contractAddress, idempotencyKey }) {
  return executeContractCall({
    network,
    contractAddress,
    abiFunctionSignature: "function acceptOwnership()",
    args: [],
    calldata: acceptOwnershipIface.encodeFunctionData("acceptOwnership", []),
    idempotencyKey,
  });
}

/** GET /api/execute/{id}/status — single poll, no waiting. */
export async function getExecutionStatus(executionId) {
  const { body, headers } = await keeperhubRequest(`/api/execute/${executionId}/status`, { method: "GET" });
  const hintMs = Number(headers.get?.("x-poll-interval-hint"));
  return { ...body, pollIntervalHintMs: Number.isFinite(hintMs) && hintMs > 0 ? hintMs : null };
}

const TERMINAL_STATUSES = new Set(["success", "succeeded", "completed", "failed", "error", "reverted", "cancelled"]);

/** Polls until the execution reaches a terminal state or the timeout elapses. */
export async function pollExecutionUntilDone(executionId, { timeoutMs = DEFAULT_POLL_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  let intervalMs = DEFAULT_POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    const status = await getExecutionStatus(executionId);
    const state = String(status.status ?? "").toLowerCase();

    if (TERMINAL_STATUSES.has(state)) {
      return status;
    }

    intervalMs = status.pollIntervalHintMs ?? intervalMs;
    await sleep(intervalMs);
  }

  throw new Error(`KeeperHub execution ${executionId} did not reach a terminal state within ${timeoutMs}ms`);
}

/**
 * High-level entry point: simulate → execute → poll for one
 * markVerified(tokenId) call. Throws if simulation fails (nothing is
 * broadcast in that case) or if the real execution ultimately fails.
 */
export async function verifyMintOnChain({ network, contractAddress, tokenId }) {
  if (!contractAddress) {
    throw new Error("contractAddress is required (NEXT_PUBLIC_CONTRACT_ADDRESS is unset)");
  }

  await logAuditEvent({ stage: "trigger", network, contractAddress, tokenId, action: "markVerified" });

  const simulation = await simulateMarkVerified({ network, contractAddress, tokenId });
  if (simulation?.success === false || simulation?.willRevert === true) {
    const reason = simulation?.revertReason ?? simulation?.error ?? "simulation indicated the call would fail";
    await logAuditEvent({ stage: "simulation", tokenId, status: "would_revert", reason });
    throw new Error(`KeeperHub simulation failed for markVerified(${tokenId}): ${reason}`);
  }
  await logAuditEvent({ stage: "simulation", tokenId, status: "ok" });

  // Deterministic per (contract, network, tokenId, action) — a retried
  // request for the same token is a no-op on KeeperHub's side rather than
  // a second broadcast.
  const idempotencyKey = `pod-mark-verified-${contractAddress.toLowerCase()}-${network}-${tokenId}`;

  const execution = await executeMarkVerified({ network, contractAddress, tokenId, idempotencyKey });
  const executionId = execution?.id ?? execution?.executionId;
  if (!executionId) {
    await logAuditEvent({ stage: "outcome", tokenId, status: "error", error: "no executionId returned" });
    throw new Error("KeeperHub execute response did not include an execution id to poll");
  }

  const finalStatus = await pollExecutionUntilDone(executionId);
  const state = String(finalStatus.status ?? "").toLowerCase();

  await logAuditEvent({
    stage: "outcome",
    tokenId,
    executionId,
    status: state,
    txHash: finalStatus.txHash ?? finalStatus.transactionHash ?? null,
    gasUsed: finalStatus.gasUsed ?? null,
  });

  if (state === "failed" || state === "error" || state === "reverted") {
    throw new Error(`KeeperHub execution ${executionId} finished with status "${state}"`);
  }

  return { executionId, tokenId, network, status: finalStatus };
}
