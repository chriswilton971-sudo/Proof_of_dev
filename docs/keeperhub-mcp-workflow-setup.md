# Prompt for a KeeperHub-MCP-connected agent (Claude Code)

Run this after connecting per `docs/integrations/keeperhub-copilot-agent.md`
(`claude mcp add --transport http --scope user keeperhub https://app.keeperhub.com/mcp`,
then `/mcp` to authorize). Fill in `<CONTRACT_ADDRESS>` with the deployed
Sepolia address of `ProofOfDev.sol` (from `NEXT_PUBLIC_CONTRACT_ADDRESS` in
`.env.local` once deployed).

---

Using the KeeperHub MCP tools, create a workflow with these requirements:

**Name:** `proof-of-dev-mark-verified`

**Trigger:** Manual (this repo's own backend calls it via the REST API's
`POST /api/workflows/{id}/execute`, not a KeeperHub-native webhook/event
trigger — see `services/analysis/keeperhub.js`)

**Trigger input:** `{ "tokenId": number, "account": string, "mintTxHash": string }`
— only `tokenId` is used on-chain; `account` and `mintTxHash` just need to
flow through to the execution's audit log for cross-referencing against the
actual mint transaction.

**Action:** A single Web3 write-contract step:
- Network: Sepolia (chain ID `11155111`)
- Contract address: `<CONTRACT_ADDRESS>`
- Function: `markVerified(uint256 tokenId)` -- bind `tokenId` to the trigger
  input's `tokenId` field
- The ABI only needs to include `markVerified` (and ideally `isVerified`
  for reference) -- pull it from `contracts/ProofOfDev.sol` in this repo,
  don't guess it

**Steps to actually do this, in order:**

1. Call `list_action_schemas` with category `web3` to confirm the exact
   required fields for `web3/write-contract` right now -- the schema can
   change, don't assume the shape from any written description (including
   this one).
2. Call `ai_generate_workflow` with a natural-language description of the
   above (trigger + single write-contract action). This is the safest way
   to get the node/edge graph right -- it's built for exactly this, and
   hand-written node/edge JSON risks getting the templating syntax
   (`{{@nodeId:Label.field}}`) wrong.
3. Call `validate_workflow` on the result before creating anything --
   catches structural and Web3-specific errors early.
4. Call `create_workflow` with `enabled=false` first (the default) --
   there's no reason to make this live until it's been tested once.
5. Call `execute_workflow` with a real minted `tokenId`/`account` to test
   it, then `get_execution` to check the result.
6. Once confirmed working, `update_workflow` with `enabled=true` if you
   want it to also respond to something other than the manual REST trigger
   -- not required for this project's flow, since the backend always
   triggers it explicitly after verifying a mint.

**Critical constraint -- check this before step 5, not after:**
`markVerified` is `onlyOwner` on the contract. Whichever wallet KeeperHub
signs with for this org needs to actually own the contract:

```
get_wallet_integration
```

to see which wallet KeeperHub will use, then either deploy the contract
with that address as the owner, or call `transferOwnership(newOwner)` from
the current owner. Skipping this means every execution reverts on-chain
with "caller is not the owner" -- the workflow will show as a failed
execution, not an obvious setup error.

**Gas:** Sepolia is not covered by KeeperHub's Mainnet-only gas
sponsorship. Confirm the signing wallet has its own Sepolia ETH before the
first real (non-simulated) execution.

Once created, give me back the workflow ID so I can set
`KEEPERHUB_MARKVERIFIED_WORKFLOW_ID` in `.env.local`.

---

## After it's created

Verify from this repo, not just from the MCP tool output:

```bash
npm run check:env    # should print "OK KeeperHub fully configured"
npm run demo:keeperhub -- <tokenId> <account>
```

`<tokenId>` must belong to a token that's already been minted (the
contract reverts with `TokenDoesNotExist` otherwise) and not already
verified (`AlreadyVerified` otherwise) -- mint one for real through the
dashboard first, then use that token's ID here.
