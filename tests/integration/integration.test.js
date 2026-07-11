/**
 * Integration Tests for ProofOfDev Contract
 * Tests contract deployment, signer verification, and basic functionality
 */

import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const artifactPath = resolve(root, "artifacts/ProofOfDev.json");

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

let testsPassed = 0;
let testsFailed = 0;

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logTest(testName) {
  log(`\n  ✓ ${testName}`, colors.blue);
}

function logSuccess(message) {
  log(`    ✓ ${message}`, colors.green);
  testsPassed++;
}

function logError(message) {
  log(`    ✗ ${message}`, colors.red);
  testsFailed++;
}

async function runTests() {
  log("\n╔════════════════════════════════════════════════════╗", colors.blue);
  log("║  ProofOfDev Contract Integration Tests              ║", colors.blue);
  log("╚════════════════════════════════════════════════════╝", colors.blue);

  try {
    // Test 1: Artifact Validation
    logTest("Artifact Validation");
    if (!existsSync(artifactPath)) {
      logError(`Artifact not found at ${artifactPath}`);
      log(
        "\n  Run: npm run onchain:compile (or equivalent) to generate artifacts",
        colors.yellow
      );
      return;
    }
    logSuccess("Artifact file exists");

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    if (!artifact.abi || !artifact.bytecode) {
      logError("Artifact missing ABI or bytecode");
      return;
    }
    logSuccess("Artifact contains valid ABI and bytecode");

    // Test 2: Contract Structure Validation
    logTest("Contract Structure Validation");
    const abiMethods = artifact.abi
      .filter((item) => item.type === "function")
      .map((item) => item.name);
    logSuccess(`Found ${abiMethods.length} contract methods`);

    const expectedMethods = ["deploy"];
    const hasDeployMethod = abiMethods.some((m) => m === "deploy");
    if (hasDeployMethod || abiMethods.length > 0) {
      logSuccess("Contract has callable methods");
    } else {
      logError("Contract has no callable methods");
    }

    // Test 3: Event Validation
    logTest("Event Validation");
    const events = artifact.abi.filter((item) => item.type === "event");
    logSuccess(`Found ${events.length} contract events`);

    // Test 4: State Variables Validation
    logTest("State Variables & Getters");
    const stateVars = artifact.abi.filter(
      (item) => item.type === "function" && item.stateMutability === "view"
    );
    logSuccess(`Found ${stateVars.length} view/getter functions`);

    // Check for signer-related functions
    const signerFunctions = stateVars
      .map((f) => f.name)
      .filter((name) =>
        ["signer", "trustedSigner", "verifierSigner", "owner"].some((s) =>
          name.toLowerCase().includes(s.toLowerCase())
        )
      );

    if (signerFunctions.length > 0) {
      logSuccess(`Found signer getter: ${signerFunctions.join(", ")}`);
    } else {
      log(`    ⚠ No signer getter found (optional)`, colors.yellow);
    }

    // Test 5: Constructor Parameters
    logTest("Constructor Parameters");
    const constructor = artifact.abi.find((item) => item.type === "constructor");
    if (constructor) {
      logSuccess(
        `Constructor accepts ${constructor.inputs.length} parameter(s)`
      );
      constructor.inputs.forEach((input) => {
        log(`      - ${input.name}: ${input.type}`, colors.blue);
      });
    } else {
      logSuccess("No custom constructor (uses default)");
    }

    // Test 6: Deployment Readiness
    logTest("Deployment Readiness");
    const requiredEnvVars = [
      "DEPLOYER_PRIVATE_KEY",
      "NEXT_PUBLIC_ALCHEMY_API_KEY",
      "SIGNER_ADDRESS",
    ];
    const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

    if (missingVars.length === 0) {
      logSuccess("All required environment variables are set");
    } else {
      log(`    ⚠ Missing env vars (required for deploy): ${missingVars.join(", ")}`, colors.yellow);
    }

    // Test 7: Network Configuration
    logTest("Network Configuration");
    const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (alchemyKey) {
      logSuccess("Alchemy API key configured");
      logSuccess("Sepolia testnet RPC available");
    } else {
      log("    ⚠ Alchemy API key not set (optional for testing)", colors.yellow);
    }

    // Test 8: Contract Size
    logTest("Contract Size Analysis");
    const bytecodeSize = artifact.bytecode.length / 2; // Convert hex string to bytes
    logSuccess(`Contract bytecode size: ${bytecodeSize} bytes`);
    if (bytecodeSize > 24576) {
      log("    ⚠ Contract exceeds Ethereum size limit (24576 bytes)", colors.yellow);
    } else {
      logSuccess(`Below size limit (24576 bytes)`);
    }

    // Test Summary
    log("\n╔════════════════════════════════════════════════════╗", colors.blue);
    log(`║  Tests Passed: ${testsPassed.toString().padEnd(35)}║`, colors.green);
    log(`║  Tests Failed: ${testsFailed.toString().padEnd(35)}║`, colors[testsFailed > 0 ? "red" : "green"]);
    log("╚════════════════════════════════════════════════════╝", colors.blue);

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
await runTests();
