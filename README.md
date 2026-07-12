# Proof of Dev — On-Chain Developer Reputation

A full-stack web app that analyzes an Ethereum wallet's on-chain developer activity and generates a transparent, explainable reputation score. Optionally mint it as a soulbound (non-transferable) NFT on Sepolia or publish an EAS attestation.

---

## Features

- **Wallet connection** — MetaMask, Rabby, or WalletConnect via RainbowKit
- **Contract deployment detection** — Alchemy primary, Etherscan fallback
- **Verification check** — Etherscan source verification per contract (batched, rate-limit safe)
- **ENS resolution** — opt-in; name, avatar, URL, and GitHub handle
- **Reputation scoring** — deterministic engine with time multipliers and burst detection
- **Proof-of-Dev NFT** — soulbound ERC-721 on Sepolia, minted from the UI
- **EAS attestation** — delegated server signing; user submits on-chain
- **Downloadable report** — plain-text off-chain breakdown
- **Privacy-first** — ENS is opt-in; UI does not persist analysis data (optional MongoDB cache on the worker)

---

## Quick start

Requires Node `>=20.9.0 <23` (pinned in `.nvmrc` and `engines` — run `nvm use` if you use nvm).

**Option A — one-command setup script** (checks/installs Node via nvm, then installs dependencies):

```bash
# macOS / Linux / WSL
./setup.sh

# Windows (PowerShell)
.\setup.ps1
```

**Option B — manual:**

```bash
npm ci     # uses the committed package-lock.json for a reproducible install
npm run dev
```

**Option C — Docker** (no local Node install needed at all; also brings up MongoDB):

```bash
docker compose up --build
```

This builds an image with Node 20 and every dependency — including a `zeromq` native binding compiled for the container's own platform, which sidesteps the most common "worker won't connect" issue people hit when a prebuilt native binary doesn't match their host OS/arch. Source is bind-mounted for live-reload; `node_modules` stays inside the container.

