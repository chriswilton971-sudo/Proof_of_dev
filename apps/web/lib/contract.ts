/**
 * ProofOfDev contract ABI and address.
 * Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local after deploying.
 * Deploy instructions are in the README.
 */

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";

export const CONTRACT_ABI = [
  // Read
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getTokenByAddress",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    // NOTE: the contract's public state variable is `signer`, not
    // `trustedSigner` (only the README/docs use the descriptive name
    // "trusted signer" — the actual on-chain getter is `signer()`).
    inputs: [],
    name: "signer",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    // Required for EIP-712 signing — mint()/updateScore() both bind the
    // caller's current nonce into the signed struct hash, so the signer
    // must read this before producing a signature or the recovered
    // address won't match `signer` and the call reverts.
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "nonces",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "getMetadata",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "score", type: "uint256" },
          { internalType: "uint256", name: "contractCount", type: "uint256" },
          {
            internalType: "uint256",
            name: "verifiedContractCount",
            type: "uint256",
          },
          { internalType: "bool", name: "hasENS", type: "bool" },
          { internalType: "uint256", name: "mintedAt", type: "uint256" },
          // Previously missing — the contract's DevMetadata struct has 6
          // fields, not 5. With this omitted, ethers decoded the tuple
          // against the wrong shape and either threw or silently
          // misaligned every field after hasENS.
          { internalType: "uint256", name: "updatedAt", type: "uint256" },
        ],
        internalType: "struct ProofOfDev.DevMetadata",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "isVerified",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Write
  {
    inputs: [
      { internalType: "uint256", name: "score", type: "uint256" },
      { internalType: "uint256", name: "contractCount", type: "uint256" },
      {
        internalType: "uint256",
        name: "verifiedContractCount",
        type: "uint256",
      },
      { internalType: "bool", name: "hasENS", type: "bool" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    // Owner-only — called by the KeeperHub automation wallet as a post-mint
    // follow-up (see contracts/ProofOfDev.sol). Included here for
    // completeness/tooling; the dashboard never calls this itself.
    inputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    name: "markVerified",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "to", type: "address" },
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "score",
        type: "uint256",
      },
    ],
    name: "Minted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      { indexed: true, internalType: "address", name: "by", type: "address" },
    ],
    name: "Verified",
    type: "event",
  },
] as const;
