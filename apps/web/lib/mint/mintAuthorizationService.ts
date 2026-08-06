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
 * NOT IMPLEMENTED — see reasoning below before wiring this up.
 *
 * ProofOfDev.mint() uses msg.sender as the recipient (`_tokens[msg.sender]`),
 * not an explicit parameter — see contracts/ProofOfDev.sol. If KeeperHub's
 * org wallet called mint() on a user's behalf, the NFT would be minted to
 * KeeperHub's wallet, not the user's. There is no safe way to sponsor this
 * specific call against the currently deployed contract.
 *
 * To actually support sponsored minting, the contract needs a variant like:
 *
 *   function mintFor(address recipient, uint256 score, ...) external {
 *       if (_tokens[recipient] != 0) revert AlreadyMinted();
 *       _authorize(MINT_TYPEHASH, recipient, score, ...); // bind recipient into the signed hash
 *       ...
 *       _mint(recipient, tokenId);
 *   }
 *
 * which also means the EIP-712 typed-data struct createMintAuthorization()
 * signs needs a `recipient` field added to MINT_TYPEHASH, so a signed
 * authorization can't be replayed for a different recipient. That's a
 * contract + redeploy + re-signing-service change, not just API wiring —
 * flagging it rather than shipping a call that would silently mint to the
 * wrong address.
 */
export async function submitSponsoredMint(): Promise<never> {
  throw new Error(
    "Sponsored mint is not supported: ProofOfDev.mint() uses msg.sender as the " +
      "recipient, so a KeeperHub-submitted call would mint to KeeperHub's wallet " +
      "instead of the user's. Requires a contract change (see comment above) " +
      "before this can be wired up. Use POST /api/mint-authorization instead."
  );
}