Open [http://localhost:3000](http://localhost:3000) once running (any option).

`npm ci`/`npm install` installs the root workspace and every package under `apps/*`, `packages/*`, and `services/*` in one pass (this repo uses npm workspaces — no need to `cd` into subfolders). A `postinstall` hook also copies `.env.example` → `.env.local` automatically on first install, so the app runs in demo mode right away without any manual setup.

That single `npm run dev` command starts the analysis API, worker, and Next.js dashboard via `infra/scripts/dev.js`. This project is **local development only** — no production deploy path in the repo.

Edit the `.env.local` created for you above when you want live chain data, mint, or attest on Sepolia. **No API keys?** The app runs in **demo mode** — sample contracts and real scoring, no live Alchemy/Etherscan calls.

MongoDB is optional locally. Without it, job results stay in memory and indexed-cache features are skipped. `docker compose up` starts a MongoDB container automatically if you want persistence without installing it yourself.

`package-lock.json` is committed at the repo root — installs (`npm ci`, locally or in CI) are reproducible against it. A `sync-lockfile` CI job keeps it up to date automatically on every push to `main`.

> **A note on native dependencies:** `zeromq` (used for the analysis worker's job queue) ships prebuilt binaries per-platform and falls back to compiling from source via `cmake`/Python/a C++ toolchain when no prebuilt matches. If `npm run dev` hangs with the worker never printing "Connected to queue," this is almost always the cause — run `node -e "require('zeromq')"` to check, install build tools (`build-essential` on Linux, Xcode Command Line Tools on Mac, or use Docker above to skip this entirely), then `npm rebuild zeromq`.

### Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:
- `sync-lockfile` — generates/updates `package-lock.json` for real and commits it (push events only)
- `install-and-verify` — `npm install` across all workspaces, scoring-spec generation, lint, the scoring parity test suite, the Next.js build
- `solidity-check` — compiles `ProofOfDev.sol` with the real `solc` binary
- `indexer-check` — `cargo check` on the Rust indexer
- `secret-scan` — scans for committed secrets

Nothing needs to be run manually before merging.

### Environment variables

See `.env.example` for the full list. Common keys:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_ALCHEMY_API_KEY` / `ALCHEMY_API_KEY` | Deployments + RPC |
| `ETHERSCAN_API_KEY` | Contract verification |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect QR / mobile (optional for extension wallets) |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | ProofOfDev NFT on Sepolia |
| `NEXT_PUBLIC_EAS_SCHEMA_UID` | EAS schema UID |
| `ATTESTER_PRIVATE_KEY` | Server-side EAS attester (never expose to client) |
| `MINT_SIGNER_PRIVATE_KEY` | Server-side signer that authorizes NFT mints via EIP-712 (never expose to client) — its address is the contract's `trustedSigner` |
| `MONGO_URI` / `MONGO_DB` | Optional persistence |
| `WORKER_URL` | BFF → worker API (default `http://localhost:8000`) |
| `MOCK_CHAIN_DATA` | `1` = force demo, `0` = require real keys |

---

## Architecture

Analysis runs on the **analysis service** (`services/analysis/`), not inside the Next.js process.

```
Browser → POST /api/analyze (enqueue, 202 + jobId)
       → GET /api/analyze/[jobId] (poll with stage progress)
       → POST :8000/analyze → ZeroMQ → worker
       → chain-data + profile builder → AnalysisResponse
       → job result (memory + optional MongoDB)
       → BFF returns AnalysisResponse
```

| Process | Port | Role |
|---------|------|------|
| Next.js (web) | 3000 | UI + BFF |
| Analysis API | 8000 | Job enqueue + poll |
| ZeroMQ (jobs) | 5000 | API → worker job queue |
| ZeroMQ (results) | 5001 | Worker → API progress/result reporting |
| MongoDB | 27017 | Optional persistence + indexed cache |

### Data flow

1. UI enqueues analysis → worker API returns `jobId`.
2. Worker pulls job from ZeroMQ and runs stages: `queued` → `deployments` → `verification` → `ens` → `scoring` → `complete`.
3. Chain data comes from **indexed MongoDB cache** (if wallet was backfilled) or **live** Alchemy/Etherscan calls.
4. Worker builds a reputation profile with score, explanations, and warnings.
5. Worker reports each stage transition and the final result back to the API over a **second ZeroMQ channel** (port 5001), in addition to writing to MongoDB.
6. UI polls until complete (or partial / error).

**Why two channels, not one:** the API and worker are separate processes. When MongoDB is unavailable, job state falls back to an in-memory store — but that store is per-process, so a result the worker saves to its own memory is invisible to the API process polling on your behalf. The results channel (`services/analysis/resultsChannel.js`) closes that gap by having the worker actively push every update to the API, which applies it to its own local state. This is what makes `npm run dev` work correctly without MongoDB running at all (demo/mock mode) — polling completes instead of hanging at `PENDING` forever.

### Specs (source of truth)

| Spec | Path |
|------|------|
| Scoring | `packages/scoring-spec/scoring.json` |
| Chain data | `packages/chain-data-spec/schema.json` |
| API | `openapi/analysis.yaml` |
| DB schema | `data/schema/mongodb.json` |

Scoring rules are implemented in `apps/web/lib/core/scoring.ts` (frontend) and `services/analysis/scoring.js` (worker). The dev launcher regenerates worker scoring from the spec on startup.

---

## How scoring works

| Signal | Points |
|--------|--------|
| Contract deployment | +5 (cap: 10) |
| Verified contract | +10 (cap: 10) |
| ENS name ownership | +2 |
| ENS metadata (avatar / url / github) | +3 each |

**Time weighting:** activity older than 30 days → 1.2×; recent activity → 0.8×.

**Anti-spam:** 3+ deployments within 7 days → extra 0.8× penalty on burst contracts.

| Score | Tier |
|-------|------|
| 0 | No Activity |
| 1–9 | Early Activity |
| 10–29 | Active Builder |
| 30–59 | Established |
| 60–99 | Prolific |
| 100+ | Extensive |

This profile reflects on-chain activity only — not developer skill or code quality.

---

## Indexed deployment cache

When a wallet is indexed in MongoDB, analysis reads cached deployments and verification before calling Alchemy/Etherscan. The results dashboard shows **indexed** vs **live** via the data source badge. Indexer and seed tooling live under `services/indexer/` and `scripts/` — not required for demo mode.

Schema: `data/schema/mongodb.json`.

---

## On-chain features

### ProofOfDev NFT (`contracts/ProofOfDev.sol`)

Soulbound ERC-721 on Sepolia — one mint per wallet. Metadata served from `/api/token/[id]`. Set `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` when a contract is deployed (`npm run onchain:compile && npm run onchain:deploy`).

**Trust model:** `mint()` does not accept a caller-supplied score. The contract stores a `trustedSigner` address (set at deploy time from `MINT_SIGNER_PRIVATE_KEY`) and requires an EIP-712 signature from that key over `(recipient, score, contractCount, verifiedContractCount, hasENS, deadline)`. The flow:

1. User clicks **Mint** in the dashboard.
2. Frontend calls `POST /api/mint-authorization { address }`.
3. Server looks up the address's **stored, previously-computed** analysis result (never a value the client sends) and signs an EIP-712 `MintAuthorization` message for it, with a 15-minute deadline.
4. Frontend calls `mint(score, contractCount, verifiedContractCount, hasENS, deadline, v, r, s)` with those exact server-returned values.
5. The contract recovers the signer from `(v, r, s)` and reverts unless it matches `trustedSigner`.

A caller can't self-report a score: any tampering with the values invalidates the signature, and the signature can't be produced without `MINT_SIGNER_PRIVATE_KEY`. `setTrustedSigner()` (owner-only) lets you rotate that key without redeploying.

### EAS attestation

Delegated server signing from `/api/attest`; the user's wallet submits on Sepolia. Same trust model as minting: the server looks up the stored analysis result for the given address rather than trusting a client-supplied `profile`. Set `NEXT_PUBLIC_EAS_SCHEMA_UID` and `ATTESTER_PRIVATE_KEY` in `.env.local`. Schema registration lives in `scripts/registerSchema.ts`.

---

## API reference

OpenAPI: `openapi/analysis.yaml`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyze` | Enqueue analysis → `{ jobId, status: "PENDING" }` |
| GET | `/api/analyze/[jobId]` | Poll job (202 pending, 200/206 complete) |
| GET | `/api/profile/[address]` | Stored profile snapshot (needs MongoDB + prior analysis) |
| GET | `/api/token/[id]` | ERC-721 token metadata JSON |
| POST | `/api/attest` | Delegated EAS attestation payload for a stored profile |
| POST | `/api/mint-authorization` | EIP-712 signature authorizing `mint()` for a stored profile |
| GET | `/api/worker-status` | Worker health check |

**Analyze request body:**

```json
{ "address": "0x...", "network": "mainnet"|"sepolia", "includeENS": false }
```

---

## Project structure

```
proof-of-dev/
├── apps/web/                 # Next.js UI + BFF (App Router)
├── packages/
│   ├── scoring-spec/         # Scoring weights, caps, tiers
│   └── chain-data-spec/      # Indexer entity schema
├── services/
│   ├── analysis/             # Worker API, queue, chain-data
│   └── indexer/              # Rust CLI → MongoDB
├── data/schema/              # MongoDB collections + indexes
├── infra/                    # local dev launcher (infra/scripts/dev.js)
├── openapi/                  # API contract
├── contracts/                # ProofOfDev.sol
├── scripts/                  # deploy, compile, seed, env check
└── tests/                    # scoring parity tests
```

---

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 3**
- **RainbowKit v2 + Wagmi v2**
- **ethers.js v6**
- **Express + ZeroMQ + MongoDB** (analysis worker)
- **Rust** (indexer)
- **Solidity 0.8.20** (soulbound NFT)
- **EAS SDK** (attestations)

---

## Contributing

Submit a pull request against `main`. Keep changes focused. In the PR description, explain what you changed, why, and how you verified it on the dashboard.

---

## Disclaimer

This profile reflects on-chain activity only and does not guarantee developer skill or code quality. Data may be incomplete.
