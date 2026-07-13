/**
 * Compile ProofOfDev.sol and write artifacts/ProofOfDev.json
 *
 * Uses the `solc` npm package directly (no system solc binary required —
 * the previous version of this script shelled out to a `solc` executable
 * on PATH, which meant a fresh clone couldn't compile without a manual
 * Solidity compiler install).
 *
 * Usage: npm run onchain:compile
 */

import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = resolve(root, "artifacts");
const contractPath = resolve(root, "contracts/ProofOfDev.sol");
const outPath = resolve(artifactsDir, "ProofOfDev.json");

const source = readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: { "ProofOfDev.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    console.log(err.severity.toUpperCase() + ":", err.formattedMessage);
    if (err.severity === "error") hasError = true;
  }
}

if (hasError) {
  console.error("\n[onchain:compile] Compilation failed.");
  process.exit(1);
}

const contract = output.contracts["ProofOfDev.sol"]["ProofOfDev"];

mkdirSync(artifactsDir, { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      abi: contract.abi,
      bytecode: "0x" + contract.evm.bytecode.object,
      deployedBytecode: "0x" + contract.evm.deployedBytecode.object,
    },
    null,
    2
  )
);

console.info(`[onchain:compile] Wrote ${outPath}`);
console.info(`[onchain:compile] ABI entries: ${contract.abi.length}, runtime size: ${contract.evm.deployedBytecode.object.length / 2} bytes`);
