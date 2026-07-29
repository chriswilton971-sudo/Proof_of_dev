# KeeperHub MCP Integration

## What this is

[KeeperHub](https://keeperhub.com) is an execution/reliability layer for
onchain automation on EVM chains (Ethereum, Base, Arbitrum, Polygon, etc.).
It exposes an MCP server that lets AI agents create, run, and monitor
blockchain automation workflows — gas estimation, retries, nonce management,
and non-custodial signing handled for you.

Proof_of_dev is a soulbound ERC-721 reputation platform on EVM chains
(see `services/analysis/config.js` for the supported chain registry), so
KeeperHub is a reasonable fit for automating things around the minting/
reputation lifecycle later — event monitoring, alerts, follow-up
transactions.

**Status: connected, not yet automating anything.** This doc covers the
connection only. Automation workflows are a follow-up task.

## Getting credentials

1. Go to `app.keeperhub.com` → **Settings → API Keys → Organisation** tab.
2. Create an API key (prefix `kh_`). Treat it like any other production
   credential — never commit it.
3. Each MCP connection is scoped to a single organization, determined by
   whichever key/session you authenticate with.

## Connecting via Claude Code (local dev)

```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer kh_your_key_here"
```

This adds KeeperHub's workflow tools (list/create/execute/monitor) to
Claude Code sessions in this repo.

Alternative: OAuth 2.1 browser flow. Add the server without a bearer token
and Claude Code discovers the OAuth metadata at
`/.well-known/oauth-authorization-server` and opens a browser to authorize.
Tokens (1hr access / 30-day refresh) are managed automatically.

## Connecting from the app

`services/analysis/keeperhub.js` is a minimal client following the same
pattern as `services/analysis/config.js` and `chain-data/http.js` — it
currently only exposes a connectivity check (`checkKeeperhubConnection`)
and a config guard (`isKeeperhubConfigured`). No workflow logic has been
added yet.

Environment variables (add to `.env.local`, following this repo's existing
convention — see `services/analysis/config.js`):

```
KEEPERHUB_API_KEY=
KEEPERHUB_BASE_URL=https://app.keeperhub.com
```

## Not yet done (follow-up)

- No workflows have been created yet. When we're ready to automate
  something (monitoring mint events, alerting on suspicious activity,
  auto-triggering follow-up transactions after a signature-gated mint),
  define the workflow spec here and extend `keeperhub.js` accordingly.
- No tests cover the KeeperHub client yet.
