/**
 * Standalone demo: triggers KeeperHub's Direct Execution flow to call
 * markVerified(tokenId) directly, without needing a live mint transaction
 * or the on-chain Minted-event verification the real /keeperhub/verify
 * webhook requires first.
 *
 * This exists so the KeeperHub integration can be demonstrated end-to-end
 * on demand — a working transaction that executes through KeeperHub — even
 * if no wallet has minted a token in the demo window. Runs the real
 * simulate → execute → poll sequence (see services/analysis/keeperhub.js);
 * nothing here is mocked.
 *
 * Usage:
 *   node scripts/keeperhub-demo.js <tokenId> <contractAddress> [network]
 *
 * Requires (see .env.example): KEEPERHUB_API_KEY. Also requires that
 * ownership of the deployed contract (or delegation of markVerified) has
 * been transferred to the wallet address KeeperHub provisions for this
 * org — see docs/integrations/keeperhub-mcp.md.
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const { isKeeperhubConfigured, verifyMintOnChain } = await import("../services/analysis/keeperhub.js");

const tokenId = process.argv[2];
const contractAddress = process.argv[3] ?? process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const network = process.argv[4] ?? "sepolia";

if (!tokenId || !contractAddress) {
  console.error("Usage: node scripts/keeperhub-demo.js <tokenId> <contractAddress> [network]");
  console.error("(contractAddress falls back to NEXT_PUBLIC_CONTRACT_ADDRESS if omitted)");
  process.exit(1);
}

if (!isKeeperhubConfigured()) {
  console.error("[keeperhub-demo] KEEPERHUB_API_KEY is not configured — see .env.example");
  process.exit(1);
}

console.info(`[keeperhub-demo] Running simulate -> execute -> poll for markVerified(${tokenId}) on ${contractAddress} (${network})…`);

try {
  const result = await verifyMintOnChain({ network, contractAddress, tokenId });
  console.info("[keeperhub-demo] Success:", JSON.stringify(result, null, 2));
} catch (err) {
  console.error("[keeperhub-demo] Failed:", err.message);
  process.exit(1);
}
