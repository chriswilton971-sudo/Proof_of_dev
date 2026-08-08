/**
 * POST /api/keeperhub/verify
 *
 * Called by MintButton.tsx once a mint() transaction is confirmed. Proxies
 * server-side to the worker's /keeperhub/verify endpoint, which independently
 * re-verifies the Minted event on-chain (never trusts a client-supplied
 * tokenId) before driving KeeperHub's simulate → execute → poll sequence to
 * call markVerified(tokenId) on the deployed ProofOfDev contract.
 *
 * Keeps both the worker's KEEPERHUB_API_KEY and the shared
 * KEEPERHUB_WEBHOOK_SECRET server-side only — neither is ever exposed to
 * the browser.
 *
 * Body: { txHash: string, network?: "sepolia" }
 * Response: whatever the worker returns (triggered / 404 / 503 / 502) — this
 * call is best-effort from the UI's perspective; the mint itself already
 * succeeded on-chain regardless of whether this follow-up fires.
 */

import { NextRequest, NextResponse } from "next/server";
import { CONTRACT_ADDRESS } from "@/lib/contract";

export const runtime = "nodejs";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8000";
const KEEPERHUB_WEBHOOK_SECRET = process.env.KEEPERHUB_WEBHOOK_SECRET ?? "";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { txHash, network = "sepolia" } = body as { txHash?: unknown; network?: unknown };

    if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
      return NextResponse.json({ error: "txHash must be a valid transaction hash" }, { status: 400 });
    }

    const res = await fetch(`${WORKER_URL}/keeperhub/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": KEEPERHUB_WEBHOOK_SECRET,
      },
      body: JSON.stringify({ txHash, contractAddress: CONTRACT_ADDRESS, network }),
      signal: AbortSignal.timeout(3 * 60 * 1000), // matches the worker's own poll timeout
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    // Best-effort: never let a KeeperHub automation hiccup look like the
    // mint itself failed — the caller should treat this as informational.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "keeperhub verify proxy failed" },
      { status: 502 },
    );
  }
}
