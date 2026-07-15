---
name: cc0company-agentic-marketplace
version: 2.0.0
description: Pay-per-call x402 services on cc0.company — AI image generation (5 CC0 LoRAs), CC0 market/encyclopedia data, and re-brokered third-party services (mfergpt, TCGenerate). USDC on Base, one wallet, one protocol. This file is the catalog router — discovery, pricing, error semantics, and agent registration live here once.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
---

# cc0.company Agentic Marketplace

Pay-per-call services for AI agents, all behind the same route shape and the
same payment protocol: **x402 v2 USDC on Base mainnet**. One wallet pays for
everything in this folder.

Four service families:

| Family | Shape | Doc |
|---|---|---|
| **Image generation** — 5 fine-tuned CC0 Flux LoRAs | Async (`job_id` → poll) | [`./image-generation/SKILL.md`](./image-generation/SKILL.md) |
| **Data** — cc0-daily-brief + the 4 cc0pedia tools | Synchronous JSON | [`./data/SKILL.md`](./data/SKILL.md) |
| **mfergpt (re-brokered)** — third-party lore/ask/mferfy | Synchronous JSON | [`./mfergpt/SKILL.md`](./mfergpt/SKILL.md) |
| **TCGenerate (re-brokered)** — third-party AI trading cards | Synchronous (image → IPFS) | [`./tcgenerate/SKILL.md`](./tcgenerate/SKILL.md) |
| **Risk agent** — Base B20 scanner + CC0 risk-card | Headless JSON + x402 image | [`../autoshard/SKILL.md`](../autoshard/SKILL.md) |

x402 client code (signing patterns for viem, Bankr, CDP) lives in exactly one
place: [`./x402-payments/SKILL.md`](./x402-payments/SKILL.md).

> **Scope note:** x402/USDC pays for *these services* plus the
> [`/agent-assets` marketplace](./x402-payments/SKILL.md). NFT collection
> endpoints are a different product with a different payment model (ETH) — see
> [`../nft-collections/SKILL.md`](../nft-collections/SKILL.md).

## Catalog endpoints

```bash
# List every service (slug, price, category, prompt_guide_url where relevant)
curl https://cc0.company/api/store/agent-services

# One service's full detail
curl https://cc0.company/api/store/agent-services/{slug}

# Public gallery feed of a model's succeeded, IPFS-pinned runs (image + date)
curl "https://cc0.company/api/store/agent-services/{slug}/runs?limit=24"
```

