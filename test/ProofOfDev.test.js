const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ProofOfDev - Developer Activity Tests', () => {
  let proofOfDev;
  let owner, signer, dev1, dev2, dev3, nonDev;
  const BASE_URI = 'https://api.proofofdev.com/metadata';
  const DEADLINE = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const EIP712_DOMAIN_TYPEHASH = ethers.id('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  const MINT_TYPEHASH = ethers.id('MintAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 nonce,uint256 deadline)');
  const UPDATE_TYPEHASH = ethers.id('UpdateAttestation(address to,uint256 score,uint256 contractCount,uint256 verifiedContractCount,bool hasENS,uint256 nonce,uint256 deadline)');

  // Developer profiles with sample chain data
  const devProfiles = {
    dev1: {
      name: 'Alice Chen',
      address: null,
      score: 850,
      contractCount: 12,
      verifiedContractCount: 10,
      hasENS: true,
      description: 'Lead Smart Contract Developer'
    },
    dev2: {
      name: 'Bob Martinez',
      address: null,
      score: 720,
      contractCount: 8,
      verifiedContractCount: 6,
      hasENS: true,
      description: 'DeFi Protocol Developer'
    },
    dev3: {
      name: 'Charlie Wilson',
      address: null,
      score: 450,
      contractCount: 3,
      verifiedContractCount: 2,
      hasENS: false,
      description: 'Junior Smart Contract Developer'
    }
  };

  beforeEach(async () => {
    [owner, signer, dev1, dev2, dev3, nonDev] = await ethers.getSigners();
    
    // Store addresses
    devProfiles.dev1.address = dev1.address;
    devProfiles.dev2.address = dev2.address;
    devProfiles.dev3.address = dev3.address;

    // Deploy contract
    const ProofOfDev = await ethers.getContractFactory('ProofOfDev');
    proofOfDev = await ProofOfDev.deploy(BASE_URI, signer.address);
    await proofOfDev.waitForDeployment();
  });

  describe('Contract Initialization', () => {
    it('Should deploy with correct name and symbol', async () => {
      expect(await proofOfDev.name()).to.equal('Proof of Dev');
      expect(await proofOfDev.symbol()).to.equal('POD');
    });

    it('Should set owner and signer correctly', async () => {
      expect(await proofOfDev.owner()).to.equal(owner.address);
      expect(await proofOfDev.signer()).to.equal(signer.address);
    });

    it('Should initialize with zero total supply', async () => {
      expect(await proofOfDev.totalSupply()).to.equal(0);
    });
  });

  describe('Developer Minting with Chain Activity Data', () => {
    it('Should mint token for dev1 (Alice - High Activity)', async () => {
      const profile = devProfiles.dev1;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      const tx = await proofOfDev.connect(dev1).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      await expect(tx)
        .to.emit(proofOfDev, 'Transfer')
        .withArgs(ethers.ZeroAddress, dev1.address, 1);
      
      await expect(tx)
        .to.emit(proofOfDev, 'Minted')
        .withArgs(dev1.address, 1, profile.score);

      // Verify token ownership
      expect(await proofOfDev.balanceOf(dev1.address)).to.equal(1);
      expect(await proofOfDev.ownerOf(1)).to.equal(dev1.address);
      expect(await proofOfDev.totalSupply()).to.equal(1);

      // Verify metadata
      const metadata = await proofOfDev.getMetadata(1);
      expect(metadata.score).to.equal(profile.score);
      expect(metadata.contractCount).to.equal(profile.contractCount);
      expect(metadata.verifiedContractCount).to.equal(profile.verifiedContractCount);
      expect(metadata.hasENS).to.equal(profile.hasENS);
    });

    it('Should mint token for dev2 (Bob - Medium Activity)', async () => {
      const profile = devProfiles.dev2;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev2.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      await proofOfDev.connect(dev2).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      const metadata = await proofOfDev.getMetadata(1);
      expect(metadata.score).to.equal(profile.score);
    });

    it('Should mint token for dev3 (Charlie - Low Activity)', async () => {
      const profile = devProfiles.dev3;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev3.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      await proofOfDev.connect(dev3).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      const metadata = await proofOfDev.getMetadata(1);
      expect(metadata.score).to.equal(profile.score);
      expect(metadata.contractCount).to.equal(profile.contractCount);
    });
  });

  describe('Soulbound Protection (Non-Transferable)', () => {
    beforeEach(async () => {
      // Mint a token for dev1
      const profile = devProfiles.dev1;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      await proofOfDev.connect(dev1).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );
    });

    it('Should prevent transferFrom', async () => {
      await expect(
        proofOfDev.connect(dev1).transferFrom(dev1.address, dev2.address, 1)
      ).to.be.revertedWithCustomError(proofOfDev, 'NonTransferable');
    });

    it('Should prevent safeTransferFrom', async () => {
      await expect(
        proofOfDev.connect(dev1)['safeTransferFrom(address,address,uint256)'](dev1.address, dev2.address, 1)
      ).to.be.revertedWithCustomError(proofOfDev, 'NonTransferable');
    });

    it('Should prevent approve', async () => {
      await expect(
        proofOfDev.connect(dev1).approve(dev2.address, 1)
      ).to.be.revertedWithCustomError(proofOfDev, 'NonTransferable');
    });

    it('Should prevent setApprovalForAll', async () => {
      await expect(
        proofOfDev.connect(dev1).setApprovalForAll(dev2.address, true)
      ).to.be.revertedWithCustomError(proofOfDev, 'NonTransferable');
    });

    it('Should return zero address for getApproved', async () => {
      expect(await proofOfDev.getApproved(1)).to.equal(ethers.ZeroAddress);
    });

    it('Should return false for isApprovedForAll', async () => {
      expect(await proofOfDev.isApprovedForAll(dev1.address, dev2.address)).to.equal(false);
    });
  });

  describe('Score Updates (Developer Activity Changes)', () => {
    beforeEach(async () => {
      // Mint a token for dev1
      const profile = devProfiles.dev1;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      await proofOfDev.connect(dev1).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );
    });

    it('Should update score after new on-chain activity', async () => {
      const newScore = 900;
      const newContractCount = 15;
      const newVerifiedCount = 12;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        newScore,
        newContractCount,
        newVerifiedCount,
        true,
        1, // nonce incremented
        DEADLINE
      );

      const tx = await proofOfDev.connect(dev1).updateScore(
        newScore,
        newContractCount,
        newVerifiedCount,
        true,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      await expect(tx)
        .to.emit(proofOfDev, 'ScoreUpdated')
        .withArgs(dev1.address, 1, 850, newScore);

      const metadata = await proofOfDev.getMetadata(1);
      expect(metadata.score).to.equal(newScore);
      expect(metadata.contractCount).to.equal(newContractCount);
    });

    it('Should track updated timestamp', async () => {
      const metadataBeforeUpdate = await proofOfDev.getMetadata(1);
      const mintedAt = metadataBeforeUpdate.mintedAt;
      const updatedAtBefore = metadataBeforeUpdate.updatedAt;

      // Wait a bit before updating
      await ethers.provider.send('hardhat_mine', ['0x2']); // Mine 2 blocks

      const newScore = 875;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        newScore,
        devProfiles.dev1.contractCount,
        devProfiles.dev1.verifiedContractCount,
        devProfiles.dev1.hasENS,
        1,
        DEADLINE
      );

      await proofOfDev.connect(dev1).updateScore(
        newScore,
        devProfiles.dev1.contractCount,
        devProfiles.dev1.verifiedContractCount,
        devProfiles.dev1.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      const metadataAfterUpdate = await proofOfDev.getMetadata(1);
      expect(metadataAfterUpdate.updatedAt).to.be.greaterThan(updatedAtBefore);
      expect(metadataAfterUpdate.mintedAt).to.equal(mintedAt);
    });
  });

  describe('Token Burning', () => {
    beforeEach(async () => {
      const profile = devProfiles.dev1;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      await proofOfDev.connect(dev1).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );
    });

    it('Should allow developer to burn their own token', async () => {
      const tx = await proofOfDev.connect(dev1).burn();

      await expect(tx)
        .to.emit(proofOfDev, 'Transfer')
        .withArgs(dev1.address, ethers.ZeroAddress, 1);

      expect(await proofOfDev.balanceOf(dev1.address)).to.equal(0);
      expect(await proofOfDev.hasMinted(dev1.address)).to.equal(false);
    });

    it('Should allow re-minting after burning', async () => {
      await proofOfDev.connect(dev1).burn();

      const profile = devProfiles.dev1;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        1, // nonce incremented after burn
        DEADLINE
      );

      await proofOfDev.connect(dev1).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      expect(await proofOfDev.balanceOf(dev1.address)).to.equal(1);
      expect(await proofOfDev.totalSupply()).to.equal(1);
    });
  });

  describe('Chain Data Scenarios', () => {
    it('Should handle multiple developers at different activity levels', async () => {
      // Mint all three developers
      const profiles = Object.values(devProfiles).slice(0, 3);
      const developers = [dev1, dev2, dev3];

      for (let i = 0; i < 3; i++) {
        const profile = profiles[i];
        const signature = await createSignature(
          signer,
          proofOfDev,
          developers[i].address,
          profile.score,
          profile.contractCount,
          profile.verifiedContractCount,
          profile.hasENS,
          0,
          DEADLINE
        );

        await proofOfDev.connect(developers[i]).mint(
          profile.score,
          profile.contractCount,
          profile.verifiedContractCount,
          profile.hasENS,
          DEADLINE,
          signature.v,
          signature.r,
          signature.s
        );
      }

      expect(await proofOfDev.totalSupply()).to.equal(3);

      // Verify each developer's metadata
      const metadata1 = await proofOfDev.getMetadata(1);
      const metadata2 = await proofOfDev.getMetadata(2);
      const metadata3 = await proofOfDev.getMetadata(3);

      expect(metadata1.score).to.equal(850); // Alice
      expect(metadata2.score).to.equal(720); // Bob
      expect(metadata3.score).to.equal(450); // Charlie

      console.log('\n📊 Developer Reputation Leaderboard:');
      console.log(`1. Alice Chen (${metadata1.score} pts) - ${metadata1.contractCount} contracts`);
      console.log(`2. Bob Martinez (${metadata2.score} pts) - ${metadata2.contractCount} contracts`);
      console.log(`3. Charlie Wilson (${metadata3.score} pts) - ${metadata3.contractCount} contracts`);
    });

    it('Should prevent duplicate minting from same address', async () => {
      const profile = devProfiles.dev1;
      const signature = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        0,
        DEADLINE
      );

      // First mint succeeds
      await proofOfDev.connect(dev1).mint(
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        DEADLINE,
        signature.v,
        signature.r,
        signature.s
      );

      // Second mint from same address fails
      const signature2 = await createSignature(
        signer,
        proofOfDev,
        dev1.address,
        profile.score,
        profile.contractCount,
        profile.verifiedContractCount,
        profile.hasENS,
        1,
        DEADLINE
      );

      await expect(
        proofOfDev.connect(dev1).mint(
          profile.score,
          profile.contractCount,
          profile.verifiedContractCount,
          profile.hasENS,
          DEADLINE,
          signature2.v,
          signature2.r,
          signature2.s
        )
      ).to.be.revertedWithCustomError(proofOfDev, 'AlreadyMinted');
    });
  });

  describe('Admin Functions', () => {
    it('Should allow owner to update signer', async () => {
      const newSigner = dev3;
      const tx = await proofOfDev.connect(owner).setSigner(newSigner.address);

      await expect(tx)
        .to.emit(proofOfDev, 'SignerUpdated')
        .withArgs(signer.address, newSigner.address);

      expect(await proofOfDev.signer()).to.equal(newSigner.address);
    });

    it('Should allow owner to update base URI', async () => {
      const newURI = 'https://new-api.proofofdev.com/metadata';
      const tx = await proofOfDev.connect(owner).setBaseURI(newURI);

      await expect(tx)
        .to.emit(proofOfDev, 'BaseURIUpdated')
        .withArgs(BASE_URI, newURI);
    });

    it('Should prevent non-owner from updating signer', async () => {
      await expect(
        proofOfDev.connect(dev1).setSigner(dev2.address)
      ).to.be.revertedWithCustomError(proofOfDev, 'NotOwner');
    });
  });
});

// Helper function to create EIP-712 signatures
async function createSignature(
  signer,
  contract,
  to,
  score,
  contractCount,
  verifiedContractCount,
  hasENS,
  nonce,
  deadline,
  isUpdate = false
) {
  const domain = {
    name: 'ProofOfDev',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await contract.getAddress()
  };

  const types = isUpdate ? {
    UpdateAttestation: [
      { name: 'to', type: 'address' },
      { name: 'score', type: 'uint256' },
      { name: 'contractCount', type: 'uint256' },
      { name: 'verifiedContractCount', type: 'uint256' },
      { name: 'hasENS', type: 'bool' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  } : {
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

  const typeKey = isUpdate ? 'UpdateAttestation' : 'MintAttestation';
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
