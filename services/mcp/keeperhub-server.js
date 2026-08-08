#!/usr/bin/env node

/**
 * KeeperHub MCP Server for GitHub Copilot Agent
 *
 * Exposes KeeperHub workflow tools so AI agents (Claude, Cursor, etc.) can:
 *  1. Authenticate once to link your KeeperHub account (API key)
 *  2. Deploy new automation workflows
 *  3. Execute workflows with full gas optimization, retries, and MEV protection
 *  4. Monitor execution status and retrieve transaction hashes
 *
 * Usage:
 *   node services/mcp/keeperhub-server.js
 *
 * Environment (set via .env.local or GitHub Copilot secrets):
 *   KEEPERHUB_API_KEY - API key from https://app.keeperhub.com/settings/api-keys
 *   KEEPERHUB_BASE_URL - Defaults to https://app.keeperhub.com
 *   KEEPERHUB_WALLET_PRIVATE_KEY - Agentic wallet for autonomous signing (hex string, no 0x prefix)
 *
 * See docs/integrations/keeperhub-mcp.md for setup and context.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import the existing KeeperHub client from the app
import {
  isKeeperhubConfigured,
  isAgenticWalletConfigured,
  checkKeeperhubConnection,
  KEEPERHUB_API_KEY,
  KEEPERHUB_BASE_URL,
} from "../analysis/keeperhub.js";

import { fetchJson } from "../analysis/chain-data/http.js";

const server = new Server({
  name: "keeperhub-mcp",
  version: "1.0.0",
});

/**
 * KeeperHub API client for MCP tools.
 * Reuses the same auth pattern as the app's keeperhub.js.
 */
