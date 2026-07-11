'use client';

import { create } from 'zustand';
import { ethers } from 'ethers';

interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  connected: boolean;
  chainId: number | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: (chainId: number) => Promise<void>;
}

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  provider: null,
  signer: null,
  connected: false,
  chainId: null,
  isConnecting: false,

  connect: async () => {
    set({ isConnecting: true });
    try {
      if (!window.ethereum) throw new Error('MetaMask not installed');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      set({
        address: accounts[0],
        provider,
        signer,
        connected: true,
        chainId: Number(network.chainId),
        isConnecting: false,
      });
    } catch (error) {
      console.error('Failed to connect:', error);
      set({ isConnecting: false });
      throw error;
    }
  },

  disconnect: () => {
    set({
      address: null,
      provider: null,
      signer: null,
      connected: false,
      chainId: null,
    });
  },

  switchChain: async (chainId: number) => {
    try {
      await window.ethereum?.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      set({ chainId });
    } catch (error) {
      console.error('Failed to switch chain:', error);
      throw error;
    }
  },
}));
