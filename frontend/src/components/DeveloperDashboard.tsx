'use client';

import { useWallet } from '@/store/wallet';
import { useProof } from '@/store/proof';
import { useProofOfDev } from '@/hooks/useProofOfDev';
import { useEffect } from 'react';
import { Award, Zap, CheckCircle, Activity } from 'lucide-react';

export function DeveloperDashboard() {
  const { address, connected } = useWallet();
  const { tokenId, score, contractCount, verifiedContractCount, hasENS, hasMinted } = useProof();
  const { checkMintStatus, isLoading } = useProofOfDev();

  useEffect(() => {
    if (connected && address) {
      checkMintStatus();
    }
  }, [connected, address]);

  if (!connected) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 text-lg">Connect your wallet to view your developer profile</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading your profile...</p>
      </div>
    );
  }

  if (!hasMinted) {
    return (
      <div className="text-center py-12 bg-blue-50 rounded-lg border border-blue-200">
        <Award className="mx-auto mb-4 text-blue-500" size={48} />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Proof of Dev Token Yet</h3>
        <p className="text-gray-600">Mint your developer reputation NFT to get started</p>
      </div>
    );
  }

  const scorePercentage = ((score || 0) / 1000) * 100;

  return (
    <div className="space-y-6">
      {/* Token Card */}
      <div className="bg-gradient-to-br from-primary to-secondary rounded-lg p-8 text-white">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">Proof of Dev</h2>
            <p className="text-blue-100">Token ID: {tokenId}</p>
          </div>
          <CheckCircle size={40} />
        </div>
        <div className="space-y-2">
          <p className="text-blue-100">Your Developer Score</p>
          <div className="text-5xl font-bold">{score}</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score Progress */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="text-yellow-500" size={24} />
            <h3 className="font-semibold text-gray-900">Score Progress</h3>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${Math.min(scorePercentage, 100)}%` }}></div>
            </div>
            <p className="text-sm text-gray-600">
              {score} / 1000 points
            </p>
          </div>
        </div>

        {/* Contracts */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="text-blue-500" size={24} />
            <h3 className="font-semibold text-gray-900">Smart Contracts</h3>
          </div>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{contractCount}</p>
            <p className="text-sm text-gray-600">{verifiedContractCount} verified</p>
          </div>
        </div>

        {/* ENS Status */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="text-green-500" size={24} />
            <h3 className="font-semibold text-gray-900">ENS Domain</h3>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{hasENS ? '✓ Yes' : '✗ No'}</p>
            <p className="text-sm text-gray-600">DNS registered</p>
          </div>
        </div>
      </div>

      {/* Developer Info */}
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-4">Developer Profile</h3>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-gray-600">Wallet Address:</span>
            <span className="font-mono text-gray-900 ml-2">{address}</span>
          </p>
          <p>
            <span className="text-gray-600">Token ID:</span>
            <span className="font-mono text-gray-900 ml-2">#{tokenId}</span>
          </p>
          <p>
            <span className="text-gray-600">Total Contracts:</span>
            <span className="font-mono text-gray-900 ml-2">{contractCount}</span>
          </p>
          <p>
            <span className="text-gray-600">Reputation Score:</span>
            <span className="font-mono text-gray-900 ml-2">{score}/1000</span>
          </p>
        </div>
      </div>
    </div>
  );
}
