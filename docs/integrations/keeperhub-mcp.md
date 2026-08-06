# KeeperHub Integration

## What this is

[KeeperHub](https://keeperhub.com) is an execution/reliability layer for
onchain automation. This repo uses its **Direct Execution API**
(`docs.keeperhub.com/api/direct-execution`) to submit blockchain
transactions — specifically, an opt-in "sponsored" path where KeeperHub's
org wallet pays gas and submits a transaction on a user's behalf, instead
of the user's own wallet.

**KeeperHub never holds a private key we give it, and we never hold one
for it either.** The signing wallet is custodied server-side inside a
Turnkey enclave, configured entirely in KeeperHub's own dashboard under
Wallet Management. Authentication to KeeperHub's API is a single
organization API key (`kh_` prefix) — nothing else.

This project is enrolled in the KeeperHub "Agents Onchain" hackathon on
DoraHacks. That hackathon's actual requirements (verified against
`dorahacks.io/hackathon/agents-onchain/detail`, not assumed):

- Every submission must use KeeperHub as its onchain execution layer.
- Submission = a link to the GitHub repo + a short demo video showing the
  agent executing onchain through KeeperHub.
- Judging is on an agent that "executes real transactions onchain through
  KeeperHub" — not on UI polish.

## What's actually wired up

### Analysis service (`services/analysis/keeperhub.js`)

A Node client for the Direct Execution API: `executeContractCall()`
follows KeeperHub's documented "safe first-write sequence" —

1. `simulate: true` first; throws if `wouldRevert`.
2. Same body, `simulate` removed, unique `Idempotency-Key` header added.
3. Poll `GET /api/execute/{executionId}/status` until `completed`/`failed`.

### apps/web — sponsored EAS attestation (works)

`POST /api/attest/sponsored` → `submitSponsoredAttestation()` in
`lib/eas/attestationService.ts` calls EAS's `attest()` directly through
KeeperHub, as an **opt-in alternative** to the existing
`POST /api/attest` (user's own wallet signs + submits, unchanged, still
the default). EAS's `attest()` takes `recipient` as an explicit field, so
there's no ambiguity about who the attestation is for regardless of which
wallet submits the transaction.

### apps/web — sponsored NFT mint (blocked, not wired up)

`POST /api/mint-authorization/sponsored` returns `501
SPONSORSHIP_NOT_SUPPORTED` on purpose. `ProofOfDev.mint()`
(`contracts/ProofOfDev.sol`) uses `msg.sender` as the recipient
(`_tokens[msg.sender]`) — it has no explicit recipient parameter. If
KeeperHub's org wallet called `mint()` on a user's behalf, the NFT would
be minted to *KeeperHub's* wallet, not the user's. See the comment on
`submitSponsoredMint()` in `lib/mint/mintAuthorizationService.ts` for what
a contract change (a `mintFor(recipient, ...)` variant with `recipient`
bound into the signed EIP-712 hash) would need to look like. The default
`POST /api/mint-authorization` (user's own wallet mints) is unaffected.

## Getting credentials

1. `app.keeperhub.com` → **Settings → API Keys → Organisation** tab →
   create a key (`kh_` prefix). Treat it like any other production
   credential — never commit it, never paste it into a chat transcript.
2. **Configure the org wallet** in the KeeperHub dashboard under **Wallet
   Management** (Turnkey integration or Safe smart account) — this is
   where the actual signing key lives. There is no environment variable
   for it; nothing app-side ever sees it.
3. Set locally / in your deploy target's secret manager:

   ```
   KEEPERHUB_API_KEY=kh_...
   KEEPERHUB_BASE_URL=https://app.keeperhub.com
   ```

## Demo checklist (for hackathon submission)

- [ ] Org wallet funded with Sepolia testnet ETH (Wallet Management in the
      KeeperHub dashboard).
- [ ] `KEEPERHUB_API_KEY` set in the deploy environment.
- [ ] Hit `POST /api/attest/sponsored` for a wallet with an existing
      analysis on record; confirm `GET /api/execute/{id}/status` returns
      `completed` with a real `transactionHash`.
- [ ] Record the demo video showing that transaction landing on Sepolia
      Etherscan (or via the KeeperHub dashboard's execution log).
- [ ] Link the GitHub repo in the DoraHacks submission form.

## Connecting an AI coding agent (optional, not used by the app itself)

If you want Claude Code (or another MCP-capable agent) to build/manage
KeeperHub workflows directly while working in this repo:

```bash
claude mcp add --transport http --scope user keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer kh_your_key_here"
```

This is unrelated to how the application itself talks to KeeperHub — the
app calls the REST endpoints under `KEEPERHUB_BASE_URL/api/execute/*`
directly, it does not go through MCP.

## Not yet done (follow-up)

- No frontend button calls `POST /api/attest/sponsored` yet — it exists
  as a backend endpoint only.
- Sponsored mint requires the contract change described above before it
  can be built at all.
- No automated tests cover the KeeperHub client yet; verify manually
  against Sepolia before recording the demo.
