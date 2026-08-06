/**
 * POST /api/mint-authorization/sponsored
 *
 * Opt-in alternative to POST /api/mint-authorization. Instead of returning
 * a signature for the user's own wallet to submit as mint(), this submits
 * the mint transaction on-chain directly via KeeperHub's agentic wallet
 * (gas paid by KeeperHub, settled over x402/MPP).
 *
 * Separate endpoint by design — the default stays non-custodial, and
 * sponsorship only happens when a caller explicitly hits this route.
 *
 * Body: { address: string }
 * Response: { txHash?: string, ... } — whatever KeeperHub's execute
 * response contains. 503 SPONSORSHIP_UNAVAILABLE if KeeperHub isn't
 * configured; the caller should fall back to POST /api/mint-authorization.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitSponsoredMint } from "@/lib/mint/mintAuthorizationService";
import { isAgenticWalletConfigured } from "@/lib/keeperhub/client";
import { handleApiError } from "@/lib/errors/errorHandler";
import { AppError } from "@/lib/errors/AppError";

export const runtime = "nodejs";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: NextRequest) {
  try {
    if (!isAgenticWalletConfigured()) {
      throw AppError.sponsorshipUnavailable(
        "KEEPERHUB_WALLET_PRIVATE_KEY is not configured"
      );
    }

    const body = await req.json();
    const { address } = body as { address?: unknown };

    if (typeof address !== "string" || !ETH_ADDRESS_RE.test(address)) {
      throw AppError.invalidAddress("address must be a valid Ethereum address");
    }

    const result = await submitSponsoredMint(address);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
