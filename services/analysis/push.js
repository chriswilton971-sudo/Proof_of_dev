/**
 * ZeroMQ push socket — hot-path analysis queue.
 *
 * The push socket is created once and kept alive for the lifetime of the
 * API process. It binds to QUEUE_ENDPOINT and distributes jobs round-robin
 * to all connected pull workers.
 *
 * Acquisition is lazy and timeout-guarded: nothing binds at module load
 * time, and a bind that doesn't complete within BIND_TIMEOUT_MS rejects
 * instead of hanging forever. This matters because api.js must be able to
 * start serving /health even if ZeroMQ can't bind (e.g. port conflict,
 * sandboxed network) — a stuck top-level bind would otherwise prevent
 * app.listen() from ever running.
 */

import { Push } from "zeromq";
import { QUEUE_ENDPOINT } from "./config.js";

const BIND_TIMEOUT_MS = 5000;

/** @type {Push | null} */
let _push = null;

/** @type {Promise<Push> | null} */
let _binding = null;

/**
 * Returns the singleton push socket, creating and binding it on first call.
 * Safe to call repeatedly and concurrently — subsequent calls await the
 * same in-flight binding rather than starting a second one. If a bind
 * attempt times out or fails, the next call retries from scratch.
 * @returns {Promise<Push>}
 */
export async function getPush() {
  if (_push) return _push;
  if (_binding) return _binding;

  _binding = (async () => {
    const push = new Push();

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`ZeroMQ bind to ${QUEUE_ENDPOINT} timed out after ${BIND_TIMEOUT_MS}ms`)),
        BIND_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([push.bind(QUEUE_ENDPOINT), timeout]);
    } catch (err) {
      push.close();
      throw err;
    } finally {
      clearTimeout(timer);
    }

    _push = push;
    console.info(`[push] Bound on ${QUEUE_ENDPOINT}`);
    return push;
  })();

  try {
    return await _binding;
  } finally {
    _binding = null;
  }
}

/**
 * Close the push socket (called on graceful shutdown).
 */
export function closePush() {
  if (_push) {
    _push.close();
    _push = null;
    console.info("[push] Socket closed");
  }
}

/**
 * Non-blocking check of whether the push socket is currently bound.
 * Used by /health so a status check never itself triggers or waits on a bind.
 * @returns {boolean}
 */
export function isPushBound() {
  return _push !== null;
}