async function keeperhubRequest(path, options = {}) {
  if (!isKeeperhubConfigured()) {
    throw new Error(
      "KEEPERHUB_API_KEY is not configured. " +
      "Authenticate first: set KEEPERHUB_API_KEY in your environment or via GitHub Copilot secrets."
    );
  }

  return fetchJson(`${KEEPERHUB_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Tool: authenticate
 * Validates the KeeperHub API key and returns account info.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "authenticate",
        description:
          "Authenticate with KeeperHub using your API key. " +
          "Call this once to link your KeeperHub account. " +
          "Returns account information and organization details.",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description:
                "KeeperHub API key (starts with 'kh_'). " +
                "Get this from https://app.keeperhub.com/settings/api-keys",
            },
          },
          required: ["api_key"],
        },
      },
      {
        name: "list_workflows",
        description:
          "List all available workflows in your KeeperHub account. " +
          "Shows workflow IDs, names, and descriptions for use with execute_workflow.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              description: "Maximum number of workflows to return (default: 50)",
              default: 50,
            },
          },
        },
      },
      {
        name: "create_workflow",
        description:
          "Create a new automation workflow in KeeperHub. " +
          "Workflows define on-chain actions (e.g., calling a contract function) " +
          "that KeeperHub will execute autonomously.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Workflow name (e.g., 'markVerified automation')",
            },
            description: {
              type: "string",
              description: "What this workflow does",
            },
            network: {
              type: "string",
              enum: ["mainnet", "sepolia", "arbitrum", "polygon"],
              description: "Blockchain network for execution",
            },
            contract_address: {
              type: "string",
              description:
                "Address of the smart contract to call (with 0x prefix)",
            },
            function_signature: {
              type: "string",
              description:
                "Function to call (e.g., 'markVerified(uint256)' or 'mint(address,uint256)')",
            },
            input_schema: {
              type: "object",
              description:
                "JSON schema defining workflow inputs (e.g., { tokenId: 'uint256', account: 'address' })",
            },
          },
          required: [
            "name",
            "network",
            "contract_address",
            "function_signature",
            "input_schema",
          ],
        },
      },
      {
        name: "execute_workflow",
        description:
          "Execute a workflow immediately. " +
          "KeeperHub handles gas estimation, simulation, retries, and MEV protection. " +
          "Returns execution ID and transaction hash once complete.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "ID of the workflow to execute",
            },
            input: {
              type: "object",
              description:
                "Workflow input parameters (must match the workflow's input schema). " +
                "Example: { tokenId: '42', account: '0x...' }",
            },
          },
          required: ["workflow_id", "input"],
        },
      },
      {
        name: "get_execution_status",
        description:
          "Get the current status of a workflow execution. " +
          "Returns execution progress, transaction hash (if complete), and gas used.",
        inputSchema: {
          type: "object",
          properties: {
            execution_id: {
              type: "string",
              description: "Execution ID returned from execute_workflow",
            },
          },
          required: ["execution_id"],
        },
      },
      {
        name: "list_executions",
        description:
          "List recent workflow executions with status and results. " +
          "Useful for audit trails and monitoring.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description:
                "Filter by workflow ID (optional; shows all executions if omitted)",
            },
            limit: {
              type: "integer",
              description: "Maximum number of executions to return (default: 20)",
              default: 20,
            },
            status: {
              type: "string",
              enum: ["running", "success", "failed", "timed_out"],
              description: "Filter by execution status (optional)",
            },
          },
        },
      },
    ],
  };
});

/**
 * Tool handlers
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    switch (name) {
      case "authenticate": {
        // Validate API key format
        if (!args.api_key || !args.api_key.startsWith("kh_")) {
          throw new Error(
            "Invalid API key format. KeeperHub API keys start with 'kh_'. " +
            "Get one from https://app.keeperhub.com/settings/api-keys"
          );
        }

        // Set the key in env for subsequent requests
        process.env.KEEPERHUB_API_KEY = args.api_key;

        // Test the connection
        const connection = await checkKeeperhubConnection();

        return {
          content: [
            {
              type: "text",
              text:
                `✓ Authentication successful!\n\n` +
                `Organization: ${connection.organization?.name || "Unknown"}\n` +
                `Available workflows: ${connection.data?.length || 0}\n\n` +
                `You can now deploy and execute workflows. Try:\n` +
                `  1. "list_workflows" to see available workflows\n` +
                `  2. "execute_workflow" to run an automation\n` +
                `  3. "create_workflow" to build a new one`,
            },
          ],
        };
      }

      case "list_workflows": {
        const limit = args.limit || 50;
        const response = await keeperhubRequest(
          `/api/workflows?limit=${limit}`,
          { method: "GET" }
        );

        const workflows = response.data || [];
        const text =
          workflows.length === 0
            ? "No workflows found. Create one with create_workflow."
            : workflows
                .map(
                  (w) =>
                    `• ${w.name} (ID: ${w.id})\n` +
                    `  Network: ${w.network || "unknown"}\n` +
                    `  Contract: ${w.contractAddress || "N/A"}\n` +
                    `  ${w.description || "No description"}`
                )
                .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Available Workflows:\n\n${text}`,
            },
          ],
        };
      }

      case "create_workflow": {
        if (!isAgenticWalletConfigured()) {
          throw new Error(
            "KEEPERHUB_WALLET_PRIVATE_KEY is not configured. " +
            "Set it before creating workflows that will execute autonomously."
          );
        }

        const payload = {
          name: args.name,
          description: args.description || "",
          network: args.network,
          contractAddress: args.contract_address,
          functionSignature: args.function_signature,
          inputSchema: args.input_schema || {},
        };

        const created = await keeperhubRequest("/api/workflows", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        return {
          content: [
            {
              type: "text",
              text:
                `✓ Workflow created!\n\n` +
                `ID: ${created.id}\n` +
                `Name: ${created.name}\n` +
                `Network: ${created.network}\n` +
                `Contract: ${created.contractAddress}\n` +
                `Function: ${created.functionSignature}\n\n` +
                `Use this ID to execute_workflow or monitor_workflow.`,
            },
          ],
        };
      }

      case "execute_workflow": {
        if (!isAgenticWalletConfigured()) {
          throw new Error(
            "KEEPERHUB_WALLET_PRIVATE_KEY is not configured. " +
            "Autonomous workflow execution requires a signing wallet. " +
            "Set it via your environment or GitHub Copilot secrets."
          );
        }

        // Trigger the execution
        const triggered = await keeperhubRequest(
          `/api/workflows/${args.workflow_id}/execute`,
          {
            method: "POST",
            body: JSON.stringify({ input: args.input }),
          }
        );

        const executionId = triggered.executionId;
        if (!executionId) {
          throw new Error(
            `Workflow trigger failed: ${JSON.stringify(triggered)}`
          );
        }

        // Wait for completion (up to 55 seconds, per API limits)
        let receipt;
        try {
          receipt = await keeperhubRequest(
            `/api/workflows/executions/${executionId}/wait?timeoutMs=55000`,
            { method: "GET" }
          );
        } catch (err) {
          // If wait times out, the execution is still running but we don't have a tx hash yet
          receipt = { status: "running", completed: false };
        }

        const txHash = receipt.transactionHashes?.[0]?.hash || null;
        const gasUsed = receipt.gasUsedWei || null;

        const statusText =
          receipt.completed && txHash
            ? `✓ Workflow executed successfully!\n\nTx Hash: ${txHash}`
            : `⏳ Workflow is running (Execution ID: ${executionId})\nCheck status with get_execution_status`;

        return {
          content: [
            {
              type: "text",
              text:
                `${statusText}\n` +
                `Status: ${receipt.status}\n` +
                `${gasUsed ? `Gas Used: ${gasUsed} wei\n` : ""}` +
                `Execution ID: ${executionId}`,
            },
          ],
        };
      }

      case "get_execution_status": {
        const execution = await keeperhubRequest(
          `/api/workflows/executions/${args.execution_id}`,
          { method: "GET" }
        );

        const txHash = execution.transactionHashes?.[0]?.hash || "Pending";
        const statusEmoji =
          execution.status === "success"
            ? "✓"
            : execution.status === "error"
              ? "✗"
              : "⏳";

        return {
          content: [
            {
              type: "text",
              text:
                `${statusEmoji} Execution Status\n\n` +
                `Execution ID: ${args.execution_id}\n` +
                `Status: ${execution.status}\n` +
                `Tx Hash: ${txHash}\n` +
                `${execution.gasUsedWei ? `Gas Used: ${execution.gasUsedWei} wei\n` : ""}` +
                `Completed: ${execution.completed ? "Yes" : "No"}\n` +
                `${execution.error ? `Error: ${execution.error}` : ""}`,
            },
          ],
        };
      }

      case "list_executions": {
        let path = "/api/workflows/executions";
        const params = [];
        if (args.workflow_id) params.push(`workflowId=${args.workflow_id}`);
        if (args.status) params.push(`status=${args.status}`);
        params.push(`limit=${args.limit || 20}`);
        if (params.length > 0) path += `?${params.join("&")}`;

        const response = await keeperhubRequest(path, { method: "GET" });

        const executions = response.data || [];
        const text =
          executions.length === 0
            ? "No executions found."
            : executions
                .map(
                  (e) =>
                    `• Execution ${e.id}\n` +
                    `  Status: ${e.status}\n` +
                    `  Workflow: ${e.workflowId}\n` +
                    `  Tx: ${e.transactionHashes?.[0]?.hash || "Pending"}\n` +
                    `  Time: ${e.createdAt}`
                )
                .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Recent Executions:\n\n${text}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
          isError: true,
        },
      ],
    };
  }
});

/**
 * Start the MCP server over stdio.
 * This connects to GitHub Copilot or other MCP clients.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[keeperhub-mcp] Server started and connected.");
}

main().catch(console.error);
