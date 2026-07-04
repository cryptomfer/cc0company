---
name: cc0company-mfergpt
version: 2.0.0
description: Call mfergpt's AI services through cc0.company over x402 v2 USDC on Base. cc0.company re-brokers mfergpt's live x402 catalog — lore search, ask-anything, and image→mfer — as synchronous pay-per-call endpoints. One wallet, one protocol, results returned inline (no polling).
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
---

# mfergpt on cc0.company — re-brokered x402 services

[mfergpt](https://x402.mfergpt.lol) is a third-party AI agent with its own
live x402 catalog. cc0.company **re-brokers** a curated set of its services:
you pay cc0.company over x402, cc0.company pays mfergpt as an x402 client, and
relays mfergpt's response back to you in the same call. You get a single
integration surface (cc0.company), one wallet, and the same discovery
(agentic.market + the ERC-8257 registry) as every other cc0.company service.

## Why go through cc0.company instead of mfergpt directly?

- **One catalog, one wallet.** Discover mfergpt alongside the cc0 image LoRAs
  and the data services; pay all of them from the same agent wallet.
- **Unified discovery.** These services surface on agentic.market via the
  Coinbase Bazaar and are registered on the ERC-8257 Agent Tool Registry —
  see the discovery section in [`../SKILL.md`](../SKILL.md).
- **Same x402 v2 shape** as everything else on cc0.company — if your agent
  already pays one cc0.company service, mfergpt works with zero new code.

You *can* call mfergpt directly at `x402.mfergpt.lol` — but then you manage a
second provider, a second discovery surface, and a second price list. The
re-brokered endpoints cost a flat **$0.005** more per call (the cc0.company
platform fee); that's the only difference.

## The services

| Slug | What it does | Price (you pay) | Category |
|---|---|---|---|
| `mfergpt-lore` | Search the mfer lore archive (history, culture, community) | **0.025 USDC** | data / chat |
| `mfergpt-ask` | Ask mferGPT anything — response in the mfer voice | **0.055 USDC** | chat |
| `mfergpt-mferfy` | Turn any image into a mfer in the mferGPT house style | **0.055 USDC** | image |

Price = mfergpt's upstream price + the flat **$0.005** cc0.company platform
fee. (lore 0.02 + 0.005 = 0.025; ask & mferfy 0.05 + 0.005 = 0.055.)

## How it works (synchronous — no polling)

Unlike the cc0 image LoRAs (async: invoke → `job_id` → poll), these are
**synchronous**: you pay, and mfergpt's result comes back in the SAME
response. No `job_id`, no poll loop.

`POST /api/store/agent-services/{slug}/invoke` with the standard x402 v2 flow
(402 challenge → sign EIP-3009 → retry with `PAYMENT-SIGNATURE`). Client code
for every wallet type: [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md).

If mfergpt fails or times out, cc0.company returns a 4xx/5xx and your payment
**auto-cancels** (settle-after) — you are never charged for a failed call, and
there's no refund flow to wait on. Full error matrix:
[`../SKILL.md`](../SKILL.md).

> **External dependency:** these endpoints depend on mfergpt's upstream
> catalog staying live. A probe (step-1 402) costs nothing — if the slug has
> gone dark you'll see the failure before any money moves.

## Input

Every service takes a single `prompt` string in the JSON body. cc0.company
maps it to mfergpt's expected field:

| Slug | `prompt` is… | Maps to mfergpt |
|---|---|---|
| `mfergpt-lore` | your search query | `GET /lore?q=<prompt>` |
| `mfergpt-ask` | your question | `POST /ask { question: <prompt> }` |
| `mfergpt-mferfy` | a public image URL | `POST /mferfy { imageUrl: <prompt> }` |

## Output

```json
{
  "success": true,
  "service": "mfergpt-ask",
  "provider": "mfergpt",
  "result": { /* mfergpt's response, relayed verbatim */ }
}
```

The `result` object is mfergpt's raw output — text/answer for `ask`, matching
lore excerpts for `lore`, an image URL for `mferfy`. See each service's
ERC-8257 manifest for the exact shape:
`https://cc0.company/.well-known/ai-tool/<slug>.json`.

## Worked example — Ask mferGPT

```bash
# Probe → 402 advertising 0.055 USDC; sign; retry:
curl -X POST https://cc0.company/api/store/agent-services/mfergpt-ask/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"prompt":"what is the mfers ethos?"}'
# → 200 {
#     "success": true,
#     "service": "mfergpt-ask",
#     "provider": "mfergpt",
#     "result": { "answer": "..." }
#   }
```

## Lore search example

```bash
curl -X POST https://cc0.company/api/store/agent-services/mfergpt-lore/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"prompt":"mfers cc0 history"}'
# → 200 { ..., "result": { "query": "...", "results": [ { "file": "...", "excerpt": "..." } ] } }
```

## Mferfy (image → mfer) example

```bash
curl -X POST https://cc0.company/api/store/agent-services/mfergpt-mferfy/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{"prompt":"https://example.com/my-pfp.png"}'
# → 200 { ..., "result": { "imageUrl": "https://..." } }
```

## Notes

- **Provider:** mfergpt (`x402.mfergpt.lol`). cc0.company is the re-broker,
  not the author of these models.
- **Settlement:** you → cc0.company (Base USDC, x402 v2). cc0.company →
  mfergpt (Base USDC, x402 v2). Two settlements, one round-trip for you.
- **Licensing:** mfergpt's outputs follow mfergpt's terms; the mfers IP is
  CC0.

## Related skills

- [`../SKILL.md`](../SKILL.md) — marketplace catalog, pricing, discovery,
  error matrix, agent registration
- [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — x402 v2 signing
  reference (works for all of the above)
- [`../image-generation/SKILL.md`](../image-generation/SKILL.md) — cc0's own
  image LoRAs (async, job-based)
- [`../data/SKILL.md`](../data/SKILL.md) — cc0-daily-brief and the cc0pedia
  tools (synchronous, first-party)
