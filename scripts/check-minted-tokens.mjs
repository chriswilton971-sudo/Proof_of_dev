/**
 * scripts/check-minted-tokens.mjs
 *
 * Read-only — no private key, no gas, no state change. Answers "has
 * anything been minted yet, and is any of it already verified?" before
 * deciding whether a fresh mint is actually needed for the hackathon demo.
 *
 * Usage:
 *   node scripts/check-minted-tokens.mjs
 *
 * Required env: NEXT_PUBLIC_ALCHEMY_API_KEY, NEXT_PUBLIC_CONTRACT_ADDRESS
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env.local") });

const { NEXT_PUBLIC_ALCHEMY_API_KEY, NEXT_PUBLIC_CONTRACT_ADDRESS } = process.env;

if (!NEXT_PUBLIC_ALCHEMY_API_KEY || !NEXT_PUBLIC_CONTRACT_ADDRESS) {
  console.error("Missing NEXT_PUBLIC_ALCHEMY_API_KEY or NEXT_PUBLIC_CONTRACT_ADDRESS.");
  process.exit(1);
}

const ABI = [
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function isVerified(uint256 tokenId) view returns (bool)",
  "function owner() view returns (address)",
];

const provider = new ethers.JsonRpcProvider(
  `https://eth-sepolia.g.alchemy.com/v2/${NEXT_PUBLIC_ALCHEMY_API_KEY}`
);
const contract = new ethers.Contract(NEXT_PUBLIC_CONTRACT_ADDRESS, ABI, provider);

const [supply, owner] = await Promise.all([contract.totalSupply(), contract.owner()]);
const total = Number(supply);

console.log(`Contract: ${NEXT_PUBLIC_CONTRACT_ADDRESS}`);
console.log(`Current owner: ${owner}`);
console.log(`Total minted: ${total}\n`);

if (total === 0) {
  console.log("Nothing minted yet — you'll need to mint one before running the KeeperHub demo.");
  process.exit(0);
}

for (let tokenId = 1; tokenId <= total; tokenId++) {
  const [tokenOwner, verified] = await Promise.all([
    contract.ownerOf(tokenId).catch(() => "burned/unknown"),
    contract.isVerified(tokenId).catch(() => false),
  ]);
  console.log(`Token #${tokenId} — owner: ${tokenOwner} — verified: ${verified}`);
}

const unverified = [];
for (let tokenId = 1; tokenId <= total; tokenId++) {
  const verified = await contract.isVerified(tokenId).catch(() => false);
  if (!verified) unverified.push(tokenId);
}

console.log("");
if (unverified.length > 0) {
  console.log(
    `${unverified.length} token(s) not yet verified: [${unverified.join(", ")}] — ` +
      `any of these can be used directly with submit-hackathon.mjs, no new mint needed.`
  );
} else {
  console.log("All existing tokens are already verified — mint a new one to demo the flow end-to-end.");
}
