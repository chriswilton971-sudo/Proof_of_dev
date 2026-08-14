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
  // Keep the GitHub Actions annotation, but still continue gracefully.
  try {
    console.log(`::error title=Check Minted Tokens::${line.replace(/\n/g, " ")}`);
  } catch (e) {
    // noop
  }
}

// Try to read totalSupply(), but handle contracts that don't implement it
let total = 0;
let supportsTotalSupply = true;
let owner = "(unknown)";

try {
  owner = await contract.owner();
} catch (err) {
  report(`Unable to read owner(): ${(err.message || String(err)).replace(/\n/g, " ")}`);
}

try {
  const supply = await contract.totalSupply();
  total = Number(supply);
} catch (err) {
  // ethers throws BAD_DATA with value '0x' when the function is not present
  if (err && err.code === "BAD_DATA" && err.value === "0x") {
    supportsTotalSupply = false;
    report("Contract does not expose totalSupply() (non-enumerable ERC-721?). Falling back to probing token IDs.");
  } else {
    report(`FATAL: ${(err.message || String(err)).replace(/\n/g, " ")}`);
    writeFileSync(resolve(__dirname, "..", "result.txt"), lines.join("\n") + "\n");
    process.exit(1);
  }
}

report(`Contract: ${NEXT_PUBLIC_CONTRACT_ADDRESS}`);
report(`Current owner: ${owner}`);
report(`Total minted (reported): ${supportsTotalSupply ? total : "(unknown)"}`);

if (supportsTotalSupply && total === 0) {
  report("Nothing minted yet — you'll need to mint one before running the KeeperHub demo.");
  writeFileSync(resolve(__dirname, "..", "result.txt"), lines.join("\n") + "\n");
  process.exit(0);
}

// If totalSupply() isn't available, probe a sensible range for minted tokens.
let tokenIdsToInspect = [];
if (supportsTotalSupply) {
  for (let tokenId = 1; tokenId <= total; tokenId++) tokenIdsToInspect.push(tokenId);
} else {
  // Try probing 1..20 by default; adjust as needed for your contract.
  const PROBE_MAX = 20;
  for (let tokenId = 1; tokenId <= PROBE_MAX; tokenId++) tokenIdsToInspect.push(tokenId);
}

const inspected = [];
for (const tokenId of tokenIdsToInspect) {
  const [tokenOwner, verified] = await Promise.all([
    contract.ownerOf(tokenId).catch(() => null),
    contract.isVerified(tokenId).catch(() => false),
  ]);

  if (tokenOwner) {
    // We saw an owner, so the token appears minted.
    inspected.push({ tokenId, tokenOwner, verified });
    report(`Token #${tokenId} — owner: ${tokenOwner} — verified: ${verified}`);
  } else if (supportsTotalSupply) {
    // If totalSupply said this token should exist but ownerOf failed, still report.
    inspected.push({ tokenId, tokenOwner: "burned/unknown", verified });
    report(`Token #${tokenId} — owner: burned/unknown — verified: ${verified}`);
  } else {
    // non-enumerable & ownerOf failed -> likely unminted; don't clutter output.
    // (No report for unminted when probing fallback)
  }
}

if (inspected.length === 0) {
  report("No minted tokens found in the probed range. If your contract mints high token IDs or uses a non-standard scheme, increase the probe range or implement ERC-721 Enumerable.");
  writeFileSync(resolve(__dirname, "..", "result.txt"), lines.join("\n") + "\n");
  process.exit(0);
}

const unverified = inspected.filter((t) => !t.verified).map((t) => t.tokenId);

if (unverified.length > 0) {
  report(
    `${unverified.length} token(s) not yet verified: [${unverified.join(", ")}] — ` +
      `any of these can be used directly with submit-hackathon.mjs, no new mint needed.`
  );
} else {
  report("All inspected tokens are already verified — mint a new one to demo the flow end-to-end.");
}

writeFileSync(resolve(__dirname, "..", "result.txt"), lines.join("\n") + "\n");
