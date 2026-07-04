# cc0.company — Skills for AI Agents

This repo is the canonical source of truth for how AI agents integrate with
[cc0.company](https://cc0.company): an NFT-commerce + AI-agent platform where
everything is public domain (CC0) and agents are first-class citizens. Every
surface humans use is mirrored for agents under `/api/store/agents/me/*` —
launch a token, deploy and operate NFT collections on Base or Ethereum
mainnet, buy pay-per-call AI services. Each skill is a focused, self-contained
guide an agent installs into its runtime.

## Skills index

| Skill | What it does |
|---|---|
| [`sdk/`](./sdk) | **The programmatic path** — `@cc0company/sdk` v1.5.0 (npm, TypeScript, viem-only): `Cc0Drops` (full IPFS NFT lifecycle incl. dashboard-parity management + new editions on a live 1155), `Cc0Launchpad`, `Cc0Fees`, `Cc0Staking`. Three signers (walletClient / private key / universal `sender` — Bankr via `signMessage` + EIP-1271). Method reference + Bankr specifics. |
| [`launch-token/`](./launch-token) | Launch an ERC20 on Base, Ethereum mainnet, or Robinhood Chain (Uniswap V4) in one transaction (`@cc0company/sdk`): instant liquidity, on-chain-enforced 75/15/10 fee split, fee claiming, $cc0company staking. Works with any signer — viem / private key, or a universal `sender` for CDP, Bankr, Safe. |
| [`nft-collections/`](./nft-collections) | Deploy + operate NFT collections as an agent, on Base (8453) or Ethereum mainnet (1). The router covers auth, the ETH payment model, and picking a storage + edition path. Paid routes cost ETH (agent-signed txs / 402-style ETH transfers) — not x402. Preferred programmatic path: `@cc0company/sdk` v1.5.0 `Cc0Drops` — the full IPFS drop lifecycle (pin/deploy/manage/mint), Bankr-compatible via `ExternalSender.signMessage` + `GET /store/agents/by-wallet/:address`. |
| [`agentic-marketplace/`](./agentic-marketplace) | Pay-per-call services over x402 v2 (USDC on Base): AI image generation on 5 CC0 LoRAs, CC0 data services, re-brokered mfergpt tools. Includes the canonical x402 client reference. |

### `nft-collections/` map

The tree is a rail → edition → standard matrix. The root owns the shared
foundations (auth, ETH payment, chains, `social_links`); each rail router,
edition router, and leaf links back up to it.

| File | Covers |
|---|---|
| [`SKILL.md`](./nft-collections/SKILL.md) | **Root router** — wallet-signature auth (+ Bankr EIP-1271), ETH payment model, chains, `social_links`, and the rail→edition→standard decision tree linking all 8 leaves |
| [`ipfs/SKILL.md`](./nft-collections/ipfs/SKILL.md) | **IPFS rail router** (CC0Drop ERC721-C / CC0Drop1155): pin art + metadata, one self-signed deploy tx, drop record, phases, delayed reveal, numbered-OE metadata, SDK `Cc0Drops` |
| [`fully-onchain/SKILL.md`](./nft-collections/fully-onchain/SKILL.md) | **Fully-onchain rail router** (SSTORE2): chunked artwork uploads, 402-ETH platform work, prepare/confirm deploy, on-chain phases — raw-API only |
| [`allowlist.md`](./nft-collections/allowlist.md) | **The** canonical merkle allowlist recipe (leaf format, OZ sorted-pair, holder snapshots, CC0Drop preimage re-persist) — the 4 limited leaves link here |
| [`airdrops.md`](./nft-collections/airdrops.md) | Batch-mint airdrops + cross-chain holder snapshots |
| [`examples/`](./nft-collections/examples) | `agent-sign.mjs` (wallet-signature auth helper), `e2e-cc0drop.mjs` (runnable pin → deploy → record → mint), `build-allowlist.mjs`, `build-merkle.ts` |
| [`sdk/`](./sdk) | `@cc0company/sdk` v1.5.0 `Cc0Drops` — the typed programmatic path for the IPFS rail |

The 8 leaves (rail / edition / standard):

| Rail | Edition | Leaf (cc0drop = ERC721) | Leaf (erc1155) |
|---|---|---|---|
| IPFS | open | [`ipfs/open-edition/cc0drop`](./nft-collections/ipfs/open-edition/cc0drop/SKILL.md) | [`ipfs/open-edition/erc1155`](./nft-collections/ipfs/open-edition/erc1155/SKILL.md) |
| IPFS | limited | [`ipfs/limited-edition/cc0drop`](./nft-collections/ipfs/limited-edition/cc0drop/SKILL.md) | [`ipfs/limited-edition/erc1155`](./nft-collections/ipfs/limited-edition/erc1155/SKILL.md) |
| Fully-onchain | open | [`fully-onchain/open-edition/cc0drop`](./nft-collections/fully-onchain/open-edition/cc0drop/SKILL.md) | [`fully-onchain/open-edition/erc1155`](./nft-collections/fully-onchain/open-edition/erc1155/SKILL.md) |
| Fully-onchain | limited | [`fully-onchain/limited-edition/cc0drop`](./nft-collections/fully-onchain/limited-edition/cc0drop/SKILL.md) | [`fully-onchain/limited-edition/erc1155`](./nft-collections/fully-onchain/limited-edition/erc1155/SKILL.md) |

### `agentic-marketplace/` map

| File | Covers |
|---|---|
| [`SKILL.md`](./agentic-marketplace/SKILL.md) | Catalog router: every paid service, price, sync vs async job semantics |
| [`x402-payments/SKILL.md`](./agentic-marketplace/x402-payments/SKILL.md) | The ONLY place with x402 client code: signing patterns (viem one-liner / Bankr HTTP-only / CDP), Bankr config gotchas, Bazaar + agentic.market discovery, error matrix |
| [`image-generation/SKILL.md`](./agentic-marketplace/image-generation/SKILL.md) | Pay-per-call image gen on 5 CC0 LoRAs (0.069 USDC) + per-model prompt guides: `sartoshi-gen.md`, `darkfarms-gen.md`, `hokusai-gen.md`, `van-gogh-gen.md`, `monet-gen.md` |
| [`data/SKILL.md`](./agentic-marketplace/data/SKILL.md) | Synchronous JSON data services: [`cc0-daily-brief.md`](./agentic-marketplace/data/cc0-daily-brief.md) (0.05 USDC), [`cc0pedia.md`](./agentic-marketplace/data/cc0pedia.md) (0.01 USDC) |
| [`mfergpt/SKILL.md`](./agentic-marketplace/mfergpt/SKILL.md) | Re-brokered mfergpt x402 services: lore search, ask, image→mfer |

## Install

### As an agent skill (Claude Code, Codex, Gemini CLI)

```bash
git clone https://github.com/cryptomfer/cc0company.git ~/.claude/skills/cc0company
```

Or per-project:

```bash
cd your-agent-project
mkdir -p .claude/skills && cd .claude/skills
git clone https://github.com/cryptomfer/cc0company.git
```

Your agent runtime discovers the skills on next load. Each `SKILL.md` is the
activation entry point; sub-files (`examples/`, per-model prompt guides,
edition/storage sub-skills) load when the agent reaches for them.

### As reference docs (humans, just curl-ing the API)

Every `SKILL.md` is plain Markdown with copy-pasteable bash and TypeScript.
Nothing is agent-specific about the API contracts — anything an agent does, a
human can do with the same endpoints and the same wallet.

## Prerequisites

Two things before any authenticated cc0.company call works:

1. **An EVM wallet.** Base for everything; NFT collections can also deploy on
   Ethereum mainnet (the factory is live on both chains). Recommended:
   [Coinbase CDP SDK](https://docs.cdp.coinbase.com/) or any viem-compatible
   signer (raw private key, exported wallet). [Bankr](https://bankr.bot) works
   for HTTP-only runtimes — config caveats apply, see
   [`agentic-marketplace/x402-payments/SKILL.md`](./agentic-marketplace/x402-payments/SKILL.md).

2. **Wallet-signature auth — your wallet IS your identity.** Register once
   with `POST /api/store/agents/register`, proving wallet control by signing
   `cc0.company:agent-register:{unix_ms}`. Then authenticate every
   `/api/store/agents/me/*` call by signing
   `cc0.company:agent-auth:{unix_ms}` and sending the header trio
   `X-Owner-Address` / `X-Owner-Signature` / `X-Owner-Message`. Signatures
   are valid 15 minutes; sign fresh per request. EOA and EIP-1271 smart
   wallets both work. Drop-in helper:
   [`nft-collections/examples/agent-sign.mjs`](./nft-collections/examples/agent-sign.mjs).
   Legacy API keys (`Authorization: Bearer` / `X-Agent-API-Key`) are still
   accepted during the transition.

### How you pay

- **NFT collection routes** cost **ETH**: you sign deploy/config txs from your
  own wallet, and upload routes use an HTTP-402-style quote → plain ETH
  transfer → retry with `payment_tx_hash`. No x402 involved.
- **Marketplace services** (image gen, data, mfergpt) are paid in **USDC via
  x402 v2** — client code in
  [`agentic-marketplace/x402-payments/SKILL.md`](./agentic-marketplace/x402-payments/SKILL.md).
- **Token launches** cost gas only.

## Public API base

```
https://cc0.company/api
```

All endpoints used by these skills live under there. See
[`https://cc0.company/skill.md`](https://cc0.company/skill.md) for the flat
HTTP-level API reference (every endpoint the platform exposes, kept in sync
with the codebase) and [`https://cc0.company/llms.txt`](https://cc0.company/llms.txt)
for the compact marketplace-services entry point. The skills in this repo are
the structured, scenario-driven layer on top.

## Updates

```bash
cd ~/.claude/skills/cc0company  # or wherever you cloned
git pull --ff-only
```

PRs welcome — if you integrate cc0.company from an agent and something is
missing or wrong, file an issue or send a PR against the relevant `SKILL.md`.

## License

Skills are CC0 — same as the outputs of every cc0.company model. Copy, fork,
embed, train on, build commercial agents around. No attribution required.
