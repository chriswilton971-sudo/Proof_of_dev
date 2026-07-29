/**
 * KeeperHub MCP/REST client.
 *
 * Connection-only for now — no automation workflows wired up yet.
 * See docs/integrations/keeperhub-mcp.md for setup and context.
 */

import { fetchJson } from "./chain-data/http.js";

export const KEEPERHUB_BASE_URL = process.env.KEEPERHUB_BASE_URL ?? "https://app.keeperhub.com";
export const KEEPERHUB_API_KEY  = process.env.KEEPERHUB_API_KEY ?? "";

function isPlaceholderKey(val) {
  if (!val || !String(val).trim()) return true;
  const v = String(val).trim();
  return v.includes("your_") || v.includes("_here");
}

/** True when KEEPERHUB_API_KEY isn't set to a real value yet. */
export function isKeeperhubConfigured() {
  return !isPlaceholderKey(KEEPERHUB_API_KEY);
}

async function keeperhubRequest(path, options = {}) {
  if (!isKeeperhubConfigured()) {
    throw new Error("KEEPERHUB_API_KEY is not configured");
  }

  return fetchJson(`${KEEPERHUB_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEEPERHUB_API_KEY}`,
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Basic connectivity check against the MCP endpoint's status info.
 * Not a real workflow call — just confirms the key/base URL work.
 */
export async function checkKeeperhubConnection() {
  return keeperhubRequest("/mcp", { method: "GET" });
}
