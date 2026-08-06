/**
 * EAS Attestation Service — server-side delegated attestation.
 *
 * Flow:
 *   1. Server signs a delegated attestation using ATTESTER_PRIVATE_KEY.
 *   2. The signed payload is returned to the client.
 *   3. The client submits the tx on-chain (user pays gas).
 *
 * This means:
 *   - The server vouches for the data it computed (its signature is the proof).
 *   - The user controls submission — they decide when/whether to publish.
 *   - The server never holds user funds or submits transactions on their behalf.
 *
 * Required env var (server-side only, never exposed to client):
 *   ATTESTER_PRIVATE_KEY — private key of the attester wallet.
 *   This wallet signs attestations but does NOT need ETH (user pays gas).
 */

import { EAS, SchemaEncoder, NO_EXPIRATION } from "@ethereum-attestation-service/eas-sdk";
import { ethers } from "ethers";
import { EAS_CONFIG } from "./config";
import { PublicProfileResponse } from "@/lib/types";
import { logger } from "@/lib/logger";
import { executeWorkflow, isAgenticWalletConfigured, KeeperhubExecuteResult } from "@/lib/keeperhub/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DelegatedAttestationPayload {
  /** EAS contract address on Sepolia */
  easContractAddress: string;
  /** Schema UID */
  schemaUID: string;
  /** Recipient wallet address */
  recipient: string;
  /** ABI-encoded attestation data */
  encodedData: string;
  /** EIP-712 signature from the server attester */
  signature: { r: string; s: string; v: number };
  /** Server attester address (for on-chain verification) */
  attester: string;
  /** Deadline for the delegated signature (0 = no expiry) */
  deadline: bigint;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAttesterSigner(): ethers.Wallet {
  const privateKey = process.env.ATTESTER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "ATTESTER_PRIVATE_KEY is not set. Add it to .env.local to enable EAS attestations."
    );
  }
  const provider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY ?? ""}`
  );
  return new ethers.Wallet(privateKey, provider);
}

function encodeAttestationData(profile: PublicProfileResponse): string {
  const { schemaString } = EAS_CONFIG.sepolia;
  const encoder = new SchemaEncoder(schemaString);

  return encoder.encodeData([
    { name: "score",                  value: BigInt(profile.score),                    type: "uint256" },
    { name: "contractCount",          value: BigInt(profile.contractCount),            type: "uint256" },
    { name: "verifiedContractCount",  value: BigInt(profile.verifiedContractCount),    type: "uint256" },
    { name: "hasENS",                 value: Boolean(profile.ensName),                 type: "bool"    },
    { name: "tier",                   value: profile.tier,                             type: "string"  },
    { name: "analyzedAt",             value: BigInt(Math.floor(Date.now() / 1000)),    type: "uint256" },
  ]);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a delegated EAS attestation signed by the server attester.
 * Returns the signed payload for the client to submit on-chain.
 *
 * `profile` must be the canonical, server-verified profile (see
 * lib/api/canonicalProfile.ts) — never a value taken directly from a
 * client request body, or the server would be attesting to whatever
 * score the caller feels like claiming.
 */
export async function createDelegatedAttestation(
  recipient: string,
  profile: PublicProfileResponse
): Promise<DelegatedAttestationPayload> {
  const { easContractAddress, schemaUID } = EAS_CONFIG.sepolia;

  if (!schemaUID) {
    throw new Error(
      "EAS schema UID not configured. Run scripts/registerSchema.ts and set NEXT_PUBLIC_EAS_SCHEMA_UID."
    );
  }

  const signer = getAttesterSigner();
  const eas = new EAS(easContractAddress);
  eas.connect(signer);

  const encodedData = encodeAttestationData(profile);
  const delegated = await eas.getDelegated();

  logger.info("[eas] Signing delegated attestation", { recipient, score: profile.score });

  const response = await delegated.signDelegatedAttestation(
    {
      schema: schemaUID,
      recipient,
      expirationTime: NO_EXPIRATION,
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodedData,
      deadline: NO_EXPIRATION,
      value: 0n,
    },
    signer
  );

  logger.info("[eas] Delegated attestation signed", { recipient });

  return {
    easContractAddress,
    schemaUID,
    recipient,
    encodedData,
    signature: {
      r: response.signature.r,
      s: response.signature.s,
      v: response.signature.v,
    },
    attester: await signer.getAddress(),
    deadline: NO_EXPIRATION,
  };
}

// ─── Sponsored (opt-in, gasless-for-the-user) submission ──────────────────────

/**
 * Opt-in alternative to createDelegatedAttestation(): instead of returning a
 * signature for the user's own wallet to submit, this routes the attestation
 * through KeeperHub's agentic wallet, which pays gas and submits the
 * transaction on the user's behalf (settled via x402/MPP).
 *
 * The default createDelegatedAttestation() flow above is untouched and stays
 * the default — this only runs when a caller explicitly opts in (see
 * POST /api/attest/sponsored) and only when KEEPERHUB_WALLET_PRIVATE_KEY is
 * actually configured; otherwise it throws rather than silently falling
 * back to some other signer.
 *
 * KEEPERHUB_ATTEST_WORKFLOW_ID must point at a workflow configured in the
 * KeeperHub dashboard that knows how to build and submit an EAS attest()
 * call from these fields — this function does not encode calldata itself,
 * it hands KeeperHub the same data createDelegatedAttestation() would sign.
 */
export async function submitSponsoredAttestation(
  recipient: string,
  profile: PublicProfileResponse
): Promise<KeeperhubExecuteResult> {
  if (!isAgenticWalletConfigured()) {
    throw new Error(
      "Sponsored attestation requires KEEPERHUB_WALLET_PRIVATE_KEY to be configured."
    );
  }

  const workflowId = process.env.KEEPERHUB_ATTEST_WORKFLOW_ID;
  if (!workflowId) {
    throw new Error(
      "KEEPERHUB_ATTEST_WORKFLOW_ID is not set. Create the attest workflow in " +
        "the KeeperHub dashboard and set its ID here."
    );
  }

  const { easContractAddress, schemaUID } = EAS_CONFIG.sepolia;
  if (!schemaUID) {
    throw new Error("EAS schema UID not configured.");
  }

  const encodedData = encodeAttestationData(profile);

  logger.info("[eas] Submitting sponsored attestation via KeeperHub", {
    recipient,
    score: profile.score,
  });

  const result = await executeWorkflow(workflowId, {
    easContractAddress,
    schemaUID,
    recipient,
    encodedData,
    expirationTime: NO_EXPIRATION.toString(),
    revocable: true,
    refUID: ethers.ZeroHash,
  });

  logger.info("[eas] Sponsored attestation submitted", {
    recipient,
    txHash: result.txHash ?? null,
  });

  return result;
}
