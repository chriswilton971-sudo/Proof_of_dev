const hre = require('hardhat');

async function main() {
  console.log('🚀 Deploying ProofOfDev Contract...');

  const [deployer] = await ethers.getSigners();
  console.log(`📍 Deploying from: ${deployer.address}`);

  // Get environment variables
  const baseURI = process.env.NFT_METADATA_BASE_URI || 'http://localhost:3000/api/token';
  const signerAddress = process.env.SIGNER_ADDRESS || deployer.address;

  if (!signerAddress || signerAddress === deployer.address) {
    console.log('⚠️  Warning: Using deployer as signer. Set SIGNER_ADDRESS for production.');
  }

  // Deploy contract
  const ProofOfDev = await ethers.getContractFactory('ProofOfDev');
  const proofOfDev = await ProofOfDev.deploy(baseURI, signerAddress);
  await proofOfDev.waitForDeployment();

  const contractAddress = await proofOfDev.getAddress();
  console.log(`✅ ProofOfDev deployed to: ${contractAddress}`);

  // Verify deployment
  console.log('\n📋 Deployment Verification:');
  console.log(`Name: ${await proofOfDev.name()}`);
  console.log(`Symbol: ${await proofOfDev.symbol()}`);
  console.log(`Owner: ${await proofOfDev.owner()}`);
  console.log(`Signer: ${await proofOfDev.signer()}`);
  console.log(`Total Supply: ${await proofOfDev.totalSupply()}`);

  console.log(`\n📝 Add to .env.local:`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
