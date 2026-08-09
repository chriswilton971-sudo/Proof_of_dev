/**
 * scripts/verify-keeperhub.mjs
 *
 * End-to-end check for the KeeperHub hackathon submission requirement:
 * "a link to a transaction your agent executed via KeeperHub."
 *
 * Flow:
 *   1. POST /api/analyze          — enqueue analysis for a wallet
 *   2. GET  /api/profile/:address — poll until the analysis completes
 *   3. POST /api/attest/sponsored — submit the attestation through
 *                                   KeeperHub's Direct Execution API
 *   4. Print the resulting execution status + a block-explorer link
 *
 * Usage:
 *   node scripts/verify-keeperhub.mjs 0xYourTestWalletAddress
 *   BASE_URL=https://your-deployed-app.vercel.app node scripts/verify-keeperhub.mjs 0x...
 *
 * Requires the app running (locally via `npm run dev`, or deployed) with
 * KEEPERHUB_API_KEY set in that app's environment — this script only
 * talks to your app's own HTTP API, it never touches KeeperHub directly
 * or reads any secret itself.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const address = process.argv[2];

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io/tx/";

if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("Usage: node scripts/verify-keeperhub.mjs 0xYourTestWalletAddress");
  console.error("       (must be a wallet with some real onchain activity to analyze)");
  process.exit(1);
}

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  log("1/4", `Requesting analysis for ${address} ...`);
  const analyzeRes = await fetch(`${BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, network: "sepolia" }),
  });
  const analyzeBody = await analyzeRes.json();
  if (!analyzeRes.ok) {
    console.error("Analysis request failed:", analyzeBody);
    process.exit(1);
  }
  log("1/4", `Job enqueued: ${analyzeBody.jobId}`);

  log("2/4", "Polling for analysis to complete (up to 2 minutes) ...");
  let profile = null;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const profileRes = await fetch(`${BASE_URL}/api/profile/${address}?network=sepolia`);
    if (profileRes.status === 404) {
      process.stdout.write(".");
      continue;
    }
    if (!profileRes.ok) {
      console.error("\nProfile fetch failed:", await profileRes.json().catch(() => ({})));
      process.exit(1);
    }
    profile = await profileRes.json();
    console.log("");
    break;
  }
  if (!profile) {
    console.error("Analysis did not complete in time. Check the analysis worker is running.");
    process.exit(1);
  }
  log("2/4", `Analysis complete — score ${profile.score}`);

  log("3/4", "Submitting sponsored attestation via KeeperHub ...");
  const attestRes = await fetch(`${BASE_URL}/api/attest/sponsored`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const attestBody = await attestRes.json();

  if (!attestRes.ok) {
    console.error("\nSponsored attestation failed:", attestBody);
    if (attestBody.code === "SPONSORSHIP_UNAVAILABLE") {
      console.error("→ Set KEEPERHUB_API_KEY in the app's environment and retry.");
    }
    process.exit(1);
  }

  log("4/4", "Done.");
  console.log(JSON.stringify(attestBody, null, 2));

  const txHash = attestBody.transactionHash;
  if (txHash) {
    console.log(`\n✅ Transaction: ${SEPOLIA_EXPLORER}${txHash}`);
    console.log("   ↑ This is the link for the DoraHacks submission form.");
  } else {
    console.log(
      "\n⚠️  No transactionHash in the response yet — the execution may still be " +
        "'pending'/'running'. Re-check status manually via KeeperHub's dashboard " +
        "or GET /api/execute/{executionId}/status with the executionId above."
    );
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
