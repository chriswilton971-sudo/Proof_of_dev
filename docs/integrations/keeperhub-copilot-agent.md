# KeeperHub × GitHub Copilot Agent Integration

This guide enables your GitHub Copilot agent to autonomously deploy and execute on-chain workflows via KeeperHub.

## What Your Agent Can Do

After setup:
1. **Authenticate** — Link your KeeperHub account with one API key
2. **Deploy Workflows** — Create automation workflows that call smart contracts
3. **Execute Workflows** — Run them with full KeeperHub handling:
   - ✅ Gas simulation and optimization
   - ✅ Automatic retries on stalls
   - ✅ MEV-protected submission
   - ✅ Complete audit trail

## Quick Start

### 1. Get KeeperHub API Key

1. Go to [app.keeperhub.com](https://app.keeperhub.com)
2. Settings → API Keys → Organisation
3. Create a new API key (prefix: `kh_`)

### 2. Configure Environment

Add to `.env.local`:

```bash
# Required
KEEPERHUB_API_KEY=kh_your_key_here

# For autonomous execution (your agentic wallet)
KEEPERHUB_WALLET_PRIVATE_KEY=0x...
```

### 3. Use Your Agent

Ask your Copilot agent:

```
"Authenticate me with KeeperHub using API key kh_..."
```

Agent responds with your organization and workflow count.

## Agent Commands

### Deploy a Workflow

```
"Create a KeeperHub workflow that calls markVerified(tokenId) on 
contract 0x1234... on Sepolia, taking tokenId, account, mintTxHash as input"
```

Agent returns workflow ID for later execution.

### Execute a Workflow

```
"Execute workflow wf_abc123 with tokenId=42 and account=0x..."
```

Agent triggers execution and returns transaction hash + gas used.

### Monitor Execution

```
"Get status of execution ex_123"
```

Agent returns status, transaction hash (if complete), and gas consumed.

### View History

```
"List all successful executions"
```

Agent returns audit trail of past workflow runs.

## MCP Tools

| Tool | Purpose |
|------|----------|
| `authenticate` | Link KeeperHub account with API key |
| `list_workflows` | View available workflows |
| `create_workflow` | Deploy new automation workflows |
| `execute_workflow` | Run workflow (gas optimized, retried, MEV protected) |
| `get_execution_status` | Check execution progress and results |
| `list_executions` | Audit trail of past workflow runs |

## Architecture

```
Your Copilot Agent
        ↓
MCP Server (services/mcp/keeperhub-server.js)
        ↓
KeeperHub REST API
        ↓
Smart Contract (on-chain)
```

## Security

- ✅ API key and wallet private key read from environment only
- ✅ Never logged or echoed in responses
- ✅ Use GitHub Secrets in CI/CD
- ✅ Full audit trail optional via `KEEPERHUB_AUDIT_WEBHOOK`

## Troubleshooting

**"KEEPERHUB_API_KEY not configured"**
→ Set `KEEPERHUB_API_KEY` in `.env.local` or GitHub Copilot secrets

**"KEEPERHUB_WALLET_PRIVATE_KEY not configured"**
→ Set your agentic wallet's private key (must have ETH for gas)

**"Workflow trigger failed"**
→ Verify workflow ID with `list_workflows` and check input schema

**Execution times out after 55 seconds**
→ KeeperHub keeps retrying in background. Use `get_execution_status` to check.

## Example: Post-Mint Automation

```
Agent: "Deploy a workflow that marks NFT mints as verified"
→ Agent creates workflow via create_workflow

Agent: "Execute it for tokenId 42"
→ Agent calls execute_workflow
→ KeeperHub simulates, optimizes gas, submits tx
→ Agent returns tx hash

Agent: "Check the status"
→ Agent polls get_execution_status
→ Shows: ✓ Success, Gas: 45,000 wei, Tx: 0xabcd...
```

## See Also

- [KeeperHub Docs](https://docs.keeperhub.com)
- [Proof of Dev README](../../README.md)
- [KeeperHub Client Code](../analysis/keeperhub.js)
