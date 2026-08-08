# Prompt for a KeeperHub-MCP-connected agent (Claude Code / Cursor)

Paste this after `/keeperhub:login` succeeds. Fill in `<CONTRACT_ADDRESS>`
with the deployed Sepolia address of ProofOfDev.sol (from
`NEXT_PUBLIC_CONTRACT_ADDRESS` in your `.env.local` once deployed).

---

Deploy a KeeperHub workflow on Sepolia with these exact properties:

**Name:** `proof-of-dev-mark-verified`

**Trigger:** API/webhook trigger (invoked programmatically — not scheduled,
not onchain-event-based). It should accept an input payload shaped like:

```json
{
  "tokenId": "number",
  "account": "string (address, informational only)",
  "mintTxHash": "string (informational only)"
}
```

**Action:** A single contract-call step:
- Network: Sepolia
- Contract address: `<CONTRACT_ADDRESS>`
- Function: `markVerified(uint256 tokenId)`
- Argument `tokenId`: bind to the trigger input's `tokenId` field
- `account` and `mintTxHash` are not used in the contract call itself —
  they're passed through only so they show up in the execution's audit
  log for cross-referencing against the actual mint transaction

**Important constraint:** `markVerified` is `onlyOwner` on the contract —
only the address that owns the contract can call it successfully. Before
running this workflow for real:
1. Confirm which wallet KeeperHub will sign with for this workflow
2. Either deploy the contract with that wallet as the owner, or call
   `transferOwnership(newOwner)` from the current owner to hand ownership
   to KeeperHub's wallet
3. If you skip this, every execution will revert on-chain with no
   custom-error message beyond "caller is not the owner" — the workflow
   will show as failed, not silently no-op

**Gas:** Sepolia is not covered by KeeperHub's Mainnet-only gas
sponsorship — confirm the signing wallet has its own Sepolia ETH balance
before the first real run.

Once created, give me back the workflow ID so I can set
`KEEPERHUB_MARKVERIFIED_WORKFLOW_ID` in `.env.local`.

---

## After it's created

Verify locally before trusting it in a live demo:

```bash
npm run check:env    # should print "✓ KeeperHub fully configured"
npm run demo:keeperhub -- <tokenId> <account>
```

`<tokenId>` must belong to a token that's already been minted (the
contract reverts with `TokenDoesNotExist` otherwise) and not already
verified (`AlreadyVerified` otherwise) — so run one real mint through the
dashboard first, then use that token's ID here.
