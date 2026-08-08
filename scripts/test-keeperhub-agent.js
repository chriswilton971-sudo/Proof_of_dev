#!/usr/bin/env node

/**
 * Quick Test: Authenticate with KeeperHub MCP Server
 *
 * This script tests the KeeperHub MCP server connection by simulating
 * an agent authentication flow.
 *
 * Usage:
 *   npm run test:keeperhub-agent
 *   node scripts/test-keeperhub-agent.js <api_key>
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Get API key from .env.local or command line
let apiKey = process.argv[2];

if (!apiKey) {
  const envLocalPath = path.join(rootDir, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, "utf8");
    const match = envContent.match(/KEEPERHUB_API_KEY=(.+)/);
    if (match) {
      apiKey = match[1].trim();
    }
  }
}

if (!apiKey) {
  console.error(
    "Error: KEEPERHUB_API_KEY not found. Set it in .env.local or pass as argument.\n" +
    "Usage: node scripts/test-keeperhub-agent.js kh_your_key_here\n"
  );
  process.exit(1);
}

if (!apiKey.startsWith("kh_")) {
  console.error(
    "Error: Invalid API key format. Must start with 'kh_'.\n"
  );
  process.exit(1);
}

console.log("\n🧪 Testing KeeperHub MCP Agent Connection...\n");

async function testConnection() {
  console.log("📡 Calling KeeperHub API...");
  console.log(`   Endpoint: https://app.keeperhub.com/api/workflows\n`);

  try {
    const response = await fetch(
      "https://app.keeperhub.com/api/workflows",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log("✅ Authentication Successful!\n");
    console.log("📊 Account Details:");
    console.log(
      `   Organization: ${data.organization?.name || "Unknown"}`
    );
    console.log(
      `   Workflows: ${data.data?.length || 0}`
    );
    console.log(
      `   API Base URL: https://app.keeperhub.com\n`
    );

    if (data.data && data.data.length > 0) {
      console.log("📋 Available Workflows:");
      data.data.slice(0, 5).forEach((w, i) => {
        console.log(
          `   ${i + 1}. ${w.name} (ID: ${w.id})`
        );
        if (w.network) console.log(`      Network: ${w.network}`);
        if (w.contractAddress)
          console.log(`      Contract: ${w.contractAddress}`);
      });
      if (data.data.length > 5) {
        console.log(`   ... and ${data.data.length - 5} more\n`);
      } else {
        console.log();
      }
    }

    console.log("🎯 Next Steps:");
    console.log(
      '   1. Ask your agent: "Authenticate me with KeeperHub using my API key"'
    );
    console.log(
      '   2. Ask your agent: "List my available workflows"'
    );
    console.log(
      '   3. Ask your agent: "Deploy a new workflow that..."'
    );
    console.log(
      '   4. Ask your agent: "Execute workflow <id> with..."'
    );
    console.log();
    console.log(
      "📖 Full guide: docs/integrations/keeperhub-copilot-agent.md\n"
    );
  } catch (error) {
    console.error("❌ Connection Failed:\n");
    console.error(`   ${error.message}\n`);
    console.error("💡 Troubleshooting:");
    console.error("   • Verify API key format (must start with 'kh_')");
    console.error("   • Check https://app.keeperhub.com/settings/api-keys");
    console.error("   • Ensure organization is active and configured\n");
    process.exit(1);
  }
}

testConnection().catch(console.error);
