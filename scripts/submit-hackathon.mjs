/**
 * scripts/submit-hackathon.mjs
 *
 * Runs the full remaining path to a submittable KeeperHub hackathon entry:
 *
 *   1. Validate env (delegates to scripts/check-env.js)
 *   2. Check on-chain contract ownership; transfer to KeeperHub's wallet
 *      if it isn't already the owner (step 1 of the Ownable2Step handoff,
 *      signed locally with DEPLOYER_PRIVATE_KEY)
 *   3. Simulate acceptOwnership() via KeeperHub; only actually broadcasts
 *      it if you pass --confirm-accept-ownership (irreversible, so this
 *      requires an explicit, separate opt-in rather than happening as a
 *      side effect of "run the demo")
 *   4. Run the real simulate -> execute -> poll markVerified(tokenId) flow
 *   5. Write SUBMISSION.md with the resulting transaction link, ready to
 *      paste into the DoraHacks form
 *
 * This still can't do everything: you need to have already minted a real
 * token (or be using a token ID you know is valid) and have real values
 * for every credential below. Nothing here invents or guesses a wallet
 * address, private key, or API key — all come from your own .env.local.
 *
 * Usage:
 *   node scripts/submit-hackathon.mjs <tokenId> <keeperHubWalletAddress> [--confirm-accept-ownership]
 *
 * Required in .env.local: DEPLOYER_PRIVATE_KEY, NEXT_PUBLIC_ALCHEMY_API_KEY,
 * NEXT_PUBLIC_CONTRACT_ADDRESS, KEEPERHUB_API_KEY, KEEPERHUB_WEBHOOK_SECRET.
 */

import { config } from "dotenv";
import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
config({ path: resolve(root, ".env.local") });

const tokenId = process.argv[2];
const keeperHubWallet = process.argv[3];
const confirmAcceptOwnership = process.argv.includes("--confirm-accept-ownership");

if (!tokenId || !keeperHubWallet || !ethers.isAddress(keeperHubWallet)) {
  console.error("Usage: node scripts/submit-hackathon.mjs <tokenId> <keeperHubWalletAddress> [--confirm-accept-ownership]");
  console.error("Find the wallet address on app.keeperhub.com under your org's wallet settings.");
  process.exit(1);
}

function step(n, label) {
  console.log(`\n━━━ [${n}/5] ${label} ━━━`);
}

step(1, "Validating environment");
try {
  execFileSync("node", [resolve(root, "scripts/check-env.js")], { stdio: "inherit" });
} catch {
  console.error("\nFix the issues above before continuing.");
  process.exit(1);
}

const {
  DEPLOYER_PRIVATE_KEY,
  NEXT_PUBLIC_ALCHEMY_API_KEY,
  NEXT_PUBLIC_CONTRACT_ADDRESS,
  KEEPERHUB_API_KEY,
  KEEPERHUB_BASE_URL = "https://app.keeperhub.com",
} = process.env;

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner) external",
];

const provider = new ethers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${NEXT_PUBLIC_ALCHEMY_API_KEY}`);

step(2, "Checking contract ownership");
const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(NEXT_PUBLIC_CONTRACT_ADDRESS, OWNABLE_ABI, deployer);
const currentOwner = await contract.owner();
console.log(`Current owner: ${currentOwner}`);

if (currentOwner.toLowerCase() === keeperHubWallet.toLowerCase()) {
  console.log("Already owned by KeeperHub's wallet — nothing to transfer.");
} else if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
  console.error(`DEPLOYER_PRIVATE_KEY (${deployer.address}) is not the current owner. Stopping.`);
  process.exit(1);
} else {
  console.log(`Transferring ownership to ${keeperHubWallet} ...`);
  const tx = await contract.transferOwnership(keeperHubWallet);
  console.log(`tx: https://sepolia.etherscan.io/tx/${tx.hash}`);
  await tx.wait();
  console.log("Confirmed.");
}

step(3, "acceptOwnership() via KeeperHub");
async function keeperhubCall(path, body, headers = {}) {
  const res = await fetch(`${KEEPERHUB_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEEPERHUB_API_KEY}`, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const acceptBody = {
  chainId: 11155111,
  contractAddress: NEXT_PUBLIC_CONTRACT_ADDRESS,
  functionName: "acceptOwnership",
  functionArgs: JSON.stringify([]),
};

const sim = await keeperhubCall("/api/execute/contract-call", { ...acceptBody, simulate: true }).catch((e) => {
  console.error("Simulate failed:", e.message);
  console.error("If this is a field-name error, see the open question in docs/integrations/keeperhub-mcp.md");
  return null;
});

if (sim) {
  if (sim.wouldRevert) {
    console.log(`Simulation says acceptOwnership() would revert: ${sim.revertReason ?? "unknown"}`);
    console.log("(Fine if KeeperHub already auto-accepted, or already owns the contract — check step 2's owner value above.)");
  } else if (!confirmAcceptOwnership) {
    console.log("Simulation OK. NOT broadcasting — pass --confirm-accept-ownership to actually accept ownership for real.");
  } else {
    console.log("Broadcasting acceptOwnership() for real ...");
    const { randomUUID } = await import("crypto");
    const broadcast = await keeperhubCall("/api/execute/contract-call", acceptBody, { "Idempotency-Key": randomUUID() });
    console.log("Broadcast result:", JSON.stringify(broadcast, null, 2));
  }
}

step(4, `markVerified(${tokenId}) via KeeperHub`);
const { verifyMintOnChain } = await import("../services/analysis/keeperhub.js");
let demoResult;
try {
  demoResult = await verifyMintOnChain({
    network: "sepolia",
    contractAddress: NEXT_PUBLIC_CONTRACT_ADDRESS,
    tokenId,
  });
  console.log("Success:", JSON.stringify(demoResult, null, 2));
} catch (err) {
  console.error("Failed:", err.message);
  console.error("This is the real, unresolved risk flagged in the pre-judge assessment — paste this error back for help.");
  process.exit(1);
}

step(5, "Writing SUBMISSION.md");
const txHash = demoResult?.status?.txHash ?? demoResult?.status?.transactionHash ?? null;
const txLink = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : "NOT FOUND — check demoResult above manually";

writeFileSync(
  resolve(root, "SUBMISSION.md"),
  `# DoraHacks submission — KeeperHub Agents Onchain Hackathon

Generated ${new Date().toISOString()}

- **Repo:** https://github.com/chriswilton971-sudo/Proof_of_dev
- **Transaction executed via KeeperHub:** ${txLink}
- **Execution ID:** ${demoResult?.executionId ?? "n/a"}
- **Demo video:** _(record separately — not automatable — show the mint,
  the "Verified via KeeperHub" badge, and this transaction landing on
  Sepolia Etherscan)_

## Raw result
\`\`\`json
${JSON.stringify(demoResult, null, 2)}
\`\`\`
`
);
console.log("\nWrote SUBMISSION.md with the transaction link for the DoraHacks form.");
console.log("Still needed from you: the demo video. Everything else here is real, not simulated.");
