/**
 * POST /api/attest/sponsored
 *
 * Opt-in alternative to POST /api/attest. Instead of returning a signature
 * for the user's own wallet to submit, this submits the attestation
 * on-chain directly via KeeperHub's agentic wallet (gas paid by KeeperHub,
 * settled over x402/MPP) — the user pays nothing and signs nothing.
 *
 * This is intentionally a separate endpoint, not a flag on /api/attest:
 * the default stays non-custodial, and sponsored submission only happens
 * when a caller explicitly hits this route.
 *
 * Body: { address: string }
 * Response: { txHash?: string, ... } — whatever KeeperHub's execute
 * response contains. 503 SPONSORSHIP_UNAVAILABLE if KeeperHub isn't
 * configured; the caller should fall back to POST /api/attest in that case.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitSponsoredAttestation } from "@/lib/eas/attestationService";
import { fetchCanonicalProfile } from "@/lib/api/canonicalProfile";
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

    const normalizedAddress = address.toLowerCase();
    const profile = await fetchCanonicalProfile(normalizedAddress, "sepolia");
    const result = await submitSponsoredAttestation(normalizedAddress, profile);

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
