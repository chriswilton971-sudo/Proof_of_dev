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
import { writeFileSync } from "fs";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env.local") });

const lines = [];

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

function report(line) {
  console.log(line);
  lines.push(line);
  console.log(`::error title=Check Minted Tokens::${line.replace(/\n/g, " ")}`);
}

const [supply, owner] = await Promise.all([contract.totalSupply(), contract.owner()]).catch((err) => {
  console.log(`::error title=Check Minted Tokens::FATAL: ${(err.message || String(err)).replace(/\n/g, " ")}`);
  process.exit(1);
});
const total = Number(supply);

report(`Contract: ${NEXT_PUBLIC_CONTRACT_ADDRESS}`);
report(`Current owner: ${owner}`);
report(`Total minted: ${total}`);

if (total === 0) {
  report("Nothing minted yet — you'll need to mint one before running the KeeperHub demo.");
  writeFileSync(resolve(__dirname, "..", "result.txt"), lines.join("\n") + "\n");
  process.exit(0);
}

for (let tokenId = 1; tokenId <= total; tokenId++) {
  const [tokenOwner, verified] = await Promise.all([
    contract.ownerOf(tokenId).catch(() => "burned/unknown"),
    contract.isVerified(tokenId).catch(() => false),
  ]);
  report(`Token #${tokenId} — owner: ${tokenOwner} — verified: ${verified}`);
}

const unverified = [];
for (let tokenId = 1; tokenId <= total; tokenId++) {
  const verified = await contract.isVerified(tokenId).catch(() => false);
  if (!verified) unverified.push(tokenId);
}

if (unverified.length > 0) {
  report(
    `${unverified.length} token(s) not yet verified: [${unverified.join(", ")}] — ` +
      `any of these can be used directly with submit-hackathon.mjs, no new mint needed.`
  );
} else {
  report("All existing tokens are already verified — mint a new one to demo the flow end-to-end.");
}

writeFileSync(resolve(__dirname, "..", "result.txt"), lines.join("\n") + "\n");
