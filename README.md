# cc0.company — Skills for AI Agents

This repo is the **canonical source of truth** for how AI agents
integrate with [cc0.company](https://cc0.company). Each skill is a
focused, self-contained guide an agent can install into its runtime
to unlock a specific capability on the platform.

cc0.company is an NFT-commerce + AI-agent platform on Base L2 where
**everything is public domain (CC0)** and **agents are first-class
citizens**. Every API surface humans use is mirrored under
`/api/store/agents/me/...` with API-key auth + ownership checks, so
an agent can deploy stores, drop ERC1155 collections, ship
ERC721Shared single-artwork drops, run auctions, or buy image
generations from cc0.company's managed CC0 LoRAs — all
programmatically, all with on-chain settlement in USDC or ETH on
Base.

## Skills index

| Skill | What it does |
|---|---|
| [`launchpad/`](./launchpad) | **Launch your own token** — one tx on Base (Uniswap V4): instant liquidity, 75% of ALL trading fees back to you forever, enforced on-chain. SDK (`@cc0company/sdk`) works with ANY signer: viem wallet / private key, or a universal `sender` for Coinbase CDP, Bankr and Safes. Images auto-pinned to IPFS. Fee claiming + $cc0company staking included. |
| [`agent-services/`](./agent-services) | **Buy AI image generations** — pay-per-call inference on 5 fine-tuned CC0 LoRAs (sartoshi, darkfarms, hokusai, van-gogh, monet) via x402 v2 USDC. Includes per-model prompt skills. |
| [`data-services/`](./data-services) | **Buy CC0 market intel** — pay-per-call synchronous JSON (no polling) over the CC0 sector. `cc0-daily-brief` (0.05 USDC) — hourly top-5 CC0 collections by 24h volume + cc0pedia context + LLM narrative. `cc0pedia` (0.01 USDC) — look up any CC0 creator / collection / work in the largest machine-readable CC0 database (provenance, creator, license, on-chain pointers). |
| [`mfergpt/`](./mfergpt) | **Call mfergpt's AI services** — cc0.company re-brokers mfergpt's live x402 catalog (lore search, ask-anything, image→mfer) as synchronous pay-per-call endpoints. Same wallet + protocol as everything else; flat $0.005 platform fee. |
| [`ipfs-drops/`](./ipfs-drops) | **Launch an IPFS drop in ONE transaction** — CC0Drop (ERC721-C) / CC0Drop1155 (ERC1155-C): phases, per-wallet merkle allowlists, delayed reveal, open/limited editions and AUTOMATIC Limit Break royalty enforcement all baked into the constructor. Live the second the deploy lands; buyers mint with direct calls. Open-edition finality: an ended open edition can NEVER be reopened. **Default choice for public drops.** |
| [`erc1155-mint/`](./erc1155-mint) | **Drop your own ERC1155 collection** — deploy contract on Base, configure open/limited/auction edition phases, mint allowlist gating, settle auctions, airdrops. Backend handles SSTORE2 chunking + `createTokenWithAttributes` after the agent pays ETH gas. |
| [`erc721-shared-mint/`](./erc721-shared-mint) | **Drop your own ERC721 shared-artwork collection** — one shared image, fixed max supply, multi-phase mint with merkle-allowlist + public windows. Single-payment orchestrator handles deploy + on-chain artwork commit in one server-side flow. |
| [`x402-payments/`](./x402-payments) | **Canonical x402 v2 client reference** — three signing patterns (viem one-liner, Bankr HTTP, CDP SDK), Coinbase Bazaar discovery, payment header format, error matrix. |

## Install

### As an Anthropic skill (Claude Code, Codex, Gemini CLI)

```bash
git clone https://github.com/cryptomfer/cc0company.git ~/.claude/skills/cc0company
```

Or per-project:

```bash
cd your-agent-project
mkdir -p .claude/skills && cd .claude/skills
git clone https://github.com/cryptomfer/cc0company.git
```

Your agent runtime will discover the skills automatically on next
load. Each subdirectory's `SKILL.md` is the activation entry point;
sub-files (`examples/`, model-specific prompt guides, etc.) are
loaded when the agent reaches for them.

### As reference docs (humans, just curl-ing the API)

Each `SKILL.md` is also valid Markdown for human eyes. The bash and
TypeScript snippets are copy-pasteable. There's nothing
agent-specific about the underlying API contracts — anything an
agent does, a human can do with the same endpoints + API key.

## Prerequisites for any skill

Two things you need before any cc0.company API call works:

1. **A Base EVM wallet**. Recommended: [Coinbase CDP
   SDK](https://docs.cdp.coinbase.com/) or [Base
   MCP](https://blog.base.org/base-mcp) (Agentic Wallet, MPC + Nitro
   Enclave, native x402). Any viem-compatible signer works too —
   raw private key, exported wallet, etc. [Bankr](https://bankr.bot)
   is supported as a fallback for HTTP-only runtimes (config caveats
   apply — see `erc1155-mint/SKILL.md`).

2. **An agent profile on cc0.company**. Auto-created on your first
   paid x402 invoke; the 202 response carries `agent.api_key` (shown
   once — save it). Send it on every subsequent call as either
   `Authorization: Bearer <key>` or `X-Agent-API-Key: <key>`.

## Public API base

```
https://cc0.company/api
```

All endpoints used by these skills live under there. See
[`https://cc0.company/skill.md`](https://cc0.company/skill.md) for
the full HTTP-level API reference (a flat dump of every endpoint
the platform exposes, kept in sync with the codebase). The skills
in this repo are the **structured, scenario-driven** layer on top.

## Updates

Skills evolve as cc0.company ships features. To get the latest:

```bash
cd ~/.claude/skills/cc0company  # or wherever you cloned
git pull --ff-only
```

PRs welcome — if you integrate cc0.company from an agent and notice
something missing, file an issue or send a PR against the relevant
`SKILL.md`.

## License

Skills are CC0 — same as the outputs of every cc0.company model.
Copy, fork, embed, train on, build commercial agents around. No
attribution required.
