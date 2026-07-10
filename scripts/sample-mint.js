const hre = require('hardhat');
const { ethers } = require('hardhat');

// Sample developer data
const SAMPLE_DEVELOPERS = [
  {
    name: 'Alice Chen',
    score: 850,
    contractCount: 12,
    verifiedContractCount: 10,
    hasENS: true
  },
  {
    name: 'Bob Martinez',
    score: 720,
    contractCount: 8,
    verifiedContractCount: 6,
    hasENS: true
  },
  {
    name: 'Charlie Wilson',
    score: 450,
    contractCount: 3,
    verifiedContractCount: 2,
    hasENS: false
  }
];

async function main() {
  console.log('🎯 Minting Sample Developer Tokens...');

  const [deployer, signer, dev1, dev2, dev3] = await ethers.getSigners();
  const developers = [dev1, dev2, dev3];

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) {
    throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS not set');
  }

  const proofOfDev = await ethers.getContractAt('ProofOfDev', contractAddress);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  console.log('\n📝 Minting Developer Tokens:\n');

  for (let i = 0; i < developers.length; i++) {
    const dev = developers[i];
    const devData = SAMPLE_DEVELOPERS[i];

    console.log(`Minting for ${devData.name}...`);
    console.log(`  Address: ${dev.address}`);
    console.log(`  Score: ${devData.score}`);
    console.log(`  Contracts: ${devData.contractCount}`);
    console.log(`  Verified: ${devData.verifiedContractCount}`);
    console.log(`  ENS: ${devData.hasENS}`);

    // Create signature
    const signature = await createSignature(
      signer,
      proofOfDev,
      dev.address,
      devData.score,
      devData.contractCount,
      devData.verifiedContractCount,
      devData.hasENS,
      0,
      deadline
    );

    // Mint token
    const tx = await proofOfDev.connect(dev).mint(
      devData.score,
      devData.contractCount,
      devData.verifiedContractCount,
      devData.hasENS,
      deadline,
      signature.v,
      signature.r,
      signature.s
    );

    const receipt = await tx.wait();
    console.log(`  ✅ Minted at block ${receipt.blockNumber}\n`);
  }

  console.log('🏆 Developer Reputation Leaderboard:');
  for (let i = 0; i < 3; i++) {
    const metadata = await proofOfDev.getMetadata(i + 1);
    console.log(
      `${i + 1}. ${SAMPLE_DEVELOPERS[i].name} - Score: ${metadata.score}, Contracts: ${metadata.contractCount}`
    );
  }
}

async function createSignature(
  signer,
  contract,
  to,
  score,
  contractCount,
  verifiedContractCount,
  hasENS,
  nonce,
  deadline
) {
  const domain = {
    name: 'ProofOfDev',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await contract.getAddress()
  };

  const types = {
    MintAttestation: [
      { name: 'to', type: 'address' },
      { name: 'score', type: 'uint256' },
      { name: 'contractCount', type: 'uint256' },
      { name: 'verifiedContractCount', type: 'uint256' },
      { name: 'hasENS', type: 'bool' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };

  const value = {
    to,
    score,
    contractCount,
    verifiedContractCount,
    hasENS,
    nonce,
    deadline
  };

  const signature = await signer.signTypedData(domain, types, value);
  const sig = ethers.Signature.from(signature);

  return {
    v: sig.v,
    r: sig.r,
    s: sig.s
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
