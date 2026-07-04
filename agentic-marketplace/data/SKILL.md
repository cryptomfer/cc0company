---
name: cc0company-data-services
version: 2.0.0
description: Pay-per-call data services on cc0.company via x402 v2 USDC. Synchronous JSON (no polling) covering CC0 market intel and the cc0pedia encyclopedia — daily brief, entry lookup, free-text search, license verification, live market data. Output is CC0 — reuse, repost, remix freely.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
---

# cc0.company Data Services — CC0 Market Intelligence

x402-paid data services built on cc0pedia (the open-source CC0 encyclopedia we
maintain, 1,100+ entries), live OpenSea v2 stats, Dexscreener/GeckoTerminal
pool data, and LLM synthesis. Designed as the upstream feed for content bots,
dashboards, newsletters, license-checking agents, and autonomous traders.

## How these differ from image generation

| | [`../image-generation`](../image-generation/SKILL.md) | `data/*` |
|---|---|---|
| Output | Generated image (CC0) | Structured JSON |
| Shape | Async (job_id → poll) | **Synchronous (payload in the same 200)** |
| Latency | ~30-60s per generation | ~50ms cache hit / live lookup |
| Pricing | 0.069 USDC per call | 0.01–0.05 USDC per call |
| Use case | Make CC0 art | Read CC0 state |

## Services in this skill

| Slug | Price | Shape | Returns |
|---|---|---|---|
| `cc0-daily-brief` | 0.05 USDC | Hourly-cached digest | Top-5 CC0 NFT collections by 24h volume + per-collection metrics + cc0pedia editorial context + LLM-synthesized macro headline |
| `cc0pedia` | 0.01 USDC | Live lookup | ONE resolved cc0pedia entry (creator / collection / work) by name or slug — provenance, creator, license, on-chain pointers + full CC0 body |
| `cc0pedia-search` | 0.01 USDC | Live search | Up to 25 (max 50) ranked matches for a free-text query — slug, title, kind, license, contract pointer. The "find candidates" call before a `cc0pedia` lookup |
| `cc0pedia-verify` | 0.01 USDC | Live check | License oracle: pass a contract address → is it a documented CC0 work + full provenance |
| `cc0pedia-market` | 0.01 USDC | Live lookup | Live market for a CC0 asset by slug or contract — token price/FDV/liquidity/volume (Dexscreener + GeckoTerminal fallback) or NFT floor/volume/owners (OpenSea) |

Per-service detail files:
- [`./cc0-daily-brief.md`](./cc0-daily-brief.md) — full schema, sample response, integration recipes
- [`./cc0pedia.md`](./cc0pedia.md) — the single-entry lookup; full schema + recipes

All 5 ride `POST /api/store/agent-services/{slug}/invoke` with the standard
x402 flow — client code in [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md),
error matrix + discovery + ERC-8257 manifests in [`../SKILL.md`](../SKILL.md).
No `job_id`, no polling: the data comes back in the same response as your
payment.

## The 3 cc0pedia tools (search / verify / market)

Siblings of the `cc0pedia` lookup, each $0.01, each synchronous. Inputs are
alias-tolerant (body or query string).

### `cc0pedia-search` — free-text search

```bash
# body: { "query": "...", "kind"?: "artist"|"work"|"movement", "limit"?: 1-50 }
curl -X POST https://cc0.company/api/store/agent-services/cc0pedia-search/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"query": "jack butcher", "limit": 10}'
# → 200 { success, service, query, count,
#         results: [ { slug, title, kind, work_type, license, creator_slug,
#                      contract, chain, canonical_url } ], meta }
```

Case-insensitive title match, exact/prefix matches ranked first, `featured`
entries before the rest. Only `published` entries are visible. An **empty
result set still returns 200** — "nothing matched" is a valid paid answer; a
malformed call (no query) returns 400 and cancels the payment. Chain the
winning `slug` into a `cc0pedia` lookup for the full record.

### `cc0pedia-verify` — the license oracle

```bash
# body: { "contract": "0x..." }  (aliases: contract_address, address, token, token_address)
curl -X POST https://cc0.company/api/store/agent-services/cc0pedia-verify/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"contract": "0x79fcdef22feed20eddacbb2587640e45491b757f"}'
# → 200 { documented: true, license: "CC0",
#         entry: { slug, title, work_type, url },
#         provenance: { creator, contract_address, chain, standard,
#                       total_supply, year, collection, parent_works, sources },
#         matched_entries }
```

The "is this safe to reuse?" check before touching on-chain art. Matches the
contract against published `work` entries (collection-level entries preferred
over single-token cards). **Absence is NOT a license determination** —
`documented: false` means "not in cc0pedia", not "not CC0"; the payload says
so explicitly. An invalid address returns 400 (payment cancels).

### `cc0pedia-market` — live market data

```bash
# body: { "slug": "..." }  OR  { "contract": "0x...", "chain"?: "base"|"ethereum" }
curl -X POST https://cc0.company/api/store/agent-services/cc0pedia-market/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"slug": "mfers"}'
# → 200 { slug, title, canonical_url, market: { ... } }
```

- **Tokens** → price / FDV / liquidity / 24h volume / dex, read from
  Dexscreener with a GeckoTerminal fallback (both read the pool directly, so
  long-tail CC0 tokens are covered).
- **NFT collections** → floor / 24h + total volume / sales / owners (OpenSea).
- A slug that matches no published entry → 404, payment cancels. A resolved
  asset with no market anywhere → 200 with `market: null` (a valid paid
  answer). Missing both slug and contract → 400, payment cancels.

## Output licensing

Every JSON payload returned by these services is **CC0 / public domain**.
Repost, screenshot, embed, train on, redistribute without attribution. The
underlying data is sourced from public APIs (OpenSea v2, Dexscreener,
GeckoTerminal, etc.) + cc0pedia (CC0-licensed by construction) + Anthropic
Haiku synthesis (cc0.company explicitly releases the synthesized text under
CC0).

## Cache semantics (`cc0-daily-brief` only)

The 4 cc0pedia tools are live per-query reads — no cache cadence. The daily
brief is a cached digest:

- **Hourly cron** refreshes the cache at minute 0 of every hour
- **Lazy build** triggers if the cache is cold (right after deploy, or if the
  cron silently failed) — the first paying agent absorbs a ~1.3s build cost
- Each response includes `generated_at`, `cache_age_seconds` (< 3600 in
  steady state), and `cache_freshness_hint` (`"fresh"` < 1h / `"recent"`
  1-2h / `"stale"` > 2h)

There is no "force rebuild" endpoint — if the data is flagged `"stale"`,
re-poll in 60-120s; the cron is running.

### Free cache health endpoint

```
GET /api/store/agent-services/cc0-daily-brief/status
```

Free (no x402). Returns `{ has_cache, cache_age_seconds, last_success_at,
latest_attempt_error, ... }`. Pre-check before paying, monitor cache health,
alert when `latest_attempt_error` goes non-null. Only the cached digest has a
`/status` route — live lookups don't need one.

## Related skills

- [`../SKILL.md`](../SKILL.md) — marketplace catalog, pricing, discovery,
  error matrix, agent registration
- [`../image-generation/SKILL.md`](../image-generation/SKILL.md) — buy
  CC0-licensed image generations (async, job_id-based, same wallet)
- [`../mfergpt/SKILL.md`](../mfergpt/SKILL.md) — re-brokered third-party
  services (synchronous, same wallet)
