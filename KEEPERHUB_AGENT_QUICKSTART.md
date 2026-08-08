# KeeperHub × GitHub Copilot Agent — Quick Start

## 🎯 What This Enables

Your GitHub Copilot agent can now:
1. **Authenticate** — Link your KeeperHub account with a single API key
2. **Deploy Workflows** — Create on-chain automation workflows
3. **Execute Workflows** — Run them autonomously with:
   - ✅ Gas simulation & optimization
   - ✅ Automatic retries on stalls
   - ✅ MEV-protected submission
   - ✅ Complete audit logging

## 🚀 Setup in 3 Steps

### Step 1: Run the Setup Script

```bash
npm run setup:keeperhub-agent
```

This interactive script will:
- Guide you to get a KeeperHub API key
- Validate the connection
- Optionally configure your agentic wallet
- Update `.env.local` with credentials

### Step 2: Test the Connection

```bash
npm run test:keeperhub-agent
```

Verifies MCP server is ready and shows your organization details.

### Step 3: Ask Your Agent

```
"Authenticate me with KeeperHub using my API key"
```

Your agent responds with:
- ✓ Authentication successful
- Organization name
- Number of available workflows

## 📋 Agent Commands

### Deploy a Workflow

```
"Create a KeeperHub workflow that:
- Calls markVerified(tokenId) on contract 0x1234...
- Network: Sepolia
- Takes { tokenId, account, mintTxHash } as input
- Name: 'Post-Mint Verification'"
```

Agent returns workflow ID.

### Execute a Workflow

```
"Execute workflow wf_abc123 with:
- tokenId=42
- account=0x1234...
- mintTxHash=0xabcd..."
```

Agent returns transaction hash + gas used.

### Monitor Execution

```
"Get status of execution ex_123"
```

Agent returns status, tx hash (if complete), gas consumed.

### View History

```
"List all successful executions from the past hour"
```

Agent returns audit trail.

## 🛠️ MCP Tools Available

| Tool | What It Does |
|------|-------------|
| `authenticate` | Link your KeeperHub account |
| `list_workflows` | View available workflows |
| `create_workflow` | Deploy new automation |
| `execute_workflow` | Run workflow (gas optimized, retried, MEV protected) |
| `get_execution_status` | Check execution progress |
| `list_executions` | View execution history |

## 📚 Full Documentation

- **Setup Guide**: `docs/integrations/keeperhub-copilot-agent.md`
- **MCP Server Code**: `services/mcp/keeperhub-server.js`
- **KeeperHub Docs**: https://docs.keeperhub.com

## 🔐 Security

- ✅ API key & wallet key read from environment only
- ✅ Never logged or echoed in responses
- ✅ Use GitHub Secrets in CI/CD
- ✅ Optional audit webhook for full logging

## ⚡ What Happens When You Execute

```
Your Agent
    ↓
"Execute workflow wf_abc123 with tokenId=42"
    ↓
KeeperHub MCP Server (services/mcp/keeperhub-server.js)
    ↓
KeeperHub API
    ↓
✓ Simulates transaction
✓ Optimizes gas
✓ Submits to blockchain
✓ Retries if stalls
✓ Protects from MEV
✓ Returns tx hash + gas used
```

## 🎓 Example: Post-Mint Automation

```
User: "Deploy a workflow for marking NFT mints as verified"

Agent:
✓ Creates workflow on Sepolia
✓ Calls markVerified(tokenId)
✓ Returns ID: wf_abc123

---

User: "Execute it for tokenId 42"

Agent:
✓ Triggers execution
✓ KeeperHub simulates → optimizes gas → submits
✓ Returns Tx: 0xabcd...
✓ Gas: 45,000 wei

---

User: "Check the status"

Agent:
✓ Execution Status: success
✓ Tx Hash: 0xabcd...
✓ Completed: Yes
```

## 🔗 Next Steps

1. ✅ Run `npm run setup:keeperhub-agent`
2. ✅ Run `npm run test:keeperhub-agent`
3. ✅ Ask your agent: "Authenticate me with KeeperHub"
4. ✅ Start building workflows!

---

**Made for:** Proof of Dev × KeeperHub Agents Onchain Hackathon
