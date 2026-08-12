#!/usr/bin/env node
/**
 * scripts/derive-submission.mjs
 *
 * Safe helper: looks up the on-chain tokenId for the hardcoded submitter
 * address and prints a submission object to stdout.
 *
 * Usage:
 *   node scripts/derive-submission.mjs [--write-file <path>]
 *
 * Requires (.env.local): NEXT_PUBLIC_CONTRACT_ADDRESS, and either
 * NEXT_PUBLIC_ALCHEMY_API_KEY (preferred) or RPC_URL.
 *
 * This script is read-only and will never broadcast transactions.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUBMITTER = "0x700f0Cf10B7daD38D025DB8BF18f1F03294ffB74";
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
const RPC_URL = process.env.RPC_URL;

if (!CONTRACT_ADDRESS) {
  console.error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local");
  process.exit(1);
}

if (!ALCHEMY_KEY && !RPC_URL) {
  console.error("Missing NEXT_PUBLIC_ALCHEMY_API_KEY or RPC_URL in .env.local");
  process.exit(1);
}

const provider = ALCHEMY_KEY
  ? new ethers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`)
  : new ethers.JsonRpcProvider(RPC_URL);

const ABI = ["function getTokenByAddress(address) view returns (uint256)"];

async function main() {
  try {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    if (!ethers.isAddress(SUBMITTER)) {
      console.error("Hardcoded submitter address is not a valid Ethereum address.");
      process.exit(1);
    }

    console.info(`Querying contract ${CONTRACT_ADDRESS} for tokenId of ${SUBMITTER}...`);
    const tokenIdBig = await contract.getTokenByAddress(SUBMITTER);
    // tokenIdBig may be a BigNumber; convert to string for safety
    const tokenId = tokenIdBig?.toString ? tokenIdBig.toString() : String(tokenIdBig);

    if (tokenId === "0" || tokenId === "0" ) {
      console.warn(`No token found on-chain for ${SUBMITTER} (returned tokenId ${tokenId}).`);
    }

    const submission = {
      submitter: SUBMITTER,
      tokenId: Number(tokenId) || 0,
      timestamp: new Date().toISOString(),
    };

    const writeIndex = process.argv.indexOf("--write-file");
    if (writeIndex !== -1 && process.argv.length > writeIndex + 1) {
      const outPath = process.argv[writeIndex + 1];
      fs.writeFileSync(outPath, JSON.stringify(submission, null, 2) + "\n", "utf8");
      console.info(`Wrote submission to ${outPath}`);
    }

    console.log(JSON.stringify(submission, null, 2));
  } catch (err) {
    console.error("Failed to derive tokenId:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
