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
 *   KEEPERHUB_WALLET_PRIVATE_KEY - Agentic wallet for autonomous signing
 *
 * See docs/integrations/keeperhub-copilot-agent.md for setup and context.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Import the existing KeeperHub client from the app
import {
  isKeeperhubConfigured,
  isAgenticWalletConfigured,
  checkKeeperhubConnection,
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
      "Set KEEPERHUB_API_KEY in your environment or GitHub Copilot secrets."
    );
  }

  return fetchJson(`${KEEPERHUB_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.KEEPERHUB_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "authenticate",
        description:
          "Authenticate with KeeperHub using your API key. " +
          "Call this once to link your KeeperHub account.",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "KeeperHub API key (starts with 'kh_')",
            },
          },
          required: ["api_key"],
        },
      },
      {
        name: "list_workflows",
        description: "List all available workflows in your KeeperHub account.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              description: "Maximum number of workflows (default: 50)",
              default: 50,
            },
          },
        },
      },
      {
        name: "create_workflow",
        description: "Create a new automation workflow in KeeperHub.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Workflow name",
            },
            description: {
              type: "string",
              description: "Workflow description",
            },
            network: {
              type: "string",
              enum: ["mainnet", "sepolia", "arbitrum", "polygon"],
              description: "Blockchain network",
            },
            contract_address: {
              type: "string",
              description: "Smart contract address (with 0x prefix)",
            },
            function_signature: {
              type: "string",
              description: "Function to call (e.g., 'markVerified(uint256)')",
            },
            input_schema: {
              type: "object",
              description: "JSON schema for workflow inputs",
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
          "Execute a workflow immediately with KeeperHub handling " +
          "(gas optimization, retries, MEV protection).",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "Workflow ID to execute",
            },
            input: {
              type: "object",
              description: "Workflow input parameters",
            },
          },
          required: ["workflow_id", "input"],
        },
      },
      {
        name: "get_execution_status",
        description: "Get execution status and results.",
        inputSchema: {
          type: "object",
          properties: {
            execution_id: {
              type: "string",
              description: "Execution ID from execute_workflow",
            },
          },
          required: ["execution_id"],
        },
      },
      {
        name: "list_executions",
        description: "List workflow execution history with optional filtering.",
        inputSchema: {
          type: "object",
          properties: {
            workflow_id: {
              type: "string",
              description: "Filter by workflow ID (optional)",
            },
            status: {
              type: "string",
              enum: ["running", "success", "failed", "timed_out"],
              description: "Filter by status (optional)",
            },
            limit: {
              type: "integer",
              description: "Max results (default: 20)",
              default: 20,
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    switch (name) {
      case "authenticate": {
        if (!args.api_key || !args.api_key.startsWith("kh_")) {
          throw new Error("Invalid API key format (must start with 'kh_')");
        }
        process.env.KEEPERHUB_API_KEY = args.api_key;
        const connection = await checkKeeperhubConnection();
        return {
          content: [
            {
              type: "text",
              text:
                `✓ Authentication successful!\n\n` +
                `Organization: ${connection.organization?.name || "Unknown"}\n` +
                `Available workflows: ${connection.data?.length || 0}\n\n` +
                `You can now deploy and execute workflows.`,
            },
          ],
        };
      }

      case "list_workflows": {
        const response = await keeperhubRequest(
          `/api/workflows?limit=${args.limit || 50}`,
          { method: "GET" }
        );
        const workflows = response.data || [];
        const text =
          workflows.length === 0
            ? "No workflows found."
            : workflows
                .map(
                  (w) =>
                    `• ${w.name} (ID: ${w.id})\n` +
                    `  Network: ${w.network || "unknown"}\n` +
                    `  Contract: ${w.contractAddress || "N/A"}`
                )
                .join("\n\n");
        return {
          content: [{ type: "text", text: `Available Workflows:\n\n${text}` }],
        };
      }

      case "create_workflow": {
        if (!isAgenticWalletConfigured()) {
          throw new Error("KEEPERHUB_WALLET_PRIVATE_KEY not configured");
        }
        const created = await keeperhubRequest("/api/workflows", {
          method: "POST",
          body: JSON.stringify({
            name: args.name,
            description: args.description || "",
            network: args.network,
            contractAddress: args.contract_address,
            functionSignature: args.function_signature,
            inputSchema: args.input_schema || {},
          }),
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
                `Contract: ${created.contractAddress}`,
            },
          ],
        };
      }

      case "execute_workflow": {
        if (!isAgenticWalletConfigured()) {
          throw new Error("KEEPERHUB_WALLET_PRIVATE_KEY not configured");
        }
        const triggered = await keeperhubRequest(
          `/api/workflows/${args.workflow_id}/execute`,
          {
            method: "POST",
            body: JSON.stringify({ input: args.input }),
          }
        );
        const executionId = triggered.executionId;
        if (!executionId) throw new Error("Execute returned no executionId");

        let receipt;
        try {
          receipt = await keeperhubRequest(
            `/api/workflows/executions/${executionId}/wait?timeoutMs=55000`,
            { method: "GET" }
          );
        } catch {
          receipt = { status: "running", completed: false };
        }

        const txHash = receipt.transactionHashes?.[0]?.hash || null;
        const statusText =
          receipt.completed && txHash
            ? `✓ Workflow executed!\nTx Hash: ${txHash}`
            : `⏳ Workflow running (Execution ID: ${executionId})`;

        return {
          content: [
            {
              type: "text",
              text:
                `${statusText}\n` +
                `Status: ${receipt.status}` +
                `${receipt.gasUsedWei ? `\nGas Used: ${receipt.gasUsedWei} wei` : ""}`,
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
                `${statusEmoji} Status: ${execution.status}\n` +
                `Execution ID: ${args.execution_id}\n` +
                `Tx Hash: ${txHash}\n` +
                `Completed: ${execution.completed ? "Yes" : "No"}` +
                `${execution.error ? `\nError: ${execution.error}` : ""}`,
            },
          ],
        };
      }

      case "list_executions": {
        const params = [];
        if (args.workflow_id) params.push(`workflowId=${args.workflow_id}`);
        if (args.status) params.push(`status=${args.status}`);
        params.push(`limit=${args.limit || 20}`);
        const path =
          `/api/workflows/executions` +
          (params.length > 0 ? "?" + params.join("&") : "");
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
                    `  Tx: ${e.transactionHashes?.[0]?.hash || "Pending"}`
                )
                .join("\n\n");
        return {
          content: [
            { type: "text", text: `Recent Executions:\n\n${text}` },
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[keeperhub-mcp] Server connected.");
}

main().catch(console.error);
