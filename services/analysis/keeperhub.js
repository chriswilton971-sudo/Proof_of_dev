/**
 * KeeperHub REST client.
 *
 * Covers: connectivity check, agentic-wallet config guard, workflow
 * execution (trigger -> wait for terminal state -> extract tx hash), and
 * audit-trail webhook logging.
 *
 * Endpoint paths verified against https://docs.keeperhub.com/api directly
 * (2026-08). Two corrections from an earlier draft, in case this file is
 * ever "fixed" back to the wrong shape from an old branch:
 *   1. The base URL is https://app.keeperhub.com with NO /api suffix —
 *      documented paths already include /api (e.g. /api/workflows/{id}).
 *      Do not set KEEPERHUB_BASE_URL to .../api or you get a doubled
 *      /api/api prefix and a 404.
 *   2. There is no "payment mode" field on POST /api/workflows/{id}/execute.
 *      x402/MPP payment routing applies to workflows YOU publish for other
 *      agents to call (see docs.keeperhub.com/workflows/hub), not to how
 *      you trigger your own workflow. Don't reintroduce a `payment` field
 *      in the execute request body — it isn't part of the documented API
 *      and the server has no defined behavior for it.
 *
 * IMPORTANT: KEEPERHUB_WALLET_PRIVATE_KEY is read from process.env only.
 * It is never logged, never included in error messages, and this module
 * never echoes it back in any response. Set it via your host's secret
 * manager (GitHub Actions secrets / Replit Secrets) — never commit it,
 * never print it.
 *
 * See docs/integrations/keeperhub-mcp.md for setup and context.
 */

import { fetchJson } from "./chain-data/http.js";

export const KEEPERHUB_BASE_URL      = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com";
export const KEEPERHUB_MCP_URL       = process.env.KEEPERHUB_MCP_URL ?? `${KEEPERHUB_BASE_URL}/mcp`;
export const KEEPERHUB_API_KEY       = process.env.KEEPERHUB_API_KEY ?? "";
export const KEEPERHUB_AUDIT_WEBHOOK = process.env.KEEPERHUB_AUDIT_WEBHOOK ?? "";

// How long to block waiting for a triggered execution to finish before
// falling back to reporting "still running" rather than a tx hash. The API
// caps this server-side at 60000ms per call (see docs.keeperhub.com/api/executions).
const EXECUTION_WAIT_TIMEOUT_MS = 55000;

// KeeperHub workflow ID that calls ProofOfDev.markVerified(tokenId) as the
// post-mint follow-up step (see contracts/ProofOfDev.sol). Configure this
// once you've created the workflow in the KeeperHub dashboard/API.
export const KEEPERHUB_MARKVERIFIED_WORKFLOW_ID =
  process.env.KEEPERHUB_MARKVERIFIED_WORKFLOW_ID ?? "";

// Shared secret the caller of POST /webhooks/keeperhub/post-mint must send
// back as `x-webhook-secret`. This gates a route that spends real gas via an
// autonomous wallet — never leave it unset outside local/mock development.
export const KEEPERHUB_WEBHOOK_SECRET = process.env.KEEPERHUB_WEBHOOK_SECRET ?? "";

function isPlaceholderKey(val) {
  if (!val || !String(val).trim()) return true;
  const v = String(val).trim();
  return v.includes("your_") || v.includes("_here") || /^0x0+$/.test(v);
}

/** True when KEEPERHUB_API_KEY isn't set to a real value yet. */
export function isKeeperhubConfigured() {
  return !isPlaceholderKey(KEEPERHUB_API_KEY);
}

/**
 * True when a wallet key is present for autonomous signing. Never returns
 * or logs the key itself — callers should only ever check this boolean.
 */
export function isAgenticWalletConfigured() {
  return !isPlaceholderKey(process.env.KEEPERHUB_WALLET_PRIVATE_KEY ?? "");
}

