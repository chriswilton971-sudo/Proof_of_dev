/**
 * Minimal Hardhat config — used ONLY to run the Solidity contract test
 * suite in test/ProofOfDev.test.cjs. Deployment and ABI generation still
 * go through scripts/compile-contract.js and scripts/deploy.ts (solc
 * directly) — this does not replace that pipeline, it adds contract-level
 * test coverage that didn't exist before.
 *
 * .cjs because the repo root is "type": "module" (ESM) — Hardhat's default
 * config/test tooling is CommonJS-first, so this file and its test file
 * are explicitly CommonJS via the .cjs extension.
 */
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.36", // matches the solc npm package version already used by scripts/compile-contract.js
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts-hardhat", // kept separate from scripts/compile-contract.js's ./artifacts
  },
};
