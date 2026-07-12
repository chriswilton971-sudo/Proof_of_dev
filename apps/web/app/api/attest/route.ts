/**
 * POST /api/attest
 *
 * Signs a delegated EAS attestation for a wallet's *server-verified*
 * reputation profile. The score is looked up server-side via the canonical
 * profile store — a client-supplied `profile` object is never trusted,
 * since the server's signature is what makes the attestation meaningful.
 *
 * Body: {
 *   address: string   — wallet to attest
 * }
 *
 * Response: DelegatedAttestationPayload (signature + encoded data)
 */

import { NextRequest, NextResponse } from "next/server";
import { createDelegatedAttestation } from "@/lib/eas/attestationService";
import { fetchCanonicalProfile } from "@/lib/api/canonicalProfile";
import { handleApiError } from "@/lib/errors/errorHandler";
import { AppError } from "@/lib/errors/AppError";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { address } = body as { address?: unknown };

    if (
      typeof address !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(address)
    ) {
      throw AppError.invalidAddress("address must be a valid Ethereum address");
    }

    const normalizedAddress = address.toLowerCase();
    const profile = await fetchCanonicalProfile(normalizedAddress, "sepolia");
    const payload = await createDelegatedAttestation(normalizedAddress, profile);

    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err);
  }
}
