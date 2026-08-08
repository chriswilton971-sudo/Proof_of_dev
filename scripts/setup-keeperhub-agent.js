#!/usr/bin/env node

/**
 * KeeperHub Agent Setup Script
 *
 * This script configures your GitHub Copilot agent to use the KeeperHub MCP server.
 * It validates credentials and provides step-by-step setup instructions.
 *
 * Usage:
 *   node scripts/setup-keeperhub-agent.js
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const envLocalPath = path.join(rootDir, ".env.local");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  console.log("\n🚀 KeeperHub × GitHub Copilot Agent Setup\n");
  console.log("This script configures your agent to autonomously deploy and execute");
  console.log("on-chain workflows via KeeperHub.\n");

  // Step 1: Verify KeeperHub API Key
  console.log("╭─ Step 1: KeeperHub API Key ─────────────────────────────╮");
  console.log("│                                                          │");
  console.log("│ 1. Go to https://app.keeperhub.com                      │");
  console.log("│ 2. Settings → API Keys → Organisation                   │");
  console.log("│ 3. Create a new API key (prefix: kh_)                   │");
  console.log("│                                                          │");
  console.log("╰──────────────────────────────────────────────────────────╯\n");

  const apiKey = await question("Enter your KeeperHub API key (kh_...): ");

  if (!apiKey.startsWith("kh_")) {
    console.error("\n❌ Invalid API key format. Must start with 'kh_'\n");
    process.exit(1);
  }

  // Step 2: Validate API Key
  console.log("\n✓ API key format valid\n");
  console.log("╭─ Step 2: Validate Connection ───────────────────────────╮");
  console.log("│ Testing KeeperHub API connection...                      │");
  console.log("╰──────────────────────────────────────────────────────────╯\n");

  try {
    const response = await fetch("https://app.keeperhub.com/api/workflows", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✓ Connection successful!`);
    console.log(`  Organization: ${data.organization?.name || "Unknown"}`);
    console.log(`  Available workflows: ${data.data?.length || 0}\n`);
  } catch (error) {
    console.error(`\n❌ Connection failed: ${error.message}\n`);
    process.exit(1);
  }

  // Step 3: Agentic Wallet Setup
  console.log("╭─ Step 3: Agentic Wallet (Optional but Recommended) ─────╮");
  console.log("│                                                          │");
  console.log("│ For autonomous workflow execution, you need a wallet:    │");
  console.log("│                                                          │");
  console.log("│ 1. Create or import a wallet in KeeperHub               │");
  console.log("│ 2. Copy its private key (hex format, no 0x prefix)      │");
  console.log("│ 3. Store securely in GitHub Secrets                     │");
  console.log("│                                                          │");
  console.log("╰──────────────────────────────────────────────────────────╯\n");

  const setupWallet = await question(
    "Do you want to configure an agentic wallet now? (y/n): "
  );

  let walletKey = "";
  if (setupWallet.toLowerCase() === "y") {
    walletKey = await question(
      "Enter your agentic wallet private key (0x...): "
    );
    if (!walletKey.startsWith("0x") || walletKey.length !== 66) {
      console.warn(
        "\n⚠️  Warning: Wallet key format may be invalid (should be 0x + 64 hex chars)\n"
      );
    }
  }

  // Step 4: Create/Update .env.local
  console.log(
    "\n╭─ Step 4: Configure Environment ────────────────────────╮"
  );
  console.log("│ Creating/updating .env.local...                         │");
  console.log("╰─────────────────────────────────────────────────────────╯\n");

  let envContent = "";
  if (fs.existsSync(envLocalPath)) {
    envContent = fs.readFileSync(envLocalPath, "utf8");
    // Update existing KeeperHub vars
    envContent = envContent.replace(
      /KEEPERHUB_API_KEY=.*/,
      `KEEPERHUB_API_KEY=${apiKey}`
    );
    if (walletKey) {
      if (envContent.includes("KEEPERHUB_WALLET_PRIVATE_KEY=")) {
        envContent = envContent.replace(
          /KEEPERHUB_WALLET_PRIVATE_KEY=.*/,
          `KEEPERHUB_WALLET_PRIVATE_KEY=${walletKey}`
        );
      } else {
        envContent += `\nKEEPERHUB_WALLET_PRIVATE_KEY=${walletKey}`;
      }
    }
  } else {
    // Create new .env.local with KeeperHub vars
    envContent =
      `# KeeperHub MCP Configuration\n` +
      `KEEPERHUB_API_KEY=${apiKey}\n` +
      `KEEPERHUB_BASE_URL=https://app.keeperhub.com\n`;
    if (walletKey) {
      envContent += `KEEPERHUB_WALLET_PRIVATE_KEY=${walletKey}\n`;
    }
  }

  fs.writeFileSync(envLocalPath, envContent, "utf8");
  console.log(`✓ Configuration saved to .env.local`);
  if (walletKey) {
    console.log(`✓ Agentic wallet configured\n`);
  } else {
    console.log(`⚠️  Agentic wallet not configured (deploy-only mode)\n`);
  }

  // Step 5: Verify MCP Server
  console.log(
    "╭─ Step 5: Verify MCP Server ────────────────────────────╮"
  );
  console.log("│ Checking MCP server installation...                     │");
  console.log("╰─────────────────────────────────────────────────────────╯\n");

  const mcpPath = path.join(rootDir, "services/mcp/keeperhub-server.js");
  if (fs.existsSync(mcpPath)) {
    console.log(`✓ MCP server found: ${mcpPath}`);
  } else {
    console.error(`❌ MCP server not found at ${mcpPath}`);
    process.exit(1);
  }

  const mcpConfigPath = path.join(rootDir, ".mcp.json");
  if (fs.existsSync(mcpConfigPath)) {
    console.log(`✓ MCP config found: ${mcpConfigPath}\n`);
  } else {
    console.error(`❌ MCP config not found at ${mcpConfigPath}`);
    process.exit(1);
  }

  // Step 6: Next Steps
  console.log(
    "╭─ Step 6: Use Your Agent ──────────────────────────────╮"
  );
  console.log("│                                                         │");
  console.log("│ Your Copilot agent can now:                             │");
  console.log("│                                                         │");
  console.log('│ 1. "Authenticate with KeeperHub using my API key"       │');
  console.log('│ 2. "List available workflows"                           │');
  console.log('│ 3. "Create a workflow that calls markVerified..."       │');
  console.log('│ 4. "Execute workflow wf_abc123 with tokenId=42"         │');
  console.log('│ 5. "Get status of execution ex_123"                     │');
  console.log("│                                                         │");
  console.log("╰─────────────────────────────────────────────────────────╯\n");

  console.log("📖 Documentation:");
  console.log(
    `   ${path.join(rootDir, "docs/integrations/keeperhub-copilot-agent.md")}\n`
  );

  console.log("✅ Setup complete! Your agent is ready for workflow automation.\n");

  rl.close();
}

main().catch((error) => {
  console.error("\n❌ Setup failed:", error.message, "\n");
  process.exit(1);
});
