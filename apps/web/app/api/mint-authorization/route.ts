/**
 * POST /api/mint-authorization
 *
 * Signs an EIP-712 mint authorization for a wallet's *server-verified*
 * reputation profile. The score is never taken from the request body — it
 * is looked up server-side via the canonical profile store, so a client
 * cannot mint an NFT with a self-reported score.
 *
 * Body: { address: string }
 *
 * Response: MintAuthorizationPayload — pass these fields directly as the
 * mint() call args on ProofOfDev.sol.
 */

import { NextRequest, NextResponse } from "next/server";
import { createMintAuthorization } from "@/lib/mint/mintAuthorizationService";
import { handleApiError } from "@/lib/errors/errorHandler";
import { AppError } from "@/lib/errors/AppError";

export const runtime = "nodejs";

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address } = body as { address?: unknown };

    if (typeof address !== "string" || !ETH_ADDRESS_RE.test(address)) {
      throw AppError.invalidAddress("address must be a valid Ethereum address");
    }

    const payload = await createMintAuthorization(address);
    return NextResponse.json(payload);
  } catch (err) {
    return handleApiError(err);
  }
}
