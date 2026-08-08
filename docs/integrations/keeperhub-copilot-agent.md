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

### 2. Ask your agent to deploy the markVerified workflow

See [`keeperhub-mcp-workflow-setup.md`](./keeperhub-mcp-workflow-setup.md)
for the exact spec — it needs a specific node/edge graph
(`web3/write-contract` action calling `markVerified(uint256)` on Sepolia),
not just a name and a function signature.

### 3. Wire the resulting workflow ID into the app

Once created, set `KEEPERHUB_MARKVERIFIED_WORKFLOW_ID` in `.env.local` to
the workflow ID the agent gives you, then this repo's own
`services/analysis/keeperhub.js` calls it via the plain REST API
(`POST /api/workflows/{id}/execute` → `GET .../wait`) as part of the
post-mint flow — see the "KeeperHub post-mint automation" section of the
root README.

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
