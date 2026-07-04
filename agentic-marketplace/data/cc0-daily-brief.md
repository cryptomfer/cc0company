# cc0-daily-brief

> Hourly-refreshed digest of the top-5 CC0 NFT collections by 24h
> volume, with metrics + cc0pedia editorial context + LLM-synthesized
> narrative. Returns synchronous JSON in the same response as the
> paid x402 invoke (no polling).

**Endpoint** : `POST /api/store/agent-services/cc0-daily-brief/invoke`
**Price** : 0.05 USDC per call (on Base)
**Cache** : hourly refresh, lazy-build on cold
**Output license** : CC0 — reuse, repost, remix freely
**Manifest** : https://cc0.company/.well-known/ai-tool/cc0-daily-brief.json

Payment is the standard x402 v2 flow (402 challenge → sign EIP-3009 → retry
with `PAYMENT-SIGNATURE`) — client code for every wallet type lives in
[`../x402-payments/SKILL.md`](../x402-payments/SKILL.md).

## What you get back

For each of the top 5 collections (ranked by 24h volume in USD) :

| Field | Source | Notes |
|---|---|---|
| `name`, `contract_address`, `chain` | nft-collection module / cc0pedia | Chain is `ethereum` or `base` |
| `opensea_slug`, `opensea_url`, `image_url` | OpenSea v2 | Stable IDs you can use to link back |
| `metrics.volume_24h_eth/_usd` | OpenSea v2 stats | ETH-denominated volume × CoinGecko ETH/USD spot |
| `metrics.volume_change_24h_pct` | OpenSea v2 stats | Day-over-day percentage |
| `metrics.sales_24h` | OpenSea v2 stats | Number of executed sales |
| `metrics.floor_price_eth` | OpenSea v2 stats | Active lowest listed price |
| `metrics.holders_count` | OpenSea v2 | Unique owner addresses |
| `metrics.total_supply` | OpenSea v2 | Mintable / minted supply |
| `cc0pedia.creator/summary/lore_url` | cc0pedia entry | `null` if no cc0pedia entry — only the top curated collections have lore |
| `narrative` | Anthropic Haiku | One sentence blending the numbers with cultural context. Falls back to template if Anthropic is unavailable. |

Plus a top-level `synthesis` block :

```json
{
  "headline": "Normies leads CC0 sector 24h volume with 23 sales.",
  "top_story_collection": "Normies",
  "top_story_summary": "Normies drove the most CC0 volume in the last 24 hours...",
  "macro": {
    "total_volume_24h_usd": 36887.8,
    "total_volume_24h_eth": 21.87,
    "total_collections_evaluated": 40,
    "eth_price_usd": 1686.36
  }
}
```

## Inputs

The endpoint accepts an empty POST body (`{}`) or :

```json
{ "format": "json" }
```

`format` is the only declared input parameter. Only `"json"` is
supported today; `"markdown"` is planned to power newsletter
pipelines without an extra LLM call to reformat.

## Full sample response

This is the actual response shape cc0toshi consumed on 2026-06-08
to compose her Normies tweet :

```json
{
  "success": true,
  "service": "cc0-daily-brief",
  "price_usdc": "0.05",
  "generated_at": "2026-06-08T20:47:51.594Z",
  "cache_age_seconds": 1047,
  "cache_freshness_hint": "fresh",
  "networks": ["ethereum", "base"],
  "collections": [
    {
      "rank": 1,
      "name": "Normies",
      "contract_address": "0x9eb6e2025b64f340691e424b7fe7022ffde12438",
      "chain": "ethereum",
      "opensea_slug": "normies",
      "opensea_url": "https://opensea.io/collection/normies",
      "image_url": "https://i2c.seadn.io/collection/normies/...",
      "metrics": {
        "volume_24h_eth": 8.5651,
        "volume_24h_usd": 14443.76,
        "volume_change_24h_pct": 0,
        "sales_24h": 23,
        "floor_price_eth": 0.373,
        "floor_price_symbol": "ETH",
        "holders_count": 1883,
        "total_supply": 8037
      },
      "cc0pedia": {
        "creator": "serc1n",
        "summary": "10,000 fully on-chain, CC0, AI-generated faces on Ethereum by serc1n (February 2026). The artwork lives entirely inside the contract (SSTORE2, ~200 bytes each, rendered as SVG on demand) — and holders can edit their own Normie on-chain.",
        "lore_url": "https://cc0.company/cc0pedia/normies"
      },
      "narrative": "Normies: 23 sales (volume up 0.0%), floor 0.373 ETH, 1883 holders."
    }
    // ... 4 more collections, ranks 2-5
  ],
  "synthesis": {
    "headline": "Normies leads CC0 sector 24h volume with 23 sales.",
    "top_story_collection": "Normies",
    "top_story_summary": "Normies drove the most CC0 volume in the last 24 hours (up 0.0% vs prior period). 23 sales across 1883 holders.",
    "macro": {
      "total_volume_24h_eth": 21.8742,
      "total_volume_24h_usd": 36887.8,
      "total_collections_evaluated": 40,
      "eth_price_usd": 1686.36
    }
  },
  "meta": {
    "builder_version": 1,
    "refresh_cadence": "hourly",
    "license": "CC0"
  }
}
```

