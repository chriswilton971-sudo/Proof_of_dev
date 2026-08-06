/**
 * KeeperHub MCP/REST client (apps/web side).
 *
 * Mirrors services/analysis/keeperhub.js so both apps read the same env
 * vars and behave the same way. This client is what the *sponsored*
 * (opt-in, gasless-for-the-user) attestation and mint paths use — the
 * default user-pays-gas paths are untouched and don't import this file.
 *
 * IMPORTANT: KEEPERHUB_WALLET_PRIVATE_KEY is read from process.env only,
 * server-side. It is never logged, never returned in an API response, and
 * never sent to the client. Set it via your host's secret manager
 * (Vercel/Next env, GitHub Actions secrets, Replit Secrets) — never commit
 * a real value.
 *
 * See docs/integrations/keeperhub-mcp.md.
 */

import { logger } from "@/lib/logger";

const KEEPERHUB_BASE_URL = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com";
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY ?? "";
const KEEPERHUB_AUDIT_WEBHOOK = process.env.KEEPERHUB_AUDIT_WEBHOOK ?? "";

// "dual" | "x402" | "mpp" — dual lets KeeperHub auto-select per call.
const KEEPERHUB_PAYMENT_MODE = process.env.KEEPERHUB_PAYMENT_MODE ?? "x402";

const KEEPERHUB_PAYMENT_PREF = (process.env.KEEPERHUB_PAYMENT_PREF ?? "x402,mpp")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isPlaceholder(val: string | undefined): boolean {
  if (!val || !val.trim()) return true;
  const v = val.trim();
  return v.includes("your_") || v.includes("_here") || /^0x0+$/.test(v);
}

/** True when KEEPERHUB_API_KEY isn't set to a real value yet. */
export function isKeeperhubConfigured(): boolean {
  return !isPlaceholder(KEEPERHUB_API_KEY);
}

/**
 * True when a wallet key is present for autonomous signing. Never returns
 * or logs the key itself — callers should only ever check this boolean.
 * Used to gate the sponsored (opt-in) submission paths: if this is false,
 * those endpoints fail closed rather than silently falling back to
 * anything that could touch a real key.
 */
export function isAgenticWalletConfigured(): boolean {
  return !isPlaceholder(process.env.KEEPERHUB_WALLET_PRIVATE_KEY);
}

interface AuditEvent {
  stage: "trigger" | "outcome";
  workflowId: string;
  [key: string]: unknown;
}

/** Best-effort audit log post. Never blocks or throws for the caller. */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  if (!KEEPERHUB_AUDIT_WEBHOOK) return;
  try {
    await fetch(KEEPERHUB_AUDIT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp: new Date().toISOString(), ...event }),
    });
  } catch (err) {
    logger.warn("[keeperhub] audit webhook failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface KeeperhubExecuteResult {
  txHash?: string;
  gasUsed?: string;
  protocol?: "x402" | "mpp";
  [key: string]: unknown;
}

/**
 * Submit a workflow execution to KeeperHub, letting it route the payment
 * over x402 or MPP per KEEPERHUB_PAYMENT_MODE, and audit-logs trigger +
 * outcome regardless of success/failure.
 *
 * Throws if the agentic wallet isn't configured — sponsored submission
 * must fail closed, never silently no-op or fall back to something else.
 */
export async function executeWorkflow(
  workflowId: string,
  input: Record<string, unknown>
): Promise<KeeperhubExecuteResult> {
  if (!isKeeperhubConfigured()) {
    throw new Error("KEEPERHUB_API_KEY is not configured");
  }
  if (!isAgenticWalletConfigured()) {
    throw new Error(
      "KEEPERHUB_WALLET_PRIVATE_KEY is not configured — refusing to submit " +
        "a sponsored transaction without a signing key."
    );
  }

  const paymentMode =
    KEEPERHUB_PAYMENT_MODE === "dual"
      ? { mode: "dual", preference: KEEPERHUB_PAYMENT_PREF }
      : { mode: KEEPERHUB_PAYMENT_MODE };

  await logAuditEvent({ stage: "trigger", workflowId, paymentMode });

  try {
    const res = await fetch(`${KEEPERHUB_BASE_URL}/v1/workflows/${workflowId}/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input, payment: paymentMode }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`KeeperHub execute failed: ${res.status} ${text}`.trim());
    }

    const result = (await res.json()) as KeeperhubExecuteResult;

    await logAuditEvent({
      stage: "outcome",
      workflowId,
      status: "success",
      txHash: result.txHash ?? null,
      gasUsed: result.gasUsed ?? null,
      protocolUsed: result.protocol ?? null,
    });

    return result;
  } catch (err) {
    await logAuditEvent({
      stage: "outcome",
      workflowId,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