async function keeperhubRequest(path, options = {}) {
  if (!isKeeperhubConfigured()) {
    throw new Error("KEEPERHUB_API_KEY is not configured");
  }

  return fetchJson(`${KEEPERHUB_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Basic connectivity check. Confirms the key/base URL work by listing
 * workflows (cheap, always available with a valid API key) rather than
 * hitting /mcp directly, which speaks the MCP protocol (JSON-RPC/SSE) and
 * isn't a plain REST-with-Bearer status endpoint.
 */
export async function checkKeeperhubConnection() {
  return keeperhubRequest("/api/workflows", { method: "GET" });
}

/**
 * Best-effort audit log post. Failures here never block the caller —
 * audit logging is observability, not a transaction gate.
 */
export async function logAuditEvent(event) {
  if (!KEEPERHUB_AUDIT_WEBHOOK) return { skipped: true };
  const entry = { timestamp: new Date().toISOString(), ...event };
  try {
    await fetchJson(KEEPERHUB_AUDIT_WEBHOOK, {
      method: "POST",
      body: JSON.stringify(entry),
    });
    return { logged: true };
  } catch (err) {
    console.error("[keeperhub] audit webhook failed:", err.message);
    return { logged: false, error: err.message };
  }
}

/**
 * Trigger a workflow execution and block until it reaches a terminal state,
 * per KeeperHub's own audit-trail model (trigger, submitted tx, gas used,
 * outcome, timestamp) — every call is audit-logged regardless of outcome.
 *
 * Two-step under the hood: POST .../execute only returns { executionId,
 * status: "running" } — it does NOT return a tx hash synchronously. The
 * hash only appears once the execution finishes, via GET
 * .../executions/{id}/wait. See docs.keeperhub.com/api/workflows and
 * docs.keeperhub.com/api/executions.
 *
 * @param {object} params
 * @param {string} params.workflowId - KeeperHub workflow identifier.
 * @param {object} params.input - Payload for the workflow's trigger.
 */
export async function executeWorkflow({ workflowId, input }) {
  if (!isAgenticWalletConfigured()) {
    throw new Error(
      "KEEPERHUB_WALLET_PRIVATE_KEY is not configured — refusing to submit " +
      "an autonomous workflow execution without a signing key."
    );
  }

  await logAuditEvent({ stage: "trigger", workflowId, input });

  try {
    const triggered = await keeperhubRequest(`/api/workflows/${workflowId}/execute`, {
      method: "POST",
      body: JSON.stringify({ input }),
    });

    const executionId = triggered?.executionId;
    if (!executionId) {
      throw new Error(`Execute returned no executionId: ${JSON.stringify(triggered)}`);
    }

    const receipt = await keeperhubRequest(
      `/api/workflows/executions/${executionId}/wait?timeoutMs=${EXECUTION_WAIT_TIMEOUT_MS}`,
      { method: "GET" },
    );

    if (receipt.status === "error") {
      throw new Error(receipt.error || `Execution ${executionId} failed`);
    }

    // transactionHashes is ordered; a single-tx workflow (our markVerified
    // case) has exactly one entry once the run completes.
    const txHash = receipt.transactionHashes?.[0]?.hash ?? null;

    await logAuditEvent({
      stage: "outcome",
      workflowId,
      executionId,
      status: receipt.completed ? receipt.status : "timed_out_still_running",
      txHash,
      gasUsedWei: receipt.gasUsedWei ?? null,
    });

    return {
      executionId,
      status: receipt.status,
      completed: receipt.completed,
      txHash,
      gasUsedWei: receipt.gasUsedWei ?? null,
    };
  } catch (err) {
    await logAuditEvent({
      stage: "outcome",
      workflowId,
      status: "error",
      error: err.message,
    });
    throw err;
  }
}

/**
 * The actual post-mint automation: after a Minted event is confirmed
 * on-chain (see chain-data/mintEvents.js — callers must verify this before
 * calling here), route a markVerified(tokenId) execution request through
 * KeeperHub via executeWorkflow().
 *
 * This is the one place in the app that turns "we saw a mint" into "we
 * asked KeeperHub to land a follow-up transaction" — the whole point of
 * the KeeperHub integration.
 *
 * @param {{ tokenId: string, account: string, mintTxHash: string }} params
 */
export async function triggerPostMintVerification({ tokenId, account, mintTxHash }) {
  if (!KEEPERHUB_MARKVERIFIED_WORKFLOW_ID) {
    throw new Error(
      "KEEPERHUB_MARKVERIFIED_WORKFLOW_ID is not configured — create the " +
      "markVerified workflow in KeeperHub and set its ID before calling this.",
    );
  }

  return executeWorkflow({
    workflowId: KEEPERHUB_MARKVERIFIED_WORKFLOW_ID,
    input: { tokenId, account, mintTxHash },
  });
}
