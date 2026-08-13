# KeeperHub MCP Integration

## What this is

[KeeperHub](https://keeperhub.com) is an execution/reliability layer for
onchain automation on EVM chains (Ethereum, Base, Arbitrum, Polygon, etc.).
It exposes an MCP server that lets AI agents create, run, and monitor
blockchain automation workflows -- gas estimation, retries, nonce management,
and non-custodial signing handled for you.

Proof_of_dev is a soulbound ERC-721 reputation platform on EVM chains
(see `services/analysis/config.js` for the supported chain registry), so
KeeperHub is a reasonable fit for automating things around the minting/
reputation lifecycle later -- event monitoring, alerts, follow-up
transactions.

**Status: connected and automating one real onchain action.**

1. `MintButton.tsx` calls `mint()` and waits for the receipt.
2. `POST /api/keeperhub/verify` (BFF, Next.js route) forwards server-side to
   `POST /keeperhub/verify` (worker), attaching the `KEEPERHUB_WEBHOOK_SECRET`
   header -- neither that secret nor `KEEPERHUB_API_KEY` ever reaches the
   browser.
3. The worker **independently re-verifies the `Minted` event against
   Etherscan** (`chain-data/mintEvents.js`) before doing anything paid -- it
   never trusts a client-supplied `tokenId`/`account` directly. This is the
   one deliberate deviation from the minimal Direct Execution example: an
   unauthenticated caller who found the URL should not be able to spend a
   real KeeperHub execution on an arbitrary token ID.
4. Once verified, the worker drives KeeperHub through its documented Safe
   First-Write Sequence -- `simulate: true` dry-run, then a real broadcast
   carrying an `Idempotency-Key`, then polling `/api/execute/{id}/status` to
   a terminal state -- to call `markVerified(tokenId)` on the deployed
   contract.
5. Every stage (trigger, simulation result, submitted tx, gas used, outcome,
   timestamp) is optionally posted to `KEEPERHUB_AUDIT_WEBHOOK` if set --
   belt-and-suspenders alongside KeeperHub's own per-execution dashboard
   history.

`markVerified` is `onlyOwner`, so **ownership must be transferred to (or the
contract deployed with) the wallet address KeeperHub provisions for this
org** before this will succeed on real Sepolia — see
`scripts/transfer-ownership-to-keeperhub.mjs` below.

## Getting credentials

1. Go to `app.keeperhub.com` -> **Settings -> API Keys -> Organisation** tab.
2. Create an API key (prefix `kh_`). Treat it like any other production
   credential -- never commit it.
3. Each MCP connection is scoped to a single organization, determined by
   whichever key/session you authenticate with.

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

`services/analysis/keeperhub.js` follows the same pattern as
`services/analysis/config.js` and `chain-data/http.js`. It exposes:

- `isKeeperhubConfigured()` / `checkKeeperhubConnection()` -- config guard
  and a real authenticated connectivity check (`GET /api/api-keys`, not
  `/mcp` -- that path is the MCP JSON-RPC transport, not a plain-GET health
  endpoint).
- `buildMarkVerifiedCalldata(tokenId)` -- pure/offline calldata encoding,
  covered by `tests/keeperhub-calldata.test.js`.
- `simulateMarkVerified` / `executeMarkVerified` / `getExecutionStatus` /
  `pollExecutionUntilDone` -- the individual Direct Execution API calls.
- `verifyMintOnChain({ network, contractAddress, tokenId })` -- the
  high-level entry point wiring all of the above into the full
  simulate -> execute -> poll sequence, plus audit-event logging at each
  stage. This is what `POST /keeperhub/verify` calls, after its own
  Etherscan check confirms the mint really happened.

Environment variables (add to `.env.local` -- see `.env.example` for the
full annotated list):

```
KEEPERHUB_API_KEY=
KEEPERHUB_BASE_URL=https://app.keeperhub.com
KEEPERHUB_WEBHOOK_SECRET=
KEEPERHUB_AUDIT_WEBHOOK=
```

CI also reads `KEEPERHUB_API_KEY` (and optionally `KEEPERHUB_BASE_URL`) as
repo secrets for the `keeperhub-smoke-test` job in
`.github/workflows/ci.yml` -- that job is a no-op (not a failure) on PRs
that don't have access to the secret, e.g. from forks.

**A naming note:** `KEEPERHUB_MCP_URL` is used only by `.mcp.json` for the
Claude Code connection above -- the app's own HTTP client only reads
`KEEPERHUB_API_KEY` and `KEEPERHUB_BASE_URL`.

**A custody note:** do not add a `KEEPERHUB_WALLET_PRIVATE_KEY` secret.
KeeperHub's wallets are non-custodial and Turnkey-secured -- private keys
are generated and live inside secure enclaves and are never exposed via
the API, so there is no legitimate integration point that would consume a
raw wallet private key here. Org auth is the `kh_` API key (or OAuth)
only. An earlier version of this integration held a `KEEPERHUB_WALLET_PRIVATE_KEY`
locally for a workflow-execution design that predated switching to Direct
Execution -- that was solving a problem KeeperHub's architecture already
solves for you, and has been removed.

## Demoing it

Two ways to show a real KeeperHub-executed transaction:

1. **Full flow:** mint a token through the UI (`MintButton.tsx`) and watch
   the network tab -- `POST /api/keeperhub/verify` fires once the mint
   confirms, and the badge updates once `isVerified(tokenId)` flips on-chain.
2. **On demand:** `npm run demo:keeperhub -- <tokenId> <contractAddress>`
   runs the real simulate -> execute -> poll sequence directly, no mint
   required first. Useful for a guaranteed, repeatable transaction to show
   a judge.

## Verified / cross-checked against KeeperHub's docs

- Direct Execution sequence (simulate -> `Idempotency-Key` execute -> poll
  `/api/execute/{id}/status`, `X-Poll-Interval-Hint` response header) --
  `docs.keeperhub.com/api/direct-execution`.
- `network`/`address`/`abiFunction`/`args` field naming for contract calls
  -- `docs.keeperhub.com/ai-tools/mcp-server` states directly: "For
  web3/read-contract and web3/write-contract, the abiFunction field is
  the function as it appears in the contract's ABI." Confirms
  `abiFunction` specifically, not just inferred from the action config
  shape generally.
- Non-custodial Turnkey wallet model -- `docs.keeperhub.com/` (Overview).

**Resolved:** `services/analysis/keeperhub.js`, `scripts/transfer-ownership-to-keeperhub.mjs`,
and `scripts/submit-hackathon.mjs` previously each guessed the Direct
Execution request body shape independently -- two of the three used
different, incompatible field names (`chainId`/`contractAddress`/
`functionName`/`functionArgs` vs. `network`/`address`/`abiFunction`/`args`).
All three now share one function (`buildContractCallRequestBody()` in
`keeperhub.js`, via `simulateContractCall()`/`executeContractCall()`) --
if the live schema turns out to differ, there's exactly one place to fix,
not three to keep in sync.

**Still not independently verified against a live call:** the exact JSON
body shape of `POST /api/execute/contract-call` itself, and the exact
shape of a simulation response (`willRevert`/`revertReason` vs.
`wouldRevert` vs. something else entirely). Run
`node scripts/transfer-ownership-to-keeperhub.mjs <address>` (simulate-only,
never broadcasts) as the first real test against the live API before
trusting any of this for a demo.

## Not yet done (follow-up)

- `markVerified` is the only wired action. Monitoring mint events,
  alerting on suspicious activity, or triggering *other* follow-up
  transactions would each need their own KeeperHub call added the same
  way.
- The contract's `owner` needs to actually be KeeperHub's provisioned
  wallet address on the deployed instance for `markVerified` to succeed --
  confirm this as part of deployment, not just in code.
