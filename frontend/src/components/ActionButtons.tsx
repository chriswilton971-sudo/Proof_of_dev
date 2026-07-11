'use client';

import { useWallet } from '@/store/wallet';
import { useProof } from '@/store/proof';
import { useProofOfDev } from '@/hooks/useProofOfDev';
import { Flame, RefreshCw } from 'lucide-react';
import { useState } from 'react';

export function ActionButtons() {
  const { address } = useWallet();
  const { hasMinted } = useProof();
  const { burn, checkMintStatus, isLoading } = useProofOfDev();
  const [localLoading, setLocalLoading] = useState(false);

  const handleBurn = async () => {
    try {
      setLocalLoading(true);
      await burn();
    } catch (error) {
      console.error('Burn failed:', error);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setLocalLoading(true);
      await checkMintStatus();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setLocalLoading(false);
    }
  };

  if (!address) return null;

  return (
    <div className="flex gap-4">
      <button
        onClick={handleRefresh}
        disabled={isLoading || localLoading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition"
      >
        <RefreshCw size={18} className={localLoading ? 'animate-spin' : ''} />
        Refresh Status
      </button>

      {hasMinted && (
        <button
          onClick={handleBurn}
          disabled={isLoading || localLoading}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white rounded-lg transition"
        >
          <Flame size={18} />
          Burn Token
        </button>
      )}
    </div>
  );
}
