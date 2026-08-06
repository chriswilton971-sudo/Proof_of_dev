/**
 * POST /api/mint-authorization/sponsored
 *
 * NOT IMPLEMENTED. Always returns 501 SPONSORSHIP_NOT_SUPPORTED.
 *
 * ProofOfDev.mint() uses msg.sender as the recipient (see
 * contracts/ProofOfDev.sol), so a KeeperHub-submitted call would mint the
 * NFT to KeeperHub's wallet instead of the caller's. See the comment on
 * submitSponsoredMint() in lib/mint/mintAuthorizationService.ts for what
 * a contract change to support this would look like.
 *
 * This route exists (rather than being omitted) so the frontend has a
 * stable endpoint to call and gets back a clear, typed error instead of a
 * 404 — callers should fall back to POST /api/mint-authorization.
 */

import { handleApiError } from "@/lib/errors/errorHandler";
import { AppError } from "@/lib/errors/AppError";

export const runtime = "nodejs";

export async function POST() {
  try {
    throw AppError.sponsorshipNotSupported(
      "ProofOfDev.mint() uses msg.sender as the recipient; sponsoring this call " +
        "would mint to KeeperHub's wallet, not the user's. Requires a contract change."
    );
  } catch (err) {
    return handleApiError(err);
  }
}
