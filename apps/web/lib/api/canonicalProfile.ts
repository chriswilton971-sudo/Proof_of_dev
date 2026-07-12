/**
 * Canonical profile fetcher — the single source of truth for "what score
 * does this address actually have?"
 *
 * Both /api/attest (EAS) and /api/mint-authorization (on-chain NFT) sign
 * something on the server's behalf. Neither may trust a `profile` object
 * supplied in the request body: a client could submit any score it likes.
 * Instead both routes call this helper, which proxies to the worker API's
 * GET /profile/:address — the same MongoDB-backed result the public
 * profile page reads from — and sign only what comes back from there.
 */

import { PublicProfileResponse } from "@/lib/types";
import { AppError } from "@/lib/errors/AppError";

const WORKER_URL = process.env.WORKER_URL ?? "http://localhost:8000";
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function fetchCanonicalProfile(
  address: string,
  network: "mainnet" | "sepolia"
): Promise<PublicProfileResponse> {
  if (!ETH_ADDRESS_RE.test(address)) {
    throw AppError.invalidAddress("address must be a valid Ethereum address");
  }

  const url = new URL(`${WORKER_URL}/profile/${address}`);
  url.searchParams.set("network", network);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw AppError.workerUnavailable();
  }

  if (res.status === 404) {
    throw AppError.profileNotFound(
      `No stored analysis for ${address} on ${network}. Run an analysis first.`
    );
  }

  if (!res.ok) {
    let detail = "Failed to fetch profile";
    try {
      const body = await res.json();
      if (typeof body?.error === "string") detail = body.error;
    } catch {
      // ignore parse failure, use default detail
    }
    throw AppError.internal(detail);
  }

  return (await res.json()) as PublicProfileResponse;
}
