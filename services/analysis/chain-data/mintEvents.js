/**
 * Verifies that a `Minted` event was actually emitted by the ProofOfDev
 * contract in a given transaction, and decodes the tokenId/account from it.
 *
 * Used to gate the KeeperHub post-mint webhook (see api.js and
 * ../keeperhub.js): we never trigger a paid autonomous KeeperHub workflow
 * off of client-supplied tokenId/account alone — we look the transaction up
 * on-chain (via Etherscan's proxy module, matching this file's existing
 * Etherscan-only chain-data pattern — no separate RPC/WebSocket provider) and
 * only proceed once the Minted log genuinely exists.
 */

import { ETHERSCAN_URLS, ETHERSCAN_KEY } from "../config.js";
import { fetchJson, buildEtherscanUrl } from "./http.js";

// keccak256("Minted(address,uint256,uint256)")
export const MINTED_TOPIC0 =
  "0x25b428dfde728ccfaddad7e29e4ac23c24ed7fd1a6e3e3f91894a9a073f5dfff";

/**
 * @param {{ txHash: string, contractAddress: string, chainId: number }} params
 * @returns {Promise<{ found: boolean, tokenId?: string, account?: string }>}
 */
export async function verifyMintedEvent({ txHash, contractAddress, chainId }) {
  const base = ETHERSCAN_URLS[chainId];
  if (!base) {
    throw new Error(`No Etherscan endpoint configured for chainId ${chainId}`);
  }

  const url = buildEtherscanUrl(base, {
    module: "proxy",
    action: "eth_getTransactionReceipt",
    txhash: txHash,
    apikey: ETHERSCAN_KEY,
  });

  const data = await fetchJson(url);
  const receipt = data?.result;
  if (!receipt || !Array.isArray(receipt.logs)) {
    return { found: false };
  }

  const target = contractAddress.toLowerCase();
  const log = receipt.logs.find(
    (l) =>
      l.address?.toLowerCase() === target &&
      l.topics?.[0]?.toLowerCase() === MINTED_TOPIC0,
  );

  if (!log) return { found: false };

  // event Minted(address indexed to, uint256 indexed tokenId, uint256 score)
  // topics[1] = to (address, left-padded), topics[2] = tokenId
  const account = `0x${log.topics[1].slice(-40)}`;
  const tokenId = BigInt(log.topics[2]).toString();

  return { found: true, tokenId, account };
}
