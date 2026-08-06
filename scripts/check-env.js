/**
 * Validates env vars before starting dev services.
 * Missing API keys → demo mode (warn, do not exit).
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isMockMode } from "../services/analysis/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvFile() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const required = [
  {
    key: "NEXT_PUBLIC_ALCHEMY_API_KEY",
    hint: "Get a key at https://dashboard.alchemy.com",
  },
  {
    key: "ETHERSCAN_API_KEY",
    hint: "Get a key at https://etherscan.io/myapikey",
  },
];

const recommended = [
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "MONGO_URI",
  "ATTESTER_PRIVATE_KEY",
  "MINT_SIGNER_PRIVATE_KEY",
];

// Not required to run the app (demo mode works without these), but required
// for the one thing that actually matters for hackathon submission: a real
// transaction executed through KeeperHub. Checked separately and loudly so
// "check-env OK" never gives false confidence about this specific path.
const keeperhub = [
  { key: "KEEPERHUB_API_KEY", hint: "app.keeperhub.com → Settings → API Keys" },
  { key: "KEEPERHUB_WALLET_PRIVATE_KEY", hint: "agentic signing wallet, must be/be delegated by contract owner" },
  { key: "KEEPERHUB_MARKVERIFIED_WORKFLOW_ID", hint: "workflow ID from the KeeperHub dashboard that calls markVerified(tokenId)" },
  { key: "KEEPERHUB_WEBHOOK_SECRET", hint: "any random value — gates /webhooks/keeperhub/post-mint" },
];

function isMissingKey(key) {
  const val = process.env[key];
  if (!val) return true;
  return val.includes("your_") || val.includes("_here") || /^0x0+$/.test(val.trim());
}

const demoMode = isMockMode();
let failed = false;

for (const { key, hint } of required) {
  if (isMissingKey(key)) {
    if (demoMode) {
      console.warn(`[check-env] Demo mode — missing: ${key}`);
    } else {
      console.error(`[check-env] Missing or placeholder: ${key}`);
      console.error(`              ${hint}`);
      failed = true;
    }
  }
}

for (const key of recommended) {
  if (!process.env[key]) {
    console.warn(`[check-env] Optional not set: ${key}`);
  }
}

if (!existsSync(resolve(root, ".env.local"))) {
  console.warn("[check-env] No .env.local — demo mode uses sample analysis data");
}

const keeperhubMissing = keeperhub.filter(({ key }) => isMissingKey(key));
if (keeperhubMissing.length > 0) {
  console.warn("");
  console.warn("[check-env] ⚠ KeeperHub is NOT fully configured — no real transaction");
  console.warn("            can be executed through KeeperHub until these are set:");
  for (const { key, hint } of keeperhubMissing) {
    console.warn(`              - ${key}  (${hint})`);
  }
  console.warn("            This is the one hackathon requirement — set these before");
  console.warn("            recording your demo or fetching a submission tx link.");
  console.warn("");
} else {
  console.info("[check-env] ✓ KeeperHub fully configured — ready to run npm run demo:keeperhub");
}

if (failed) {
  process.exit(1);
}

if (demoMode) {
  console.info("[check-env] OK (demo mode — add API keys to .env.local for live analysis)");
} else {
  console.info("[check-env] OK");
}
