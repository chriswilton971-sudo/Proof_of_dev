'use client';

import { useWallet } from '@/store/wallet';
import { useProof } from '@/store/proof';
import { ethers } from 'ethers';
import { ABI } from '@/lib/abi';
import { useState } from 'react';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';

export function useProofOfDev() {
  const { address, provider, signer } = useWallet();
  const { setProof } = useProof();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getContract = (signerOrProvider = provider) => {
    if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured');
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
  };

  const checkMintStatus = async () => {
    if (!address || !provider) return;
    try {
      setIsLoading(true);
      const contract = getContract(provider);
      const hasMinted = await contract.hasMinted(address);

      if (hasMinted) {
        const tokenId = await contract.getTokenByAddress(address);
        const metadata = await contract.getMetadata(tokenId);

        setProof({
          tokenId: Number(tokenId),
          score: Number(metadata.score),
          contractCount: Number(metadata.contractCount),
          verifiedContractCount: Number(metadata.verifiedContractCount),
          hasENS: metadata.hasENS,
          hasMinted: true,
        });
      }
    } catch (err) {
      console.error('Error checking mint status:', err);
      setError(err instanceof Error ? err.message : 'Failed to check mint status');
    } finally {
      setIsLoading(false);
    }
  };

  const mint = async (score: number, contractCount: number, verifiedCount: number, hasENS: boolean, signature: any) => {
    if (!signer || !address) throw new Error('Wallet not connected');
    try {
      setIsLoading(true);
      setError(null);
      const contract = getContract(signer);
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const tx = await contract.mint(score, contractCount, verifiedCount, hasENS, deadline, signature.v, signature.r, signature.s);
      const receipt = await tx.wait();

      await checkMintStatus();
      return receipt;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Minting failed';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const burn = async () => {
    if (!signer) throw new Error('Wallet not connected');
    try {
      setIsLoading(true);
      setError(null);
      const contract = getContract(signer);
      const tx = await contract.burn();
      await tx.wait();
      setProof({ hasMinted: false, tokenId: null });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Burn failed';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    checkMintStatus,
    mint,
    burn,
    isLoading,
    error,
  };
}
