# Contributing

Thank you for contributing! A few quick notes to get you started.

## Requirements

- Node.js >=20.9.0 <23.0.0 and npm >=10.0.0 (nvm recommended; see `.nvmrc`). The project uses modern Node features (global fetch, ESM modules) and Next.js 16.
- Optional: MongoDB (for persisted analysis results). If not available, the app can run in demo/mock mode (set `MOCK_CHAIN_DATA=1` in `.env.local`).
- ZeroMQ native dependency: `services/analysis` depends on `zeromq` which may require system build tools / libzmq dev libraries on some platforms. On Ubuntu you can install (only needed if `npm install` fails to build the native zeromq binding):

```
sudo apt-get update && sudo apt-get install -y libzmq3-dev build-essential pkg-config
```

## Local development (demo mode)

1. Copy example env: `cp .env.example .env.local`
2. For demo mode: set `MOCK_CHAIN_DATA=1` in `.env.local` (or `export MOCK_CHAIN_DATA=1`)
3. Install deps: `npm ci`
4. Generate scoring: `npm run generate:scoring`
5. Run tests: `npm run test:scoring`
6. Start dev services: `npm run dev`

## Testing & CI

- The repository has a workflow that regenerates scoring and runs the scoring tests in demo mode on push/PR.
- If you modify `packages/scoring-spec/scoring.json`, run `npm run generate:scoring` locally before opening a PR.

## Pull request checklist

- Run tests and linters (or explain why not).
- Add or update docs where appropriate.
- Do not commit secrets (.env.local should remain local).
- Describe how you verified changes in the PR description.

## How to open a PR

- Create a feature branch, push it, and open a PR against `main`. Include a description of what you changed and how to verify it locally.
