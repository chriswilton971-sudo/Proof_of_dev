/**
 * Deploy ProofOfDev contract to Sepolia.
 *
 * Usage:
 *   npm run onchain:compile   # once
 *   npm run onchain:deploy
 *
 * Required env (.env.local):
 *   DEPLOYER_PRIVATE_KEY
 *   MINT_SIGNER_PRIVATE_KEY     — signs mint authorizations; its address
 *                                 becomes the contract's trustedSigner
 *   NEXT_PUBLIC_ALCHEMY_API_KEY
 *   NFT_METADATA_BASE_URI  — e.g. https://your-domain.com/api/token
 */

import "./load-env.js";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, "artifacts/ProofOfDev.json");

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const mintSignerKey = process.env.MINT_SIGNER_PRIVATE_KEY;
  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
  const baseURI =
    process.env.NFT_METADATA_BASE_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/token`
      : "");

  if (!privateKey || !alchemyKey) {
    console.error("Missing DEPLOYER_PRIVATE_KEY or NEXT_PUBLIC_ALCHEMY_API_KEY in .env.local");
    process.exit(1);
  }

  if (!mintSignerKey) {
    console.error(
      "Missing MINT_SIGNER_PRIVATE_KEY in .env.local — this wallet's address becomes " +
        "the contract's trustedSigner and must match the key used by the mint-authorization API route."
    );
    process.exit(1);
  }

  if (!baseURI || baseURI.includes("your-")) {
    console.error(
      "Set NFT_METADATA_BASE_URI in .env.local (e.g. https://your-domain.com/api/token)"
    );
    process.exit(1);
  }

  if (!existsSync(artifactPath)) {
    console.error("Artifact missing. Run: npm run onchain:compile");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(
    `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
  );

  const wallet = new ethers.Wallet(privateKey, provider);
  const trustedSignerAddress = new ethers.Wallet(mintSignerKey).address;
  console.log("Deploying from:", wallet.address);
  console.log("trustedSigner will be:", trustedSignerAddress);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  if (balance === BigInt(0)) {
    console.error("No Sepolia ETH. Get some from https://sepoliafaucet.com");
    process.exit(1);
  }

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Deploying ProofOfDev with baseURI:", baseURI);
  const contract = await factory.deploy(baseURI, trustedSignerAddress);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\nProofOfDev deployed to:", address);
  console.log("\nAdd to .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
  console.log(`NFT_METADATA_BASE_URI=${baseURI}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
