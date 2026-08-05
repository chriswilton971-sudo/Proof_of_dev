/**
 * KeeperHub MCP/REST client.
 *
 * Covers: connectivity check, agentic-wallet config guard, dual x402/MPP
 * payment routing, and audit-trail webhook logging.
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

// "dual" | "x402" | "mpp" — dual lets KeeperHub auto-select per call.
export const KEEPERHUB_PAYMENT_MODE = process.env.KEEPERHUB_PAYMENT_MODE ?? "x402";

// Ordered preference list used only when PAYMENT_MODE is "dual".
export const KEEPERHUB_PAYMENT_PREF = (process.env.KEEPERHUB_PAYMENT_PREF ?? "x402,mpp")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
 * Basic connectivity check against the MCP endpoint's status info.
 * Not a real workflow call — just confirms the key/base URL work.
 */
export async function checkKeeperhubConnection() {
  return keeperhubRequest("/mcp", { method: "GET" });
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
 * Submit an execution request and let KeeperHub route it over x402 or MPP
 * depending on KEEPERHUB_PAYMENT_MODE. Every call is audit-logged
 * regardless of outcome (trigger + result), per KeeperHub's own audit-trail
 * model (trigger, simulation, submitted tx, gas used, outcome, timestamp).
 *
 * @param {object} params
 * @param {string} params.workflowId - KeeperHub workflow/action identifier.
 * @param {object} params.input - Payload for the workflow.
 */
export async function executeWorkflow({ workflowId, input }) {
  if (!isAgenticWalletConfigured()) {
    throw new Error(
      "KEEPERHUB_WALLET_PRIVATE_KEY is not configured — refusing to submit " +
      "an autonomous-payment workflow without a signing key."
    );
  }

  const paymentMode = KEEPERHUB_PAYMENT_MODE === "dual"
    ? { mode: "dual", preference: KEEPERHUB_PAYMENT_PREF }
    : { mode: KEEPERHUB_PAYMENT_MODE };

  await logAuditEvent({ stage: "trigger", workflowId, paymentMode });

  try {
    const result = await keeperhubRequest(`/v1/workflows/${workflowId}/execute`, {
      method: "POST",
      body: JSON.stringify({ input, payment: paymentMode }),
    });

    await logAuditEvent({
      stage: "outcome",
      workflowId,
      status: "success",
      txHash: result?.txHash ?? null,
      gasUsed: result?.gasUsed ?? null,
      protocolUsed: result?.protocol ?? null, // "x402" | "mpp"
    });

    return result;
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
