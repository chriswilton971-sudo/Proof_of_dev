/*
  submit hackathon.njs
  Updated: add submission information for hackathon token id 1
*/

const submission = {
  submitter: "0x700f0Cf10B7daD38D025DB8BF18f1F03294ffB74",
  tokenId: 1,
  timestamp: new Date().toISOString(),
};

module.exports = submission;

/*
  Optional CLI / on-chain example (commented out).
  To actually submit on-chain you'll need:
    - RPC_URL (provider)
    - CONTRACT_ADDRESS (the contract handling submissions)
    - PRIVATE_KEY (signer; keep secret, do NOT commit)
  Uncomment and fill in environment variables to use.

const { ethers } = require("ethers");

async function submitOnChain() {
  const rpc = process.env.RPC_URL;
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;

  if (!rpc || !contractAddress || !privateKey) {
    console.error("RPC_URL, CONTRACT_ADDRESS, and PRIVATE_KEY must be set to submit on-chain.");
    return;
  }

  const provider = new ethers.providers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Replace ABI and method with your contract's actual ABI and function name
  const abi = ["function submitHackathon(address submitter, uint256 tokenId)"];
  const contract = new ethers.Contract(contractAddress, abi, wallet);

  const tx = await contract.submitHackathon(submission.submitter, submission.tokenId);
  console.log("Submitted tx hash:", tx.hash);
  await tx.wait();
  console.log("Submission confirmed");
}

if (require.main === module) {
  console.log("Local submission object:", submission);
  // submitOnChain().catch(console.error);
}
*/