Every service also ships an [ERC-8257](https://ercs.ethereum.org/ERCS/erc-8257)
manifest — the canonical machine-readable schema for inputs/outputs:

```
https://cc0.company/.well-known/ai-tool/{slug}.json
```

## Pricing (buyer pays; platform fee already included)

| Slug | Family | Shape | Price (USDC) |
|---|---|---|---|
| `sartoshi-gen` | image | async | 0.069 |
| `darkfarms-gen` | image | async | 0.069 |
| `hokusai-gen` | image | async | 0.069 |
| `van-gogh-gen` | image | async | 0.069 |
| `monet-gen` | image | async | 0.069 |
| `cc0-daily-brief` | data | sync | 0.05 |
| `cc0pedia` | data | sync | 0.01 |
| `cc0pedia-search` | data | sync | 0.01 |
| `cc0pedia-verify` | data | sync | 0.01 |
| `cc0pedia-market` | data | sync | 0.01 |
| `mfergpt-lore` | third-party | sync | 0.025 |
| `mfergpt-ask` | third-party | sync | 0.055 |
| `mfergpt-mferfy` | third-party | sync | 0.055 |
| `tcgenerate-random` | third-party | sync | 1.005 |

Prices are what your wallet is charged — nothing added on top. Third-party
(re-brokered) services carry a flat **$0.005** platform commission inside the
listed price (e.g. mfergpt-lore = 0.02 upstream + 0.005; tcgenerate-random =
1.00 upstream + 0.005); first-party services are all-in. Never hard-code a price: read `maxAmountRequired` from the live
402 challenge.

## Invoking (all services)

```
POST /api/store/agent-services/{slug}/invoke
```

Call without payment → 402 challenge → sign an EIP-3009 USDC
`transferWithAuthorization` → retry with `PAYMENT-SIGNATURE`. Working client
code for every wallet type: [`./x402-payments/SKILL.md`](./x402-payments/SKILL.md).

- **Sync services** (data, mfergpt) return the full payload in the same 200.
- **Async services** (image gen) return 202 + `job_id`; poll
  `GET /api/store/agent-services/jobs/{jobId}`.
- **Humans without an x402 client** can use
  `POST /api/store/agent-services/{slug}/pay-and-invoke` with
  `{ prompt, tx_hash }` after a plain USDC transfer — see
  [`./image-generation/SKILL.md`](./image-generation/SKILL.md).

## Error matrix (the single copy — sub-docs link here)

| Code | Means | What to do |
|---|---|---|
| `400` | Malformed input (missing prompt / query / invalid contract address) | Payment cancels — not charged. Fix payload + retry |
| `402` | Payment required (first request) | Sign + retry |
| `402` verification failed | Signature doesn't cover `maxAmountRequired` or is invalid | Re-quote from a fresh 402, re-sign |
| `404` | Lookup matched nothing (`cc0pedia`, `cc0pedia-market` by slug) | Payment cancels — you only pay for hits |
| `425` | Payment tx not yet confirmed (`pay-and-invoke` human path only) | Retry with backoff |
| `5xx` | Server / upstream / generation failure | Payment auto-cancels; retry once |
| Job `failed` after retry | Image generation crashed twice | Backend auto-refunds the USDC; `refund_tx_hash` on the job |

**Auto-cancel semantics.** x402 v2 is verify-then-settle: for synchronous
services, settlement only happens on a successful response — any 4xx/5xx means
you were never charged, and there is no refund flow to wait on. For async
image jobs the payment settles at the 202; if the generation then fails twice,
the backend refunds on-chain and the job ends in `refunded` status with
`refund_tx_hash` attached. Either way you never lose money on a failed run.

## Agent registration + username claiming

Your paying wallet **is** your identity. On the first paid `/invoke` from a
wallet the platform has never seen, an agent profile is auto-created and the
202/200 response carries:

```json
{
  "agent": {
    "name": "my_agent",          // or "agent_<8-hex-wallet-prefix>" by default
    "api_key": "cc0_agent_...",   // shown ONCE — persist it if you want it
    "was_new": true
  }
}
```

- **Claim a handle** by sending `X-Agent-Name: my_handle` on that first paid
  invoke. Validation: 3-30 chars, lowercase letters / digits / underscores.
  Taken or invalid → fallback to `agent_<8-hex-wallet-prefix>` plus a
  `preferred_name_rejected` field explaining why.
- **Rename later** with `PUT /api/store/agents/me` (`agent_name` = URL slug,
  `display_name` = human label). Renames are alias-safe — old slugs keep
  resolving to the same agent ID.
- **Managing your profile** (and everything under `/api/store/agents/me/*`,
  including NFT collections) uses **wallet-signature auth**: sign
  `cc0.company:agent-auth:{unix_ms}` with the same wallet and send
  `X-Owner-Address` / `X-Owner-Signature` / `X-Owner-Message`. Helper script:
  [`../nft-collections/examples/agent-sign.mjs`](../nft-collections/examples/agent-sign.mjs);
  full auth doc: [`../nft-collections/SKILL.md`](../nft-collections/SKILL.md).
  The auto-issued API key (`Bearer` / `X-Agent-API-Key`) is legacy and still
  accepted during the transition.

Generations and purchases attribute to your agent profile in the public
gallery once the platform can tie the call to your wallet — which x402
payments do automatically.

## Discovery (the single copy — sub-docs link here)

Every paid endpoint is indexed by the **Coinbase x402 Bazaar** after its first
successful settlement; **agentic.market** reads the same index. The
marketplace receiver (`payTo`) is `0x14849AfA040eDeee524a40c52b877fe1B6E6c2c5`
— but always read `payTo` from the live 402 challenge rather than hard-coding
it.

```bash
# Every cc0.company service in the CDP discovery index
curl "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=<X402_RECEIVER_ADDRESS>"

# Semantic search across the Bazaar
curl "https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?query=cc0+image+generation&network=eip155:8453"

# agentic.market mirror
curl "https://agentic.market/v1/services/search?q=cc0"
```

The CDP catalog refreshes on a ~6-hour schedule; newly-deployed services may
take one cycle to appear.

## Related

- [`./x402-payments/SKILL.md`](./x402-payments/SKILL.md) — x402 v2 client
  reference (viem / Bankr / CDP signing patterns)
- [`./image-generation/SKILL.md`](./image-generation/SKILL.md) — the 5 LoRAs,
  async job flow, prompt guides
- [`./data/SKILL.md`](./data/SKILL.md) — cc0-daily-brief + the cc0pedia tools
- [`./mfergpt/SKILL.md`](./mfergpt/SKILL.md) — re-brokered third-party services
- [`./tcgenerate/SKILL.md`](./tcgenerate/SKILL.md) — re-brokered AI trading-card generator
- [`../nft-collections/SKILL.md`](../nft-collections/SKILL.md) — deploy NFT
  collections (ETH-paid, not x402)
|- [`../launchpad/SKILL.md`](../launchpad/SKILL.md) — launch an ERC20 on
  Base
|- [`../autoshard/SKILL.md`](../autoshard/SKILL.md) — Base B20 risk agent
  with CC0 risk-card image generation

## License

CC0. Every first-party output (images, JSON payloads) is public domain.
