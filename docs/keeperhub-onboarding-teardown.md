# Where I got stuck onboarding onto KeeperHub

*Written while building [Proof of Dev](https://github.com/chriswilton971-sudo/Proof_of_dev) — a soulbound reputation NFT that uses KeeperHub to execute its post-mint verification step onchain.*

This isn't a complaint post — the platform works, and once wired up it's genuinely reliable (audit trail, retries, and payment routing all behaved exactly as documented). This is a record of the specific places a first-time integrator loses time, in the hope it shortens someone else's path from zero to their first transaction.

---

## 1. The Quick Start Guide only covers the visual builder — not the agent/API path

`docs/getting-started/quickstart.md` walks through creating a workflow by hand in the canvas UI: add a Scheduled trigger, add a Check Balance node, connect a Discord notification, click Run. That's a great guide — if you're a human building a workflow by clicking.

It's the wrong guide if you're an *agent* (or a backend service acting on an agent's behalf) that needs to **trigger an existing workflow programmatically** and **read back the result**. That path — `KEEPERHUB_API_KEY`, `Authorization: Bearer`, `POST /v1/workflows/{id}/execute`, polling execution status — isn't mentioned anywhere in the quickstart. A builder coming from an "AI agent hackathon" framing, expecting to call KeeperHub from code, has to reverse-engineer the API shape from the CLI reference (`kh execute contract-call`) and the API index page, with no single doc connecting "I have an API key" to "I got a transaction hash back."

**What would have saved time:** a short "Programmatic / Agent Quickstart" alongside the visual one — same five-minute promise, but ending in a `curl` or SDK call that returns a `txHash`, not a screenshot of the canvas. I've submitted exactly this as a docs PR to KeeperHub's repo, and packaged the underlying pattern as a standalone runnable template: [keeperhub-agent-quickstart](https://github.com/chriswilton971-sudo/keeperhub-agent-quickstart).

## 2. Workflow execution vs. Direct Execution — no clear "which one do I want" signpost

The API surface has two distinct paths to get a transaction onchain:
- **Direct Execution** (`kh execute contract-call`, `kh execute transfer`) — call a contract or send a transfer right now, no workflow object involved.
- **Workflow execution** (`POST /v1/workflows/{id}/execute`) — trigger a pre-built workflow (created via the visual builder or the API) that may contain multiple steps.

Both are valid, both are documented individually, but nothing tells a new integrator *which one fits their use case*. I ended up building against the workflow-execution path because I'd already created a workflow in the dashboard for an unrelated reason, not because I'd made an informed choice between the two. A one-paragraph decision guide ("use Direct Execution if you just need a single call with no branching logic; use Workflows if you need multiple steps, conditions, or reuse across triggers") in the API overview would have saved the back-and-forth.

## 3. Gas sponsorship scope is easy to assume covers testnets

The hackathon materials mention KeeperHub offers gas sponsorship — accurate, but it's Mainnet Ethereum only. Building and testing on Sepolia (the sensible default for a hackathon demo) means the agentic wallet still needs its own funded Sepolia balance, sponsorship or not. This isn't a documentation *error* — it's stated correctly — but it's stated in the hackathon page, not in the wallet-funding step of the quickstart itself, so it's easy to fund a wallet, test on Sepolia, and be confused when a transaction doesn't get sponsored. A one-line callout on the "top up this wallet" step of the quickstart ("sponsorship applies to Mainnet only — testnets always need their own funded balance") closes that gap right where someone would hit it.

## 4. "Is my key actually configured?" is harder to check than it should be

This one isn't KeeperHub's fault directly, but it's a pattern worth naming: our own integration code originally treated an empty string or a `your_key_here` placeholder as "unconfigured," but didn't catch the more common placeholder pattern for private keys: `0x0000...0000`. A wallet key sitting at all-zeros looked "present" to a naive `if (key)` check, and the failure only surfaced later as a cryptic signing error instead of a clear "you haven't set this yet." Any SDK/CLI (`kh doctor` already exists and is the right instinct) that explicitly validates "is this a real key vs. a placeholder pattern" before letting a user proceed saves a very confusing debugging session. If `kh doctor` doesn't already check for the all-zeros pattern specifically, it's worth adding.

## 5. What worked well (so this doesn't read as one-sided)

- The audit-trail model (trigger → simulation → submitted tx → gas used → outcome) is exactly the right shape and made debugging our own integration straightforward once wired up.
- `kh execute status` / execution polling behaved predictably and matched the docs.
- The MCP server's one-tool-per-workflow design (no `search_workflows` indirection) is a genuinely good call — once the agent has the tool, invocation is trivial.

---

**Net takeaway:** the platform's execution and reliability guarantees are solid; the friction is entirely in the first 30 minutes, specifically the gap between "I have an API key" and "I got my first transaction hash back" for anyone building an agent rather than clicking through the canvas. Closing that gap — even just the doc PR accompanying this teardown — should meaningfully cut onboarding time for the next agent-hackathon cohort.
