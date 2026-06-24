# cc0pedia — the agentic read API over the largest CC0 database

`cc0pedia` is the open, structured, machine-readable encyclopedia of the
public domain: **1,100+ entries** covering CC0 creators, collections, and
works. This service is the **pay-per-lookup x402 endpoint** over that
database — for any CC0 token or NFT collection, an agent can pull the
provenance, the creator, the license, and the on-chain pointers in a
single synchronous call, then pay only for what it uses.

> cc0 is the IP layer of the agentic economy. cc0pedia is its index.

| | |
|---|---|
| **Slug** | `cc0pedia` |
| **Price** | **0.01 USDC** per lookup (x402 v2, Base) |
| **Endpoint** | `POST https://cc0.company/api/store/agent-services/cc0pedia/invoke` |
| **Shape** | Synchronous — entry returned in the same 200 response (no polling) |
| **Manifest** | https://cc0.company/.well-known/ai-tool/cc0pedia.json |
| **Output license** | CC0 |

## Input

```json
{ "query": "sartoshi" }
```

`query` — a name or slug of the CC0 creator, collection, or work to look
up. Aliases accepted: `q`, `slug`, `name`, `artist`, `entry`.

**Resolution order:** exact slug → exact id → fuzzy title (`$ilike`,
case-insensitive, so `xcopy` finds `XCOPY`). Only `published` entries are
visible.

**Pay only for hits.** A query that matches nothing returns `404` and the
x402 payment **auto-cancels** — you are never charged for a miss. A
malformed call (missing `query`) returns `400`, also no charge.

## Output (200)

```json
{
  "success": true,
  "service": "cc0pedia",
  "price_usdc": "0.01",
  "query": "sartoshi",
  "matched_by": "slug",
  "entry": {
    "id": "01KVXK6AQP7YCGRGA3WPQABQT3",
    "kind": "artist",
    "slug": "sartoshi",
    "title": "sartoshi",
    "excerpt": "Pseudonymous creator of mfers — 10,000 hand-drawn CC0 PFPs…",
    "quality": "featured",
    "canonical_url": "https://cc0.company/cc0pedia/sartoshi",
    "profile_image": "https://…/sartoshi.png",
    "cover_image": null,
    "creator_slug": null,
    "content_license": "CC0-1.0",
    "links": { "twitter": "sartoshi_rip" },
    "collections": [
      {
        "name": "mfers",
        "contract_address": "0x79fcdef22feed20eddacbb2587640e45491b757f",
        "chain": "ethereum",
        "opensea_url": "https://opensea.io/collection/mfers",
        "year": "2021"
      }
    ],
    "tags": ["mfers", "cc0", "pfp", "ethereum"],
    "body": "## About\nsartoshi is the pseudonymous artist who created mfers…",
    "metadata": { "...": "full raw metadata blob, untouched" }
  },
  "creator": null,
  "related_works": [
    { "slug": "mfers", "title": "mfers", "url": "https://cc0.company/cc0pedia/mfers" }
  ],
  "meta": {
    "database": "cc0pedia",
    "content_license": "CC0-1.0",
    "canonical_url": "https://cc0.company/cc0pedia/sartoshi"
  }
}
```

### Field notes

- **`kind`** — `artist` | `work` | `movement`. Drives enrichment:
  - For a `work`, `creator` resolves to the artist entry (slug, title, url).
  - For an `artist`, `related_works` lists their published works.
- **`collections[]`** — on-chain pointers (contract address, chain,
  OpenSea URL). Follow these to pull **live market data** yourself, or
  call the [`cc0-daily-brief`](./cc0-daily-brief.md) service for the
  top-of-sector digest.
- **`content_license`** — always `CC0-1.0`: the wiki text is public
  domain. Reuse, repost, train on, remix without attribution.
- **`body`** — the full CC0 wiki body (markdown) with the provenance /
  history / lore.
- **`metadata`** — the raw blob, shipped untouched for forward-compat as
  the per-kind schema evolves.

## Quick start

```bash
# 1. Probe → 402 challenge advertising 0.01 USDC
curl -i -X POST https://cc0.company/api/store/agent-services/cc0pedia/invoke \
  -H "Content-Type: application/json" -d '{"query":"mfers"}'

# 2. Sign the EIP-3009 USDC authorization to the payTo from the header
#    (any viem-compatible wallet — see ../x402-payments/SKILL.md)

# 3. Retry with the signature → 200 with the resolved entry
curl -X POST https://cc0.company/api/store/agent-services/cc0pedia/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"query":"mfers"}'
```

## Recipes

**Verify provenance + license before acting on a CC0 token.**
An agent about to remix / repost / build on a collection looks it up
first: `{ "query": "mfers" }` → confirm `content_license`, read the
`collections[].contract_address` to make sure it's the canonical
contract, skim the `body` for provenance. One call, $0.01.

**Enrich a wallet/collection feed with creator + lore.**
You have a contract address and want human-readable context. Query by
the collection's common name → get the `creator` (or `creator_slug`),
the `canonical_url` to link out, and the `excerpt` for a caption.

**Crawl an artist's catalog.**
Query an artist (`{ "query": "darkfarms1" }`) → `related_works[]` gives
you every published work's slug; resolve each with another lookup if you
need the full record.

## Related

- [`./cc0-daily-brief.md`](./cc0-daily-brief.md) — live market data for
  the top CC0 collections (pairs naturally: cc0pedia for *who/what/why*,
  daily-brief for *how it's trading*).
- [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — x402 v2
  client reference. Read first if you've never signed an EIP-3009 USDC
  authorization.

Browse the database in a human UI: https://cc0.company/cc0pedia
