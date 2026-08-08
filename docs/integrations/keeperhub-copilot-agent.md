# KeeperHub × Claude Code / Copilot Agent Integration

Connects an AI coding agent directly to KeeperHub's own **remote** MCP
server, so it can create, execute, and monitor onchain workflows using
KeeperHub's real tool surface — no custom server needed.

An earlier version of this integration shipped a hand-written local MCP
server (`services/mcp/keeperhub-server.js`) that reimplemented a handful of
tools (`authenticate`, `create_workflow`, `execute_workflow`, ...) against
the REST API directly. That's been removed: KeeperHub already hosts a full
MCP server with 30+ real tools at `https://app.keeperhub.com/mcp` (see
[docs.keeperhub.com/ai-tools/mcp-server](https://docs.keeperhub.com/ai-tools/mcp-server)),
and the hand-rolled version didn't match its actual tool names or
`create_workflow`'s real node/edge schema. Connect to the real one instead.

## Setup

### 1. Connect to KeeperHub's MCP server

```bash
claude mcp add --transport http --scope user keeperhub https://app.keeperhub.com/mcp
```

Then run `/mcp` inside Claude Code and approve the OAuth flow in your
browser. For headless/CI environments without browser access, pass an API
key instead (Settings → API Keys → Organisation on app.keeperhub.com):

```bash
claude mcp add --transport http --scope user keeperhub https://app.keeperhub.com/mcp \
  --header "Authorization: Bearer kh_your_key_here"
```

`.mcp.json` in this repo is configured for the API-key form, reading
`KEEPERHUB_API_KEY` from your environment — useful if you want the
connection auto-discovered per-checkout rather than added manually per
machine.

### 2. Confirm your org's wallet owns the contract

This project's own `services/analysis/keeperhub.js` calls KeeperHub's
**Direct Execution** API directly (`execute_contract_call` — simulate,
then execute with an idempotency key, then poll status) rather than a
pre-built workflow, so there's no separate workflow to create or ID to
wire in. The only setup step is making sure `markVerified()` (which is
`onlyOwner`) will actually succeed: transfer ownership of the deployed
`ProofOfDev` contract to the wallet address KeeperHub provisions for your
org (Settings → Wallet on app.keeperhub.com), or every execution will
revert silently as a failed run rather than an obvious error — see
`docs/integrations/keeperhub-mcp.md` for the full flow and
`docs/keeperhub-mcp-workflow-setup.md` if you'd rather build this as a
dashboard workflow rather than a Direct Execution call — both are valid,
documented KeeperHub paths, and this repo currently uses the latter.

## What the agent can do once connected

The real tool surface (call `tools_documentation` for the always-current
list) includes, among 30+ tools:

- `create_workflow` / `update_workflow` / `delete_workflow` / `validate_workflow`
- `execute_workflow` / `get_execution`
- `execute_contract_call` (supports `simulate: true` to preflight before a
  real broadcast — the recommended safe-write sequence: simulate, then
  repeat with a unique `idempotency_key`, then poll
  `get_direct_execution_status`)
- `ai_generate_workflow` — describe a workflow in plain language and get a
  complete node/edge graph back
- `search_templates` / `deploy_template`

## Security notes

- `KEEPERHUB_API_KEY` and any wallet keys are read from your environment
  only — never commit them. `.env.local` is gitignored; double-check
  `git status` before committing if you've edited it directly.
- OAuth tokens (browser flow) are managed automatically by Claude Code —
  no key material touches this repo at all in that mode.
- MCP connections are scoped to a single KeeperHub organization per
  connection. If you work across multiple orgs, add separate named server
  entries rather than switching the same one back and forth.
