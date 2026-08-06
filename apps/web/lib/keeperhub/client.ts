/**
 * KeeperHub Direct Execution API client (apps/web side).
 *
 * Matches the real API at https://docs.keeperhub.com/api/direct-execution.
 * Mirrors services/analysis/keeperhub.js so both apps behave the same way.
 *
 * Auth is a single `kh_` organization API key. KeeperHub custodies the
 * signing wallet server-side (Turnkey enclave, configured in KeeperHub's
 * own dashboard under Wallet Management) -- this app never holds, receives,
 * or transmits a private key for it.
 *
 * See docs/integrations/keeperhub-mcp.md.
 */

import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

const KEEPERHUB_BASE_URL = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com";
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY ?? "";

function isPlaceholder(val: string | undefined): boolean {
  if (!val || !val.trim()) return true;
  const v = val.trim();
  return v.includes("your_") || v.includes("_here");
}

/** True when KEEPERHUB_API_KEY isn't set to a real value yet. */
export function isKeeperhubConfigured(): boolean {
  return !isPlaceholder(KEEPERHUB_API_KEY);
}

async function keeperhubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isKeeperhubConfigured()) {
    throw new Error("KEEPERHUB_API_KEY is not configured");
  }

  const res = await fetch(`${KEEPERHUB_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      `KeeperHub request failed: ${res.status} ${(body as { error?: string }).error ?? res.statusText}`
    );
  }

  return body as T;
}

export interface ContractCallParams {
  contractAddress: string;
  chainId: number;
  functionName: string;
  functionArgs?: unknown[];
  abi?: string;
  value?: string;
}

interface SimulateResponse {
  success: boolean;
  status: string;
  wouldRevert: boolean;
  revertReason?: string;
  result?: unknown;
}

interface BroadcastResponse {
  executionId?: string;
  status?: string;
  result?: unknown;
}
export type ContractCallResult = ExecutionStatus | BroadcastResponse;

export interface ExecutionStatus {
  executionId: string;
  status: "pending" | "running" | "completed" | "failed";
  transactionHash?: string;
  transactionLink?: string;
  sponsored?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

/**
 * Call a smart contract function via KeeperHub's org wallet, following the
 * documented safe first-write sequence: simulate, then broadcast with an
 * idempotency key, then poll status. Throws on a would-revert simulate or
 * a failed execution.
 */
export async function executeContractCall(
  params: ContractCallParams,
  opts: { pollIntervalMs?: number; maxPolls?: number } = {}
): Promise<ContractCallResult> {
  const body = {
    contractAddress: params.contractAddress,
    chainId: params.chainId,
    functionName: params.functionName,
    functionArgs: JSON.stringify(params.functionArgs ?? []),
    ...(params.abi ? { abi: params.abi } : {}),
    ...(params.value ? { value: params.value } : {}),
  };

  logger.info("[keeperhub] Simulating contract call", {
    contractAddress: params.contractAddress,
    functionName: params.functionName,
  });

  const sim = await keeperhubRequest<SimulateResponse>("/api/execute/contract-call", {
    method: "POST",
    body: JSON.stringify({ ...body, simulate: true }),
  });

  if (sim.wouldRevert) {
    throw new Error(`KeeperHub simulation would revert: ${sim.revertReason ?? "unknown reason"}`);
  }

  logger.info("[keeperhub] Broadcasting contract call", {
    contractAddress: params.contractAddress,
    functionName: params.functionName,
  });

  const broadcastResult = await keeperhubRequest<BroadcastResponse>("/api/execute/contract-call", {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: JSON.stringify(body),
  });

  if (!broadcastResult.executionId) {
    return broadcastResult;
  }

  return pollExecutionStatus(broadcastResult.executionId, opts);
}

async function pollExecutionStatus(
  executionId: string,
  { pollIntervalMs = 2000, maxPolls = 30 }: { pollIntervalMs?: number; maxPolls?: number }
): Promise<ExecutionStatus> {
  for (let i = 0; i < maxPolls; i++) {
    const status = await keeperhubRequest<ExecutionStatus>(`/api/execute/${executionId}/status`, {
      method: "GET",
    });
    if (status.status === "completed" || status.status === "failed") {
      if (status.status === "failed") {
        throw new Error(`KeeperHub execution ${executionId} failed: ${status.error ?? "unknown error"}`);
      }
      return status;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`KeeperHub execution ${executionId} did not complete within ${maxPolls} polls`);
}
