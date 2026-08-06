/**
 * Mint authorization service — signs the EIP-712 payload the ProofOfDev
 * contract's mint() requires.
 *
 * Flow:
 *   1. Server fetches the canonical (MongoDB-backed) profile for the address —
 *      never trusts a client-supplied score.
 *   2. Server signs an EIP-712 "MintAuthorization" typed message binding that
 *      score to the recipient address and a short-lived deadline.
 *   3. Client submits the signature on-chain via mint(); the contract
 *      recovers the signer and checks it against `trustedSigner`.
 *
 * The typed-data domain and struct here MUST match contracts/ProofOfDev.sol
 * exactly — name, version, chainId, verifyingContract, and field order/types
 * all feed into the EIP-712 hash. If you change one side, change both.
 *
 * Required env var (server-side only, never exposed to client):
 *   MINT_SIGNER_PRIVATE_KEY — private key of the trustedSigner wallet set on
 *   the deployed contract. This wallet does NOT need ETH (it only signs off
 *   -chain; the user's wallet pays gas for the mint transaction itself).
 */

import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "@/lib/contract";
import { fetchCanonicalProfile } from "@/lib/api/canonicalProfile";
import { logger } from "@/lib/logger";
import { executeWorkflow, isAgenticWalletConfigured, KeeperhubExecuteResult } from "@/lib/keeperhub/client";

// Sepolia — the only network the ProofOfDev NFT is deployed on today.
const MINT_CHAIN_ID = 11155111;
const AUTHORIZATION_TTL_SECONDS = 15 * 60; // 15 minutes

export interface MintAuthorizationPayload {
  score: string;
  contractCount: string;
  verifiedContractCount: string;
  hasENS: boolean;
  deadline: string;
  signature: { v: number; r: string; s: string };
}

function getSigner(): ethers.Wallet {
  const privateKey = process.env.MINT_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "MINT_SIGNER_PRIVATE_KEY is not set. Add it to .env.local to enable minting. " +
        "It must match the trustedSigner address passed to the contract constructor."
    );
  }
  // No provider needed — this wallet only signs typed data, it never sends a tx.
  return new ethers.Wallet(privateKey);
}

/**
 * Fetches the canonical profile for `address` and signs a mint authorization
 * for it. Throws AppError.profileNotFound if no analysis is on record.
 */
export async function createMintAuthorization(
  address: string
): Promise<MintAuthorizationPayload> {
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error("Contract not deployed yet — NEXT_PUBLIC_CONTRACT_ADDRESS is unset.");
  }

  const recipient = address.toLowerCase();
  const profile = await fetchCanonicalProfile(recipient, "sepolia");

  const score = BigInt(Math.max(0, Math.trunc(profile.score)));
  const contractCount = BigInt(profile.contractCount);
  const verifiedContractCount = BigInt(profile.verifiedContractCount);
  const hasENS = Boolean(profile.ensName);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + AUTHORIZATION_TTL_SECONDS);

  const signer = getSigner();

  const domain = {
    name: "ProofOfDev",
    version: "1",
    chainId: MINT_CHAIN_ID,
    verifyingContract: CONTRACT_ADDRESS,
  };

  // Field order/types must match the contract's MintAuthorization typehash exactly.
  const types = {
    MintAuthorization: [
      { name: "recipient", type: "address" },
      { name: "score", type: "uint256" },
      { name: "contractCount", type: "uint256" },
      { name: "verifiedContractCount", type: "uint256" },
      { name: "hasENS", type: "bool" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const value = {
    recipient,
    score,
    contractCount,
    verifiedContractCount,
    hasENS,
    deadline,
  };

  logger.info("[mint] Signing mint authorization", { recipient, score: score.toString() });

  const rawSignature = await signer.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(rawSignature);

  logger.info("[mint] Mint authorization signed", { recipient });

  return {
    score: score.toString(),
    contractCount: contractCount.toString(),
    verifiedContractCount: verifiedContractCount.toString(),
    hasENS,
    deadline: deadline.toString(),
    signature: { v, r, s },
  };
}

// ─── Sponsored (opt-in, gasless-for-the-user) submission ──────────────────────

/**
 * Opt-in alternative to createMintAuthorization(): instead of returning a
 * signature for the user's own wallet to submit as mint(), this routes the
 * mint call through KeeperHub's agentic wallet, which pays gas and submits
 * on the user's behalf (settled via x402/MPP).
 *
 * The default createMintAuthorization() flow above is untouched and stays
 * the default — this only runs on explicit opt-in (see
 * POST /api/mint-authorization/sponsored) and only when
 * KEEPERHUB_WALLET_PRIVATE_KEY is configured; otherwise it throws.
 *
 * This still signs the same EIP-712 MintAuthorization the contract expects
 * (the contract's trustedSigner check doesn't care who submits the tx, only
 * who signed the authorization) — KeeperHub is just the submitter, not a
 * replacement for MINT_SIGNER_PRIVATE_KEY.
 *
 * KEEPERHUB_MINT_WORKFLOW_ID must point at a workflow configured in the
 * KeeperHub dashboard that calls ProofOfDev.mint(recipient, score,
 * contractCount, verifiedContractCount, hasENS, deadline, signature).
 */
export async function submitSponsoredMint(address: string): Promise<KeeperhubExecuteResult> {
  if (!isAgenticWalletConfigured()) {
    throw new Error(
      "Sponsored mint requires KEEPERHUB_WALLET_PRIVATE_KEY to be configured."
    );
  }

  const workflowId = process.env.KEEPERHUB_MINT_WORKFLOW_ID;
  if (!workflowId) {
    throw new Error(
      "KEEPERHUB_MINT_WORKFLOW_ID is not set. Create the mint workflow in " +
        "the KeeperHub dashboard and set its ID here."
    );
  }

  // Reuses the exact same signed authorization the user-pays flow produces —
  // the trustedSigner check on-chain is about who signed, not who submits.
  const authorization = await createMintAuthorization(address);

  logger.info("[mint] Submitting sponsored mint via KeeperHub", {
    recipient: address.toLowerCase(),
  });

  const result = await executeWorkflow(workflowId, {
    contractAddress: CONTRACT_ADDRESS,
    recipient: address.toLowerCase(),
    ...authorization,
  });

  logger.info("[mint] Sponsored mint submitted", {
    recipient: address.toLowerCase(),
    txHash: result.txHash ?? null,
  });

  return result;
}
