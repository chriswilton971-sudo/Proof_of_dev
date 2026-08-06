/**
 * POST /api/mint-verify
 *
 * Called by MintButton.tsx once a mint() transaction is confirmed. Proxies
 * server-side to the worker API's KeeperHub post-mint webhook — keeps
 * KEEPERHUB_WEBHOOK_SECRET off the client, same pattern as /api/worker-status.
 *
 * Body: { txHash: string, contractAddress?: string, network?: string }
 * Response: whatever the worker returns (triggered / 404 / 503 / 502) — this
 * call is best-effort from the UI's perspective (the mint itself already
 * succeeded on-chain regardless of whether this follow-up fires).
 */

import { NextRequest, NextResponse } from "next/server";
import { CONTRACT_ADDRESS } from "@/lib/contract";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8000";
const KEEPERHUB_WEBHOOK_SECRET = process.env.KEEPERHUB_WEBHOOK_SECRET ?? "";

export const runtime = "nodejs";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { txHash, network = "sepolia" } = body as { txHash?: unknown; network?: unknown };

    if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
      return NextResponse.json({ error: "txHash must be a valid transaction hash" }, { status: 400 });
    }

    const res = await fetch(`${WORKER_URL}/webhooks/keeperhub/post-mint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": KEEPERHUB_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ txHash, contractAddress: CONTRACT_ADDRESS, network }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    // Best-effort: never let a KeeperHub automation hiccup look like the
    // mint itself failed — the caller should treat this as informational.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "mint-verify proxy failed" },
      { status: 502 },
    );
  }
}
