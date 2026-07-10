/**
 * Deploy ProofOfDev contract to Sepolia.
 *
 * Usage:
 *   npm run onchain:compile   # once
 *   npm run onchain:deploy
 *
 * Required env (.env.local):
 *   DEPLOYER_PRIVATE_KEY
 *   NEXT_PUBLIC_ALCHEMY_API_KEY
 *   NFT_METADATA_BASE_URI  — e.g. https://your-domain.com/api/token
 *   SIGNER_ADDRESS         — EIP-712 trusted signer for gated minting
 *
 * Optional env (fallback RPC, recommended for reliability):
 *   SEPOLIA_RPC_FALLBACK_1  — e.g. a public Sepolia RPC URL
 *   SEPOLIA_RPC_FALLBACK_2  — e.g. another provider's Sepolia RPC URL
 */

import "./load-env.js";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, "artifacts/ProofOfDev.json");

// Try a few common getter names in case the contract's public state var
// isn't literally called `trustedSigner`. Add/remove as needed to match
// ProofOfDev.sol exactly.
const SIGNER_GETTER_CANDIDATES = ["trustedSigner", "signer", "verifierSigner"];

// --- helpers -----------------------------------------------------------

function buildRpcList(alchemyKey) {
  const urls = [`https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`];
  if (process.env.SEPOLIA_RPC_FALLBACK_1) urls.push(process.env.SEPOLIA_RPC_FALLBACK_1);
  if (process.env.SEPOLIA_RPC_FALLBACK_2) urls.push(process.env.SEPOLIA_RPC_FALLBACK_2);
  return urls;
}

async function connectWithFallback(rpcUrls) {
  let lastErr;
  for (const url of rpcUrls) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      // Force a real round-trip so a dead/unreachable RPC fails fast here
      // instead of failing later mid-deploy.
      await provider.getBlockNumber();
      console.log(`Connected to RPC: ${url.replace(/\/v2\/.*/, "/v2/••••")}`);
      return provider;
    } catch (err) {
      console.warn(`RPC unreachable, trying next: ${url.replace(/\/v2\/.*/, "/v2/••••")}`);
      lastErr = err;
    }
  }
  throw new Error(
    `All RPC endpoints failed. Last error: ${lastErr?.message ?? "unknown"}`
  );
}

async function getOnChainSigner(contract) {
  for (const name of SIGNER_GETTER_CANDIDATES) {
    if (typeof contract[name] === "function") {
      try {
        return { name, value: await contract[name]() };
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

async function deployWithRetry(factory, baseURI, signerAddress, { retries = 2 } = {}) {
  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      const contract = await factory.deploy(baseURI, signerAddress);
      await contract.waitForDeployment();
      return contract;
    } catch (err) {
      lastErr = err;
      attempt++;
      const transient =
        /timeout|network|ETIMEDOUT|ECONNRESET|underpriced|nonce/i.test(err?.message ?? "");
      if (attempt > retries || !transient) throw err;
      const backoffMs = 2000 * attempt;
      console.warn(
        `Deploy attempt ${attempt} failed (${err.message}). Retrying in ${backoffMs / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

// --- main ----------------------------------------------------------------

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const baseURI =
    process.env.NFT_METADATA_BASE_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/token`
      : "");
  const signerAddress = process.env.SIGNER_ADDRESS;

  if (!privateKey || !alchemyKey) {
    console.error("Missing DEPLOYER_PRIVATE_KEY or NEXT_PUBLIC_ALCHEMY_API_KEY in .env.local");
    process.exit(1);
  }

  if (!baseURI || baseURI.includes("your-")) {
    console.error(
      "Set NFT_METADATA_BASE_URI in .env.local (e.g. https://your-domain.com/api/token)"
    );
    process.exit(1);
  }

  if (!signerAddress || !ethers.isAddress(signerAddress)) {
    console.error("SIGNER_ADDRESS is missing or not a valid address in .env.local");
    process.exit(1);
  }

  if (!existsSync(artifactPath)) {
    console.error("Artifact missing. Run: npm run onchain:compile");
    process.exit(1);
  }

  const rpcUrls = buildRpcList(alchemyKey);
  const provider = await connectWithFallback(rpcUrls);

  const wallet = new ethers.Wallet(privateKey, provider);
  console.log("Deploying from:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance === BigInt(0)) {
    console.error("No Sepolia ETH. Get some from https://sepoliafaucet.com");
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log("Deploying ProofOfDev with baseURI:", baseURI);
  console.log("Using signer:", signerAddress);

  const contract = await deployWithRetry(factory, baseURI, signerAddress);
  const address = await contract.getAddress();

  // Sanity check: confirm the EIP-712 trusted signer landed correctly on-chain.
  const onChain = await getOnChainSigner(contract);
  if (!onChain) {
    console.warn(
      "⚠️  Could not find a signer getter on the deployed contract (tried: " +
        SIGNER_GETTER_CANDIDATES.join(", ") +
        "). Verify manually that minting works with your EIP-712 signature flow."
    );
  } else if (onChain.value.toLowerCase() !== signerAddress.toLowerCase()) {
    console.error(
      `❌ On-chain ${onChain.name}() = ${onChain.value} does not match SIGNER_ADDRESS = ${signerAddress}. EIP-712 minting will fail signature checks.`
    );
    process.exit(1);
  } else {
    console.log(`✓ On-chain ${onChain.name}() matches SIGNER_ADDRESS.`);
  }

  console.log("\nProofOfDev deployed to:", address);
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
  console.log(`NFT_METADATA_BASE_URI=${baseURI}`);
}

main().catch((err) => {
  console.error("Deployment failed:", err?.message ?? err);
  process.exit(1);
});
