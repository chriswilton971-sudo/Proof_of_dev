# KeeperHub MCP Integration

## What this is

[KeeperHub](https://keeperhub.com) is the on-chain execution layer for
Proof_of_dev's post-mint automation. It exposes an MCP server that lets AI
agents create, run, and monitor blockchain automation workflows — gas
estimation, retries, nonce management, private/MEV-protected submission,
and non-custodial signing handled for you.

**Status: connected and automating.** After a wallet mints its soulbound
NFT, KeeperHub executes `markVerified(tokenId)` on `ProofOfDev.sol` as a
real, gas-spending follow-up transaction, routed via x402 or MPP. See the
"KeeperHub post-mint automation" section in the root `README.md` for the
full flow diagram, or read the code directly:

| Piece | File |
|---|---|
| Mint verification (Etherscan) | `services/analysis/chain-data/mintEvents.js` |
| KeeperHub client + `executeWorkflow()` | `services/analysis/keeperhub.js` |
| Webhook that ties them together | `services/analysis/api.js` -> `POST /webhooks/keeperhub/post-mint` |
| Frontend trigger after mint confirms | `apps/web/components/MintButton.tsx` -> `apps/web/app/api/mint-verify/route.ts` |
| On-demand judging demo | `scripts/keeperhub-demo.js` (`npm run demo:keeperhub`) |
| Tests | `tests/keeperhub.test.js` (`npm run test:keeperhub`) |

## Getting credentials

1. Go to `app.keeperhub.com` -> **Settings -> API Keys -> Organisation** tab.
2. Create an API key (prefix `kh_`). Treat it like any other production
   credential -- never commit it.
3. Each MCP connection is scoped to a single organization, determined by
   whichever key/session you authenticate with.
4. Provision or import an agentic wallet for KeeperHub to sign with -- it
   must be (or be delegated by) the `ProofOfDev` contract's `owner`, since
   `markVerified()` is `onlyOwner`.
5. In the KeeperHub dashboard, create a workflow that calls
   `markVerified(tokenId)` on Sepolia, taking `{ tokenId, account,
   mintTxHash }` as input, and copy its ID.

## Connecting via Claude Code (local dev)

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer kh_your_key_here"
```

This adds KeeperHub's workflow tools (list/create/execute/monitor) to
Claude Code sessions in this repo. The same config lives in `.mcp.json` at
the repo root, with the key read from `KEEPERHUB_API_KEY`.

Alternative: OAuth 2.1 browser flow. Add the server without a bearer token
and Claude Code discovers the OAuth metadata at
`/.well-known/oauth-authorization-server` and opens a browser to authorize.
Tokens (1hr access / 30-day refresh) are managed automatically.

## Connecting from the app

`services/analysis/keeperhub.js` is the client, following the same pattern
as `services/analysis/config.js` and `chain-data/http.js`. It exposes:

- `checkKeeperhubConnection()` / `isKeeperhubConfigured()` -- connectivity + config guards
- `isAgenticWalletConfigured()` -- guards the signing wallet key specifically
- `executeWorkflow({ workflowId, input })` -- the general-purpose call into
  KeeperHub's `/v1/workflows/:id/execute`, routed by `KEEPERHUB_PAYMENT_MODE`
  (`dual` / `x402` / `mpp`), with `logAuditEvent()` firing at both the
  `trigger` and `outcome` stages (protocol used, tx hash, gas used) --
  posted to `KEEPERHUB_AUDIT_WEBHOOK` if configured
- `triggerPostMintVerification({ tokenId, account, mintTxHash })` -- the
  concrete post-mint use of `executeWorkflow()` described above

Environment variables (add to `.env.local` -- see `.env.example` for the
full annotated list):

```
KEEPERHUB_API_KEY=
KEEPERHUB_BASE_URL=https://app.keeperhub.com
KEEPERHUB_WALLET_PRIVATE_KEY=
KEEPERHUB_PAYMENT_MODE=dual
KEEPERHUB_MARKVERIFIED_WORKFLOW_ID=
KEEPERHUB_WEBHOOK_SECRET=
KEEPERHUB_AUDIT_WEBHOOK=
```

## Demoing it

Two ways to show a real KeeperHub-executed transaction:

1. **Full flow:** mint a token through the UI (`MintButton.tsx`) and watch
   the network tab -- `POST /api/mint-verify` fires once the mint confirms.
2. **On demand:** `npm run demo:keeperhub -- <tokenId> <account>` calls
   `triggerPostMintVerification()` directly, no mint required first. Useful
   if you want a guaranteed, repeatable transaction to show a judge.

## Possible follow-ups (not required for the current submission)

- Move `KEEPERHUB_WALLET_PRIVATE_KEY` handling to KeeperHub's own
  non-custodial signing if/when that's exposed via the MCP tools, so this
  app never holds a raw private key at all.
- Add a KeeperHub-side monitor workflow that watches `Minted` directly
  (rather than the app-side Etherscan check in `mintEvents.js`), if
  KeeperHub's event-monitoring primitives cover this case natively.
