'use client';

import { create } from 'zustand';

interface ProofState {
  tokenId: number | null;
  score: number | null;
  contractCount: number | null;
  verifiedContractCount: number | null;
  hasENS: boolean | null;
  hasMinted: boolean;
  isLoading: boolean;
  error: string | null;
  setProof: (proof: Partial<ProofState>) => void;
  reset: () => void;
}

export const useProof = create<ProofState>((set) => ({
  tokenId: null,
  score: null,
  contractCount: null,
  verifiedContractCount: null,
  hasENS: null,
  hasMinted: false,
  isLoading: false,
  error: null,

  setProof: (proof) => set((state) => ({ ...state, ...proof })),

  reset: () =>
    set({
      tokenId: null,
      score: null,
      contractCount: null,
      verifiedContractCount: null,
      hasENS: null,
      hasMinted: false,
      error: null,
    }),
}));