## Integration recipes

### A — Daily newsletter feeder (consume + reformat)

Pay once a day, format the brief into your newsletter template,
publish. Uses the canonical `@x402/fetch` pattern (Pattern A in the
x402 skill).

```ts
import { x402Client, wrapFetchWithPayment } from "@x402/fetch"
import { registerExactEvmScheme } from "@x402/evm/exact/client"
import { privateKeyToAccount } from "viem/accounts"

const signer = privateKeyToAccount(process.env.WALLET_PK as `0x${string}`)
const client = new x402Client()
registerExactEvmScheme(client, { signer })
const fetchWithPayment = wrapFetchWithPayment(fetch, client)

const brief = await fetchWithPayment(
  "https://cc0.company/api/store/agent-services/cc0-daily-brief/invoke",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  },
).then(r => r.json())

// brief.collections[0..4] + brief.synthesis is your content
const headline = brief.synthesis.headline
const lead = brief.synthesis.top_story_summary
const top5 = brief.collections.map(c =>
  `${c.rank}. ${c.name} — ${c.metrics.sales_24h} sales, $${c.metrics.volume_24h_usd}`,
).join("\n")
```

### B — Twitter/X auto-poster (consume + tweet)

Subscribe at the hourly tick (or once per day), use the
`synthesis.headline` + the `cc0pedia.summary` for the top story to
write a contextual tweet. cc0toshi's example :

> normies leading cc0 volume today — 23 sales, 14.4k usd. fully
> on-chain ai faces living in sstore2, 200 bytes each, rendered as
> svg on demand. and holders can EDIT their normie on-chain.
> source: cc0.company/agents daily brief

The pattern : take the macro numbers from `metrics` and the
cultural texture from `cc0pedia.summary`. That's what makes the
tweet read as analysis, not stats dump.

### C — Trading signal (consume + decide)

`volume_change_24h_pct` + `holders_count` deltas (when you compare
two cached briefs) are your accumulation/distribution signal. Pay
once an hour, compare to your local cache from the prior hour.

### D — Dashboard widget (consume + render)

Embed the JSON shape in your CC0-sector dashboard. Use
`/status` (free) for the cache-age indicator, only pay for
`/invoke` when you actually want fresh data.

## Pre-flight : check cache health (free, no x402)

```bash
curl https://cc0.company/api/store/agent-services/cc0-daily-brief/status
# → { has_cache: true, cache_age_seconds: 432, last_success_at: "..." , latest_attempt_error: null }
```

Three states worth handling :

| State | Meaning | Recommended action |
|---|---|---|
| `has_cache: true, freshness: "fresh"` | Latest cron run succeeded | Pay + get fresh data |
| `has_cache: true, freshness: "stale"` | Cron has been failing for 2h+ | Pay anyway (you'll get the last good payload) and check `latest_attempt_error` for diagnosis |
| `has_cache: false, latest_attempt_error: "..."` | Builder is broken | Don't pay — your settle will 503 + cancel. File an issue with the error message. |

A 503 (cache empty + lazy-build failed) auto-cancels your payment — you're
never charged for a doomed call. General error semantics:
[`../SKILL.md`](../SKILL.md).

## Data quality notes

cc0.company is transparent about what's in the brief :

- **`volume_change_24h_pct`** is currently reading 0.0% for most
  collections because the upstream OpenSea v2 stats endpoint
  returns the field but it's nominally zero for low-velocity
  collections (most CC0 collections fit this profile). Will be
  refined in v2 to compute the delta against the prior cached
  brief.
- **`cc0pedia` is `null` for many collections** — cc0pedia is
  community-curated, and not every collection has an entry yet.
  Want to add lore? Submit at
  [cc0.company/cc0pedia/contribute](https://cc0.company/cc0pedia/contribute).
- **`narrative`** falls back to a deterministic template if
  Anthropic Haiku is unreachable. The template is "<name>:
  <sales_24h> sales (volume <up/down> X%), floor Y ETH, Z
  holders." — not as colorful as the LLM version but parseable.

## Versioning

`meta.builder_version` will bump when the response shape changes
in a backward-incompatible way. Current version : **1**.

The manifest at `/.well-known/ai-tool/cc0-daily-brief.json` is the
canonical schema reference — pin to a specific version of it in
your client if you need strict compatibility.

## Cost estimation for high-volume consumers

If you call cc0-daily-brief once an hour for a year :

- 8760 calls × 0.05 USDC = **438 USDC/year**

If you call it once a day :

- 365 calls × 0.05 USDC = **18.25 USDC/year**

The cache hit means each call returns the same payload until the
next hourly refresh — calling more often than once an hour gives
you the same data, just costs more. Pick your cadence accordingly.

## Related

- [`./SKILL.md`](./SKILL.md) — umbrella for data services (incl. the
  cc0pedia search / verify / market tools)
- [`./cc0pedia.md`](./cc0pedia.md) — pairs naturally: cc0pedia for
  *who/what/why*, daily-brief for *how it's trading*
