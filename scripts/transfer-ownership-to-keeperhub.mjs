/**
 * scripts/transfer-ownership-to-keeperhub.mjs
 *
 * Completes the pending item flagged in docs/integrations/keeperhub-mcp.md:
 * "The contract's owner needs to actually be KeeperHub's provisioned
 * wallet address on the deployed instance for markVerified to succeed —
 * confirm this as part of deployment, not just in code."
 *
 * ProofOfDev.sol uses a two-step ownership handoff (transferOwnership,
 * then acceptOwnership — see contracts/ProofOfDev.sol), so this is two
 * separate transactions from two different signers:
 *
 *   Step 1: the CURRENT owner (your DEPLOYER_PRIVATE_KEY) calls
 *           transferOwnership(keeperHubWalletAddress) — signed locally
 *           with your own key, never sent anywhere.
 *   Step 2: KeeperHub's own wallet calls acceptOwnership() on itself —
 *           this has to go through KeeperHub's Direct Execution API
 *           (KEEPERHUB_API_KEY), since nobody else holds that wallet's key.
 *
 * Usage:
 *   node scripts/transfer-ownership-to-keeperhub.mjs <keeperHubWalletAddress>
 *
 * Required env (.env.local):
 *   DEPLOYER_PRIVATE_KEY        — current contract owner
 *   NEXT_PUBLIC_ALCHEMY_API_KEY — Sepolia RPC
 *   NEXT_PUBLIC_CONTRACT_ADDRESS
 *   KEEPERHUB_API_KEY
 *
 * Find <keeperHubWalletAddress> on app.keeperhub.com under your org's
 * wallet / funding settings — do NOT assume any address without checking
 * the dashboard yourself.
 */

import "./load-env.js";
import { ethers } from "ethers";
import { simulateAcceptOwnership } from "../services/analysis/keeperhub.js";

const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function transferOwnership(address newOwner) external",
];

const keeperHubWallet = process.argv[2];

if (!keeperHubWallet || !ethers.isAddress(keeperHubWallet)) {
  console.error("Usage: node scripts/transfer-ownership-to-keeperhub.mjs <keeperHubWalletAddress>");
  console.error("Find this address on app.keeperhub.com under your org's wallet settings.");
  process.exit(1);
}

const {
  DEPLOYER_PRIVATE_KEY,
  NEXT_PUBLIC_ALCHEMY_API_KEY,
  NEXT_PUBLIC_CONTRACT_ADDRESS,
  KEEPERHUB_API_KEY,
} = process.env;

for (const [name, val] of Object.entries({
  DEPLOYER_PRIVATE_KEY,
  NEXT_PUBLIC_ALCHEMY_API_KEY,
  NEXT_PUBLIC_CONTRACT_ADDRESS,
  KEEPERHUB_API_KEY,
})) {
  if (!val || val.includes("your_") || val.includes("REPLACE_WITH")) {
    console.error(`Missing or placeholder ${name} in .env.local`);
    process.exit(1);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${NEXT_PUBLIC_ALCHEMY_API_KEY}`
  );
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(NEXT_PUBLIC_CONTRACT_ADDRESS, OWNABLE_ABI, deployer);

  const currentOwner = await contract.owner();
  console.log(`[1/2] Current owner: ${currentOwner}`);

  if (currentOwner.toLowerCase() === keeperHubWallet.toLowerCase()) {
    console.log("Ownership already sits with this address. Nothing to do for step 1.");
  } else {
    if (currentOwner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.error(
        `DEPLOYER_PRIVATE_KEY (${deployer.address}) is not the current owner (${currentOwner}). ` +
          "Use the key that actually holds ownership."
      );
      process.exit(1);
    }

    console.log(`[1/2] Calling transferOwnership(${keeperHubWallet}) from ${deployer.address} ...`);
    const tx = await contract.transferOwnership(keeperHubWallet);
    console.log(`      tx: https://sepolia.etherscan.io/tx/${tx.hash}`);
    await tx.wait();
    console.log("      Confirmed. pendingOwner is now set — KeeperHub's wallet must accept it.");
  }

  console.log(`\n[2/2] Simulating acceptOwnership() via KeeperHub (${keeperHubWallet}) ...`);

  let simulation;
  try {
    simulation = await simulateAcceptOwnership({
      network: "sepolia",
      contractAddress: NEXT_PUBLIC_CONTRACT_ADDRESS,
    });
  } catch (err) {
    console.error("      KeeperHub simulate failed:", err.message);
    if (err.body) console.error("      response body:", JSON.stringify(err.body));
    console.error(
      "      If this is a field-name error, the request shape lives in ONE place now — " +
        "buildContractCallRequestBody() in services/analysis/keeperhub.js. Fix it there; " +
        "this script and executeMarkVerified()/executeAcceptOwnership() all share it."
    );
    process.exit(1);
  }

  if (simulation?.willRevert === true || simulation?.success === false) {
    console.error(
      "      Simulation says acceptOwnership() would revert:",
      simulation?.revertReason ?? simulation?.error ?? simulation
    );
    process.exit(1);
  }

  console.log("      Simulation OK. To actually broadcast step 2 (irreversible), use");
  console.log("      scripts/submit-hackathon.mjs with --confirm-accept-ownership, which calls");
  console.log("      executeAcceptOwnership() from services/analysis/keeperhub.js — this script");
  console.log("      deliberately stops at a safe dry run rather than auto-broadcasting.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
