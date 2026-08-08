# KeeperHub × GitHub Copilot Agent Integration

This guide walks through adding the KeeperHub MCP server to your GitHub Copilot agent, enabling autonomous on-chain workflow deployment and execution.

## What You'll Get

After setup, your Copilot agent can:

1. **Authenticate** — Link your KeeperHub account with a single API key
2. **Deploy Workflows** — Create new automation workflows that call smart contracts
3. **Execute Workflows** — Run them autonomously with:
   - ✅ Full gas simulation and optimization
   - ✅ Automatic retries on stalls
   - ✅ MEV-protected transaction submission
   - ✅ Complete audit trail (execution ID, tx hash, gas used)

## Setup

### 1. Get a KeeperHub API Key

1. Go to [app.keeperhub.com](https://app.keeperhub.com)
2. Sign in or create an account
3. Navigate to **Settings → API Keys → Organisation**
4. Create a new API key (prefix: `kh_`)
5. Copy it safely — treat it like a production credential

### 2. Configure Your Environment

Add the key to your `.env.local` (or GitHub Copilot secrets):

```bash
# Required
KEEPERHUB_API_KEY=kh_your_key_here

# Optional (defaults shown)
KEEPERHUB_BASE_URL=https://app.keeperhub.com

# For autonomous execution (required to run workflows)
KEEPERHUB_WALLET_PRIVATE_KEY=0x...  # Hex string, no 0x prefix needed in the value
```

**Where to set these:**
- **Local dev**: Create/edit `.env.local` at the repo root
- **GitHub Copilot**: Use GitHub Secrets or Copilot's built-in secret manager
- **CI/CD**: Add to your GitHub Actions secrets, then reference them

### 3. Enable the MCP Server

The MCP configuration is already in `.mcp.json`. Copilot will auto-discover it.

Alternatively, manually add it:

```bash
# Claude Code or similar
mcp add keeperhub --transport stdio --command "node services/mcp/keeperhub-server.js"
```

### 4. Test the Connection

Ask your Copilot agent:

```
Authenticate me with KeeperHub using my API key kh_...
```

It should respond with your organization name and workflow count.

---

## Usage Examples

### Example 1: Deploy a Simple Workflow

```
Create a KeeperHub workflow that:
- Calls markVerified(tokenId) on contract 0x1234...
- Network: Sepolia
- Takes { tokenId, account, mintTxHash } as input
- Name: "Post-Mint Verification"
```

The agent will:
1. Call `create_workflow` with your parameters
2. Return a workflow ID
3. You can then execute it with `execute_workflow`

### Example 2: Execute and Monitor

```
Execute workflow wf_abc123 with tokenId=42 and account=0x1234...
Then check the status every 10 seconds.
```

The agent will:
1. Trigger the workflow execution
2. Wait for the transaction to confirm
3. Return the transaction hash and gas used
4. Optionally monitor the status via `get_execution_status`

### Example 3: Audit Trail

```
List all executions from the past hour, filtered by status=success.
```

The agent retrieves the complete execution log:
- Execution IDs
- Workflow IDs
- Transaction hashes
- Gas consumed
- Timestamps

---

## MCP Tools Reference

### `authenticate`

Validate and link your KeeperHub account.

**Input:**
- `api_key` (string, required) - Your `kh_*` API key

**Returns:** Organization name, workflow count, and confirmation

---

### `list_workflows`

View all available workflows in your account.

**Input:**
- `limit` (integer, optional) - Max workflows to return (default: 50)

**Returns:** List of workflow IDs, names, descriptions, networks, and contract addresses

---

### `create_workflow`

Deploy a new automation workflow.

**Input:**
- `name` (string, required) - Workflow name
- `description` (string, optional) - What it does
- `network` (string, required) - `mainnet` | `sepolia` | `arbitrum` | `polygon`
- `contract_address` (string, required) - Smart contract address (with `0x`)
- `function_signature` (string, required) - e.g., `markVerified(uint256)` or `mint(address,uint256)`
- `input_schema` (object, required) - JSON schema for workflow inputs

**Returns:** Workflow ID, name, network, contract, function signature

---

### `execute_workflow`

Run a workflow immediately.

**Input:**
- `workflow_id` (string, required) - ID from `create_workflow` or `list_workflows`
- `input` (object, required) - Workflow inputs matching the input schema

**Returns:**
- `executionId` - Unique execution ID
- `status` - Current status (running, success, error)
- `completed` - Boolean
- `txHash` - Transaction hash (once complete)
- `gasUsedWei` - Gas consumed (once complete)

**KeeperHub Handling:**
- Every transaction is simulated before submission
- Gas is optimized
- If the transaction stalls, it's automatically retried
- MEV protection is applied to prevent sandwich attacks
- Full audit trail logged

---

### `get_execution_status`

Check the status of an ongoing or completed execution.

**Input:**
- `execution_id` (string, required) - From `execute_workflow` response

**Returns:**
- Current status
- Transaction hash (if complete)
- Gas used
- Completion flag
- Any error messages

---

### `list_executions`

View execution history with filtering.

**Input:**
- `workflow_id` (string, optional) - Filter by workflow
- `status` (string, optional) - `running` | `success` | `failed` | `timed_out`
- `limit` (integer, optional) - Max results (default: 20)

**Returns:** Execution list with IDs, statuses, workflows, tx hashes, and timestamps

---

## Troubleshooting

### "KEEPERHUB_API_KEY is not configured"

**Solution:** Set `KEEPERHUB_API_KEY` in your `.env.local` or GitHub Copilot secrets.

### "KEEPERHUB_WALLET_PRIVATE_KEY is not configured"

**Solution:** Set the private key of your agentic wallet in your environment. This wallet must have:
- ETH for gas on the target network
- Permission to sign transactions (if the contract requires it)

### "Workflow trigger failed"

Check:
1. The workflow ID is correct (`list_workflows` to verify)
2. The input object matches the workflow's input schema
3. The contract address and function signature are valid

### Execution times out after 55 seconds

KeeperHub's API has a 60-second server-side timeout. If your transaction is complex:
1. Use `get_execution_status` with the execution ID to check if it's still running
2. Wait longer — KeeperHub continues retrying in the background
3. Check the audit trail for the eventual transaction hash

---

## Architecture

```
Copilot Agent
    ↓
MCP Client (stdio)
    ↓
services/mcp/keeperhub-server.js
    ↓
services/analysis/keeperhub.js (REST client)
    ↓
KeeperHub API (https://app.keeperhub.com)
    ↓
Your Smart Contract (on Ethereum, Arbitrum, Polygon, etc.)
```

The MCP server reuses the same KeeperHub client (`services/analysis/keeperhub.js`) that powers the Proof of Dev app's post-mint automation.

---

## Security Notes

1. **Never commit credentials** — `KEEPERHUB_API_KEY` and `KEEPERHUB_WALLET_PRIVATE_KEY` are always read from environment only
2. **Use GitHub Secrets** — In CI/CD, store credentials in GitHub Actions secrets, not in `.env` files
3. **Audit logging** — Set `KEEPERHUB_AUDIT_WEBHOOK` to get a full log of every trigger and outcome
4. **Non-custodial signing** — The agentic wallet signs locally; keys never leave your environment

---

## Examples

### Post-Mint Automation (Proof of Dev use case)

```typescript
// Agent asks:
"Deploy a workflow that automatically calls markVerified on the ProofOfDev contract
after someone mints an NFT. Take tokenId, account, and mintTxHash as inputs.
Then execute it when tokenId=42, account=0x1234..., mintTxHash=0xabcd..."

// Agent does:
// 1. create_workflow(...)
// 2. execute_workflow(workflowId, { tokenId: "42", ... })
// 3. Returns execution ID and eventually the transaction hash
```

### Multi-Call Workflow

```typescript
// Agent asks:
"Create a workflow on Arbitrum that:
1. Approves USDC for a router
2. Swaps 100 USDC to DAI
3. Deposits DAI into a lending pool
Then execute it with my wallet."

// Agent:
// 1. create_workflow with multi-step inputs
// 2. execute_workflow(...)
// 3. KeeperHub handles gas, retries, and MEV across all steps
```

---

## See Also

- [KeeperHub Docs](https://docs.keeperhub.com)
- [Proof of Dev README](../../README.md) — Post-mint automation flow
- [KeeperHub Client (`keeperhub.js`)](../analysis/keeperhub.js) — Implementation details
