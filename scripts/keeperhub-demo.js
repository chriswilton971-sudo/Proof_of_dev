/**
 * Standalone demo: triggers the KeeperHub markVerified() post-mint workflow
 * directly, without needing a live mint transaction first.
 *
 * This exists so the KeeperHub integration can be demonstrated end-to-end
 * on demand — a working transaction that executes through KeeperHub — even
 * if no wallet has minted a token in the demo window.
 *
 * Usage:
 *   node scripts/keeperhub-demo.js <tokenId> <account>
 *
 * Requires (see .env.example): KEEPERHUB_API_KEY, KEEPERHUB_WALLET_PRIVATE_KEY,
 * KEEPERHUB_MARKVERIFIED_WORKFLOW_ID.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const {
  isKeeperhubConfigured,
  isAgenticWalletConfigured,
  triggerPostMintVerification,
} = await import("../services/analysis/keeperhub.js");

const tokenId = process.argv[2];
const account = process.argv[3];

if (!tokenId || !account) {
  console.error("Usage: node scripts/keeperhub-demo.js <tokenId> <account>");
  process.exit(1);
}

if (!isKeeperhubConfigured()) {
  console.error("[keeperhub-demo] KEEPERHUB_API_KEY is not configured — see .env.example");
  process.exit(1);
}
if (!isAgenticWalletConfigured()) {
  console.error("[keeperhub-demo] KEEPERHUB_WALLET_PRIVATE_KEY is not configured — see .env.example");
  process.exit(1);
}

console.info(`[keeperhub-demo] Triggering markVerified(${tokenId}) for ${account} via KeeperHub…`);

try {
  const result = await triggerPostMintVerification({
    tokenId,
    account,
    mintTxHash: "0x" + "0".repeat(64), // no real mint tx behind this manual demo call
  });
  console.info("[keeperhub-demo] Success:", JSON.stringify(result, null, 2));
} catch (err) {
  console.error("[keeperhub-demo] Failed:", err.message);
  process.exit(1);
}
