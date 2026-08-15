/**
 * scripts/mint-self-and-verify.mjs
 *
 * End-to-end, no live web app required:
 *   1. Sign an EIP-712 MintAttestation with MINT_SIGNER_PRIVATE_KEY
 *      (matches contracts/ProofOfDev.sol's domain/typehash exactly)
 *   2. Call mint() from DEPLOYER_PRIVATE_KEY's wallet (it becomes the
 *      token owner -- mint() uses msg.sender as recipient)
 *   3. Read the resulting tokenId from the Minted event
 *   4. Run the real simulate -> execute -> poll markVerified(tokenId)
 *      flow through KeeperHub
 *   5. Write SUBMISSION.md with the transaction link
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
config({ path: resolve(root, ".env.local") });

const {
  DEPLOYER_PRIVATE_KEY,
  MINT_SIGNER_PRIVATE_KEY,
  NEXT_PUBLIC_ALCHEMY_API_KEY,
  NEXT_PUBLIC_CONTRACT_ADDRESS,
} = process.env;

for (const [name, val] of Object.entries({
  DEPLOYER_PRIVATE_KEY,
  MINT_SIGNER_PRIVATE_KEY,
  NEXT_PUBLIC_ALCHEMY_API_KEY,
  NEXT_PUBLIC_CONTRACT_ADDRESS,
})) {
  if (!val) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
}

const ABI = [
  "function mint(uint256 score, uint256 contractCount, uint256 verifiedContractCount, bool hasENS, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external returns (uint256 tokenId)",
  "function nonces(address) view returns (uint256)",
  "event Minted(address indexed to, uint256 indexed tokenId, uint256 score)",
];

const provider = new ethers.JsonRpcProvider(`https://eth-sepolia.g.alchemy.com/v2/${NEXT_PUBLIC_ALCHEMY_API_KEY}`);
const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const mintSigner = new ethers.Wallet(MINT_SIGNER_PRIVATE_KEY);
const contract = new ethers.Contract(NEXT_PUBLIC_CONTRACT_ADDRESS, ABI, deployer);

console.log("Minting to:", deployer.address);
console.log("Mint signer:", mintSigner.address);

const score = 42n;
const contractCount = 3n;
const verifiedContractCount = 1n;
const hasENS = false;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const nonce = await contract.nonces(deployer.address);

const network = await provider.getNetwork();

const domain = {
  name: "ProofOfDev",
  version: "1",
  chainId: network.chainId,
  verifyingContract: NEXT_PUBLIC_CONTRACT_ADDRESS,
};

const types = {
  MintAttestation: [
    { name: "to", type: "address" },
    { name: "score", type: "uint256" },
    { name: "contractCount", type: "uint256" },
    { name: "verifiedContractCount", type: "uint256" },
    { name: "hasENS", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const value = {
  to: deployer.address,
  score,
  contractCount,
  verifiedContractCount,
  hasENS,
  nonce,
  deadline,
};

console.log("Signing mint attestation...");
const signature = await mintSigner.signTypedData(domain, types, value);
const { v, r, s } = ethers.Signature.from(signature);

console.log("Submitting mint()...");
const tx = await contract.mint(score, contractCount, verifiedContractCount, hasENS, deadline, v, r, s);
console.log("Mint tx:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
const receipt = await tx.wait();

const mintedEvent = receipt.logs
  .map((log) => {
    try {
      return contract.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed) => parsed?.name === "Minted");

if (!mintedEvent) {
  console.error("Could not find Minted event in receipt.");
  process.exit(1);
}

const tokenId = mintedEvent.args.tokenId.toString();
console.log(`Minted tokenId ${tokenId} to ${deployer.address}`);

console.log(`\nRunning markVerified(${tokenId}) via KeeperHub...`);
const { verifyMintOnChain } = await import("../services/analysis/keeperhub.js");

let demoResult;
try {
  demoResult = await verifyMintOnChain({
    network: "sepolia",
    contractAddress: NEXT_PUBLIC_CONTRACT_ADDRESS,
    tokenId,
  });
  console.log("KeeperHub result:", JSON.stringify(demoResult, null, 2));
} catch (err) {
  console.error("KeeperHub markVerified failed:", err.message);
  writeFileSync(
    resolve(root, "SUBMISSION.md"),
    `# Partial result — mint succeeded, KeeperHub markVerified failed\n\n` +
      `- Mint tx: https://sepolia.etherscan.io/tx/${tx.hash}\n` +
      `- Token ID: ${tokenId}\n` +
      `- KeeperHub error: ${err.message}\n`
  );
  process.exit(1);
}

const txHash = demoResult?.status?.txHash ?? demoResult?.status?.transactionHash ?? demoResult?.txHash ?? null;
const txLink = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : "NOT FOUND — check demoResult below manually";

writeFileSync(
  resolve(root, "SUBMISSION.md"),
  `# DoraHacks submission — KeeperHub Agents Onchain Hackathon

Generated ${new Date().toISOString()}

- **Repo:** https://github.com/chriswilton971-sudo/Proof_of_dev
- **Contract:** https://sepolia.etherscan.io/address/${NEXT_PUBLIC_CONTRACT_ADDRESS}
- **Mint transaction:** https://sepolia.etherscan.io/tx/${tx.hash}
- **Token ID:** ${tokenId}
- **markVerified() transaction executed via KeeperHub:** ${txLink}
- **Demo video:** _(record separately)_

## Raw KeeperHub result
\`\`\`json
${JSON.stringify(demoResult, null, 2)}
\`\`\`
`
);

console.log("\nWrote SUBMISSION.md.");
