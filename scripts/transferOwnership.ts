/**
 * Step 1 of 2 for handing contract ownership to KeeperHub's wallet.
 *
 * Calls transferOwnership(newOwner) on the deployed ProofOfDev contract.
 * This ONLY starts the transfer — ownership doesn't actually move until
 * the new owner calls acceptOwnership() back (see contracts/ProofOfDev.sol,
 * a standard two-step/Ownable2Step-style pattern). That second call has to
 * come from KeeperHub's own wallet — nobody else can sign it. After running
 * this, the transfer will sit as "pending" until KeeperHub accepts it,
 * either via their dashboard or by asking their support to trigger it for
 * this address.
 *
 * Usage:
 *   npm run onchain:transfer-ownership -- 0xNewOwnerAddress
 *
 * Required env (.env.local):
 *   DEPLOYER_PRIVATE_KEY        — must be the CURRENT owner's key
 *   NEXT_PUBLIC_CONTRACT_ADDRESS
 *   NEXT_PUBLIC_ALCHEMY_API_KEY
 */

import "./load-env.js";
import { ethers } from "ethers";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, "artifacts/ProofOfDev.json");

async function main() {
  const newOwner = process.argv[2];
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

  if (!newOwner || !ethers.isAddress(newOwner)) {
    console.error("Usage: npm run onchain:transfer-ownership -- 0xNewOwnerAddress");
    process.exit(1);
  }
  if (!privateKey || !contractAddress || !alchemyKey) {
    console.error(
      "Missing DEPLOYER_PRIVATE_KEY, NEXT_PUBLIC_CONTRACT_ADDRESS, or NEXT_PUBLIC_ALCHEMY_API_KEY in .env.local"
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

  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const contract = new ethers.Contract(contractAddress, artifact.abi, wallet);

  const currentOwner: string = await contract.owner();
  console.log("Contract:", contractAddress);
  console.log("Current owner:", currentOwner);
  console.log("Calling from:", wallet.address);

  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error(
      "\nDEPLOYER_PRIVATE_KEY does not match the current owner — this call would revert " +
        "(transferOwnership is onlyOwner). Nothing was sent."
    );
    process.exit(1);
  }

  console.log(`\nCalling transferOwnership(${newOwner})...`);
  const tx = await contract.transferOwnership(newOwner);
  console.log("tx:", tx.hash);
  await tx.wait();

  console.log("\nDone — ownership transfer is now PENDING, not complete.");
  console.log(`pendingOwner is now: ${await contract.pendingOwner()}`);
  console.log(
    `\nSomeone controlling ${newOwner} must now call acceptOwnership() on the contract ` +
      "for the transfer to finalize. If this is KeeperHub's wallet, that has to happen " +
      "from their side (dashboard/API/support) — it can't be triggered from here."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
