/**
 * Worker process — pulls jobs from the ZeroMQ push socket and processes them.
 *
 * Transport: ZeroMQ pull socket connecting to QUEUE_ENDPOINT.
 * The API server binds the push socket; this process connects to it.
 * Multiple worker processes can run in parallel — ZeroMQ distributes
 * jobs round-robin across all connected pull sockets.
 */

import { Pull } from "zeromq";
import { analyzeWallet, countUniqueInteractors } from "./tasks.js";
import { QUEUE_ENDPOINT } from "./config.js";
import { ensureIndexes, saveJobResult, saveJobProgress } from "./db.js";
import { setEnrichmentHandler } from "./queues.js";
import { reportJobUpdate, closeResultsPush } from "./resultsChannel.js";

// ─── Startup ──────────────────────────────────────────────────────────────────

// Try to ensure indexes but don't crash if MongoDB is unavailable
ensureIndexes().then(() => {
  console.info("[worker] MongoDB ready");
}).catch(() => {
  // already warned inside ensureIndexes
});

// Register the enrichment handler (non-hot-path, in-process queue)
setEnrichmentHandler(countUniqueInteractors);
console.info("[worker] Enrichment handler registered");

// ─── ZeroMQ pull socket ───────────────────────────────────────────────────────

const pull = new Pull();
pull.connect(QUEUE_ENDPOINT);
console.info(`[worker] Connected to queue on ${QUEUE_ENDPOINT}`);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown() {
  console.info("[worker] Shutting down...");
  pull.close();
  closeResultsPush();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT",  shutdown);

/**
 * Records a job update locally (this process's DB layer — MongoDB when
 * available, otherwise this process's own in-memory store) AND reports it
 * to the API process over the results channel, so the API's in-memory
 * fallback stays correct even when MongoDB is unavailable. See
 * resultsChannel.js for why both are needed.
 */
async function recordProgress(jobId, stage) {
  await saveJobProgress(jobId, stage).catch(() => {});
  await reportJobUpdate({ jobId, status: "PENDING", stage });
}

async function recordResult(jobId, { status, result, error }) {
  await saveJobResult(jobId, { status, result, error }).catch(() => {});
  await reportJobUpdate({ jobId, status, result, error });
}

async function run() {
  console.info("[worker] Ready — waiting for jobs on ZeroMQ pull socket");

  for await (const [raw] of pull) {
    let job;
    try {
      job = JSON.parse(raw.toString());
    } catch (err) {
      console.error("[worker] Failed to parse job message:", err.message);
      continue;
    }

    const { jobId, walletAddress, network, includeEns } = job;
    console.info(`[worker] Received job ${jobId}: address=${walletAddress} chain=${network}`);

    try {
      await recordProgress(jobId, "queued");
      const result = await analyzeWallet({
        walletAddress,
        network,
        includeEns,
        onProgress: (stage) => recordProgress(jobId, stage).catch(() => {}),
      });
      await recordResult(jobId, { status: "SUCCESS", result });
      console.info(`[worker] Job ${jobId} completed`);
    } catch (err) {
      console.error(`[worker] Job ${jobId} failed: ${err.message}`);
      await recordResult(jobId, { status: "FAILURE", error: err.message }).catch(() => {});
    }
  }
}

run().catch((err) => {
  console.error("[worker] Pull loop failed:", err.message);
  process.exit(1);
});
