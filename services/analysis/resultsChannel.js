/**
 * Results channel — the worker process's return path to the API process.
 *
 * Why this exists: db.js keeps an in-memory job store as a fallback when
 * MongoDB is unavailable. That store is a plain module-level Map, which is
 * per-process. The API process and worker process are separate Node
 * processes connected only by the ZeroMQ job queue (push.js) — a result the
 * worker saves to *its own* memory is invisible to the API process's copy.
 * When MongoDB is down, this used to mean GET /result/:jobId would return
 * PENDING forever, even after the worker had actually finished the job.
 *
 * The fix: the worker also pushes every progress/result update over this
 * second ZeroMQ channel to the API process, which applies the exact same
 * db.js writes locally. That keeps the API's in-memory store correct
 * regardless of MongoDB availability, while MongoDB (when available)
 * continues to work exactly as before on both sides.
 */

import { Push, Pull } from "zeromq";
import { RESULTS_ENDPOINT } from "./config.js";

const CONNECT_TIMEOUT_MS = 5000;

// ─── Worker side: push updates to the API ──────────────────────────────────────

/** @type {Push | null} */
let _resultsPush = null;

/** @type {Promise<Push> | null} */
let _connecting = null;

/**
 * Returns the singleton results push socket (worker side), connecting on
 * first call. `connect()` doesn't block on the remote being up — ZeroMQ
 * queues locally and delivers once the API's pull socket is bound — but we
 * still guard it with a timeout so a misconfigured endpoint fails loudly
 * instead of silently swallowing every result forever.
 * @returns {Promise<Push>}
 */
async function getResultsPush() {
  if (_resultsPush) return _resultsPush;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const sock = new Push();
    sock.connect(RESULTS_ENDPOINT);
    _resultsPush = sock;
    console.info(`[results] Worker connected to results channel on ${RESULTS_ENDPOINT}`);
    return sock;
  })();

  try {
    return await Promise.race([
      _connecting,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("results channel connect timed out")), CONNECT_TIMEOUT_MS),
      ),
    ]);
  } finally {
    _connecting = null;
  }
}

/**
 * Report a job update to the API process. Best-effort: failures are logged
 * and swallowed, never thrown — a worker must never crash a job because the
 * *reporting* of its progress failed. MongoDB (if available) and the
 * worker's own local saveJobProgress/saveJobResult calls remain the
 * source of truth; this channel exists purely so the API's in-memory
 * fallback stays in sync too.
 * @param {{ jobId: string, status: "PENDING" | "SUCCESS" | "FAILURE", stage?: string, result?: unknown, error?: string }} update
 */
export async function reportJobUpdate(update) {
  try {
    const sock = await getResultsPush();
    await sock.send(JSON.stringify(update));
  } catch (err) {
    console.warn(`[results] Failed to report update for job ${update.jobId}: ${err.message}`);
  }
}

export function closeResultsPush() {
  if (_resultsPush) {
    _resultsPush.close();
    _resultsPush = null;
  }
}

// ─── API side: receive updates from workers ────────────────────────────────────

/**
 * Binds a pull socket on RESULTS_ENDPOINT and applies each incoming update
 * via `onUpdate`. Runs until the socket is closed; intended to be started
 * as a background loop (not awaited) from api.js. Never throws out of the
 * loop — a malformed message is logged and skipped, not fatal.
 * @param {(update: { jobId: string, status: string, stage?: string, result?: unknown, error?: string }) => Promise<void>} onUpdate
 * @returns {Promise<Pull>} resolves once bound, for shutdown/close access
 */
export async function listenForJobUpdates(onUpdate) {
  const sock = new Pull();
  await sock.bind(RESULTS_ENDPOINT);
  console.info(`[results] API listening for worker updates on ${RESULTS_ENDPOINT}`);

  (async () => {
    for await (const [raw] of sock) {
      try {
        const update = JSON.parse(raw.toString());
        await onUpdate(update);
      } catch (err) {
        console.warn(`[results] Failed to process update: ${err.message}`);
      }
    }
  })().catch((err) => {
    console.warn(`[results] Update loop ended: ${err.message}`);
  });

  return sock;
}
