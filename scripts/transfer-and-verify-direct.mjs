/**
 * Minimal, direct version bypassing submit-hackathon.mjs's buffering issue.
 * 1. Transfer ownership to KeeperHub's wallet (if not already).
 * 2. Run the real markVerified flow via KeeperHub.
 * 3. Write SUBMISSION.md.
 */
import { config } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
config({ path: resolve(root, ".env.local") });

const tokenId = process.argv[2];
const keeperHubWallet = process.argv[3];

const {
  DEPLOYER_PRIVATE_KEY,
  NEXT_PUBLIC_ALCHEMY_API_KEY,
  NEXT_PUBLIC_CONTRACT_ADDRESS,
} = process.env;

const OWNABLE_ABI = ["function owner() view returns (address)", "function transferOwnership(address) external"];
const provider = new ethers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${NEXT_PUBLIC_ALCHEMY_API_KEY}`);
const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(NEXT_PUBLIC_CONTRACT_ADDRESS, OWNABLE_ABI, deployer);

const currentOwner = await contract.owner();
console.log("STEP1_CURRENT_OWNER:", currentOwner);

if (currentOwner.toLowerCase() !== keeperHubWallet.toLowerCase()) {
  console.log("STEP1_TRANSFERRING...");
  const tx = await contract.transferOwnership(keeperHubWallet);
  console.log("STEP1_TX:", tx.hash);
  await tx.wait();
  console.log("STEP1_CONFIRMED");
} else {
  console.log("STEP1_ALREADY_OWNED");
}

console.log("STEP2_CALLING_MARKVERIFIED...");
const { verifyMintOnChain } = await import("../services/analysis/keeperhub.js");
const result = await verifyMintOnChain({ network: "sepolia", contractAddress: NEXT_PUBLIC_CONTRACT_ADDRESS, tokenId });
console.log("STEP2_RESULT:", JSON.stringify(result));

const txHash = result?.status?.txHash ?? result?.status?.transactionHash ?? result?.txHash ?? null;
writeFileSync(resolve(root, "SUBMISSION.md"), `# DoraHacks Submission

- Repo: https://github.com/chriswilton971-sudo/Proof_of_dev
- Contract: https://sepolia.etherscan.io/address/${NEXT_PUBLIC_CONTRACT_ADDRESS}
- Token ID: ${tokenId}
- markVerified tx: ${txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : "see raw result below"}

## Raw result
\`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`
`);
console.log("STEP3_WROTE_SUBMISSION_MD");
