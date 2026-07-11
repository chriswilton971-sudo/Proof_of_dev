'use client';

import { useWallet } from '@/store/wallet';
import { useEffect, useState } from 'react';
import { Wallet, LogOut, Loader } from 'lucide-react';

export function ConnectWallet() {
  const { address, connected, isConnecting, connect, disconnect } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  if (connected && address) {
    return (
      <button
        onClick={disconnect}
        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
      >
        <LogOut size={18} />
        {truncateAddress(address)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition"
    >
      {isConnecting ? <Loader size={18} className="animate-spin" /> : <Wallet size={18} />}
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}
