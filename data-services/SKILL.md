---
name: cc0company-data-services
version: 1.0.0
description: Pay-per-call data digests on cc0.company via x402 v2 USDC. Synchronous JSON responses (no polling) covering CC0 NFT market intel — hourly-refreshed top-N rankings, on-chain analytics, and editorial context from cc0pedia. Output is CC0 — reuse, repost, remix freely.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
---

# cc0.company Data Services — CC0 Market Intelligence

x402-paid data digests built on top of cc0pedia (the open-source CC0
encyclopedia we maintain), live OpenSea v2 stats, and LLM synthesis.
Designed as the upstream feed for content bots, dashboards, weekly
newsletters, and autonomous trading agents that want a single API
call to get the state of the CC0 sector.

## How these differ from `agent-services`

| | `agent-services/*-gen` | `data-services/*` |
|---|---|---|
| Output | Generated image (CC0) | Structured JSON digest |
| Shape | Async (job_id → poll) | **Synchronous (returns payload in same 200)** |
| Latency | ~30-60s per generation | ~50ms cache hit, ~1.3s on cold cache (lazy-build) |
| Pricing | 0.069 USDC per call | 0.05 USDC per call |
| Use case | Make CC0 art | Read CC0 market state |

## Services in this skill

| Slug | Refresh | Price | Returns |
|---|---|---|---|
| `cc0-daily-brief` | Hourly cache | 0.05 USDC | Top-5 CC0 NFT collections by 24h volume + per-collection metrics + cc0pedia editorial context + LLM-synthesized macro headline |
| `cc0pedia` | Live per-query | 0.01 USDC | ONE resolved cc0pedia entry (CC0 creator / collection / work) by name or slug — provenance, creator, license, on-chain pointers + full CC0 body |

Per-service detail files :
- [`./cc0-daily-brief.md`](./cc0-daily-brief.md) — full schema, sample response, integration recipes
- [`./cc0pedia.md`](./cc0pedia.md) — query the largest machine-readable CC0 database; full schema + recipes

> **Two shapes here.** `cc0-daily-brief` is a *cached digest* (hourly,
> empty body, cache semantics below apply). `cc0pedia` is a *live
> lookup* — it takes a `{ "query": "..." }` body, reads the database
> on every call, and has NO cache cadence / `/status` endpoint. A
> `cc0pedia` query that matches nothing returns 404 and the x402
> payment auto-cancels, so you only pay for entries that exist.

## Quick start (any service in this skill)

The flow is the same for every data service — only the slug and
price change.

```bash
# 1. Probe without payment → get the 402 challenge
curl -i -X POST https://cc0.company/api/store/agent-services/<slug>/invoke \
  -H "Content-Type: application/json" -d '{}'
# → 402 + Payment-Required header (base64-encoded JSON)

# 2. Sign the EIP-3009 USDC authorization to the payTo from the header
#    (any viem-compatible wallet works — see ../x402-payments/SKILL.md)

# 3. Retry with the PAYMENT-SIGNATURE header
curl -X POST https://cc0.company/api/store/agent-services/<slug>/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{}'
# → 200 + full digest payload in the response body (NO polling)
```

That's it. Compare to image-gen :
- No `job_id` to track
- No `poll_url` to hit every 2-5s
- No `output_url` to download
- Just the data, in the same response as your payment.

## Output licensing

Every JSON payload returned by these services is **CC0 / public
domain**. Repost, screenshot, embed, train on, redistribute without
attribution. The underlying data is sourced from public APIs
(OpenSea v2, Etherscan, etc.) + cc0pedia (CC0-licensed by
construction) + Anthropic Haiku synthesis (cc0.company explicitly
releases the synthesized text under CC0).

## Cache semantics & the `cache_age_seconds` field

All data services in this skill share the same cache pattern :

- **Hourly cron** refreshes the cache at minute 0 of every hour
- **Lazy build** triggers if cache is cold (right after deploy, or
  if the cron silently failed) — the first paying agent absorbs a
  ~1.3s build cost; every subsequent agent gets the cached row
- Each response includes :
  - `generated_at` — ISO timestamp when this brief was built
  - `cache_age_seconds` — seconds since `generated_at`, always
    < 3600 in steady state
  - `cache_freshness_hint` — `"fresh"` (< 1h), `"recent"` (1-2h),
    `"stale"` (> 2h)

If you need fresher data than the cache cadence, you have to wait
for the next hourly cron — there's no "force rebuild on demand"
public endpoint (would defeat the unit economics). For data > 1h
stale flagged as `"stale"` , re-poll in 60-120s — the cron is
running.

## Free cache health endpoint

Every data service also exposes a **free** (no x402) GET
endpoint :

```
GET /api/store/agent-services/<slug>/status
```

Returns `{ has_cache, cache_age_seconds, last_success_at,
latest_attempt_error, ... }`. Use this to :
- Pre-check before paying — avoid leaking USDC on a doomed call
- Monitor cache health in your dashboard
- Trigger your own pipeline alerts when `latest_attempt_error`
  becomes non-null

## Related skills

- [`../agent-services/SKILL.md`](../agent-services/SKILL.md) — buy
  CC0-licensed image generations. Different shape (async,
  job_id-based) but same x402 + same wallet.
- [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — full
  x402 v2 client reference. Read this first if you've never signed
  an EIP-3009 USDC authorization before.

## Discovery (Coinbase Bazaar / agentic.market)

These services declare the
[Bazaar discovery extension](https://docs.cdp.coinbase.com/x402/bazaar)
on every 402 challenge. They surface on
[agentic.market](https://agentic.market) automatically (no separate
submission) and are queryable via the CDP discovery API :

```bash
curl "https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x14849AfA040eDeee524a40c52b877fe1B6E6c2c5"
# → JSON listing every cc0.company endpoint, including cc0-daily-brief
```

## ERC-8257 manifests

Every data service ships an
[ERC-8257](https://ercs.ethereum.org/ERCS/erc-8257) manifest at :

```
https://cc0.company/.well-known/ai-tool/<slug>.json
```

The manifest is the canonical schema reference — drop it into your
runtime, validate responses against it, parse with confidence.
