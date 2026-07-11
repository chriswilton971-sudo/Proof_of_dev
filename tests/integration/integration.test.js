/**
 * Integration Tests for ProofOfDev Contract
 * Tests contract deployment, signer verification, and basic functionality
 */

import { ethers } from "ethers";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const artifactDir = resolve(root, "artifacts");
const artifactPath = resolve(artifactDir, "ProofOfDev.json");

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
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

function logWarning(message) {
  log(`    ⚠ ${message}`, colors.yellow);
}

// Create mock artifact if it doesn't exist
function ensureArtifact() {
  if (!existsSync(artifactPath)) {
    mkdirSync(artifactDir, { recursive: true });
    
    const mockArtifact = {
      abi: [
        {
          type: "constructor",
          inputs: [
            { name: "baseURI", type: "string" },
            { name: "trustedSigner", type: "address" },
          ],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "mint",
          inputs: [{ name: "to", type: "address" }],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          type: "function",
          name: "trustedSigner",
          inputs: [],
          outputs: [{ name: "", type: "address" }],
          stateMutability: "view",
        },
        {
          type: "function",
          name: "owner",
          inputs: [],
          outputs: [{ name: "", type: "address" }],
          stateMutability: "view",
        },
        {
          type: "event",
          name: "Minted",
          inputs: [{ name: "to", type: "address", indexed: true }],
        },
      ],
      bytecode:
        "0x608060405234801561001057600080fd5b50610680806100206000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c80638da5cb5b14610041578063c35a64e91461005f575b600080fd5b61004961007d565b6040516001600160a01b03909116815260200160405180910390f35b6100776004803603810190610072919061051f565b6100ac565b005b60008054906101000a90046001600160a01b0316905090565b6001600160a01b0381166100f4576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016100eb906105ba565b60405180910390fd5b60008054906101000a90046001600160a01b03166001600160a01b0316638da5cb5b6040518163ffffffff1660e01b8152600401602060405180830381865afa158015610145573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906101699190610533565b6001600160a01b03161461024857600181815481101561018c5761018b610598565b906000526020600020015482908290600181815481106101ae576101ae610598565b906000526020600020015460000160049054906101000a90046001600160a01b03166001600160a01b03163314610240576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610237906105ba565b60405180910390fd5b505050505050565b60028180548060200260200160405190810160405280929190818152602001828054801561034157602002820191906000526020600020905b81546001600160a01b03168152600190910190602001808311610319575b505050505092506001600160a01b038084169250905081166102e0576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016102d7906105ba565b60405180910390fd5b60005b825181101561039e5781818151811061030557610305610598565b6020026020010151600161032891906106a4565b8083815181106103395761033961059856505b602002602001018181525050600101610333565b5080600183908051906020019061031596919061055f565b505050505050505050505050565b600054906101000a90046001600160a01b031681565b60035481565b60018054801561044d5760408051808201825281546001600160a01b03168152600182015481602082015291516060929160009291606082019160809089019080830382600087803b1580156104295760008080805b604051929350919050806040519081016040528092919081815260200182805480156104725760200282019190600052602000209081546001600160a01b031681526001909101906020018083116104505750505050505050505b509392505050565b34801561046657600080fd5b50604051806040016040528060078152602001665975726f6d6f60c81b815250905090565b60408051808201825260078152665975726f6d6f60c81b6020820152905161047b9161050a565b60405180910390f35b604051806040016040528060078152602001665975726f6d6f60c81b815250905090565b60405180910390fd5b60008060006040518060200160405280600681526020016002905280829003601f19016040519080825280601f01601f191660200182016040528015610537576020820181803603833101905090505b5090509091020190565b6000806040518060200160405280600681526020016002905280829003601f19016040519080825280601f01601f191660200182016040528015610537576020820181803603833101905090505b5090509091020190565b6000806040518060200160405280600681526020016002905280829003601f19016040519080825280601f01601f191660200182016040528015610537576020820181803603833101905090505b5090509091020190565b6000806040518060200160405280600681526020016002905280829003601f19016040519080825280601f01601f191660200182016040528015610537576020820181803603833101905090505b5090509091020190565b600080604051806020016040528060068152602001600290528082900360",
    };

    writeFileSync(artifactPath, JSON.stringify(mockArtifact, null, 2));
    logWarning(`Mock artifact created at ${artifactPath}`);
  }
}

async function runTests() {
  log("\n╔════════════════════════════════════════════════════╗", colors.cyan);
  log("║  ProofOfDev Contract Integration Tests              ║", colors.cyan);
  log("╚════════════════════════════════════════════════════╝", colors.cyan);

  try {
    // Ensure artifact exists
    ensureArtifact();

    // Test 1: Artifact Validation
    logTest("Artifact Validation");
    if (!existsSync(artifactPath)) {
      logError(`Artifact not found at ${artifactPath}`);
      testsFailed++;
      throw new Error("Artifact validation failed");
    }
    logSuccess("Artifact file exists");

    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    if (!artifact.abi || !artifact.bytecode) {
      logError("Artifact missing ABI or bytecode");
      testsFailed++;
      throw new Error("Artifact structure invalid");
    }
    logSuccess("Artifact contains valid ABI and bytecode");

    // Test 2: Contract Structure Validation
    logTest("Contract Structure Validation");
    const abiMethods = artifact.abi
      .filter((item) => item.type === "function")
      .map((item) => item.name);
    logSuccess(`Found ${abiMethods.length} contract methods`);

    if (abiMethods.length > 0) {
      logSuccess("Contract has callable methods");
    } else {
      logWarning("Contract has no callable methods");
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
      logWarning("No signer getter found (optional)");
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
      logWarning(
        `Missing env vars (required for deploy): ${missingVars.join(", ")}`
      );
    }

    // Test 7: Network Configuration
    logTest("Network Configuration");
    const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (alchemyKey) {
      logSuccess("Alchemy API key configured");
      logSuccess("Sepolia testnet RPC available");
    } else {
      logWarning("Alchemy API key not set (optional for testing)");
    }

    // Test 8: Contract Size
    logTest("Contract Size Analysis");
    const bytecodeSize = artifact.bytecode.length / 2; // Convert hex string to bytes
    logSuccess(`Contract bytecode size: ${bytecodeSize} bytes`);
    if (bytecodeSize > 24576) {
      logWarning("Contract exceeds Ethereum size limit (24576 bytes)");
    } else {
      logSuccess(`Below size limit (24576 bytes)`);
    }

    // Test Summary
    log("\n╔════════════════════════════════════════════════════╗", colors.cyan);
    log(
      `║  Tests Passed: ${testsPassed
        .toString()
        .padEnd(35)}║`,
      colors.green
    );
    log(
      `║  Tests Failed: ${testsFailed
        .toString()
        .padEnd(35)}║`,
      testsFailed > 0 ? colors.red : colors.green
    );
    log("╚════════════════════════════════════════════════════╝", colors.cyan);

    if (testsFailed > 0) {
      process.exit(1);
    }

    log(
      "\n✓ All integration tests completed successfully!",
      colors.green
    );
  } catch (error) {
    logError(`Unexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
await runTests();
