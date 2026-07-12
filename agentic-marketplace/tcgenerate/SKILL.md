---
name: cc0company-tcgenerate
version: 1.0.0
description: Generate AI trading-card images through cc0.company over x402 v2 USDC on Base. cc0.company re-brokers TCGenerate's live x402 card generator as a synchronous, pay-per-call endpoint — pay once, get a collectible card back inline, pinned to IPFS. One wallet, one protocol, no polling.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
---

# TCGenerate on cc0.company — re-brokered x402 card generation

[TCGenerate](https://tcgenerate.com) is a third-party service that mints
AI-generated trading-card images and sells them over x402. cc0.company
**re-brokers** it: you pay cc0.company over x402, cc0.company pays TCGenerate as
an x402 client, pins the returned card to IPFS, and relays it back to you in the
same call. One integration surface, one wallet, the same discovery
(agentic.market + the ERC-8257 registry) as every other cc0.company service.

## Why go through cc0.company instead of TCGenerate directly?

- **One catalog, one wallet.** Discover the card generator alongside the cc0
  image LoRAs, the data services, and mfergpt; pay all of them from the same
  agent wallet.
- **Permanent output.** cc0.company pins the card to **IPFS** and returns a
  gateway URL — the raw TCGenerate response is a transient binary image. Your
  card also lands in the public runs gallery.
- **Same x402 v2 shape** as everything else on cc0.company — if your agent
  already pays one cc0.company service, this works with zero new code.

You *can* call TCGenerate directly at `tcgenerate.com` — but then you manage a
second provider, a second discovery surface, handle the binary image + IPFS
yourself, and get no gallery attribution. The re-brokered endpoint costs a flat
**$0.005** more per call (the cc0.company platform fee); that's the difference.

## The service

| Slug | What it does | Price (you pay) | Category | Input |
|---|---|---|---|---|
| `tcgenerate-random` | Generate a fully autofilled random collectible card (name, subject, action, background, art style) | **1.005 USDC** | image | none |

Price = TCGenerate's upstream price + the flat **$0.005** cc0.company platform
fee (1.00 + 0.005 = 1.005). Never hard-code it — read `maxAmountRequired` from
the live 402 challenge.

> **Heads-up on cost.** This is a **dollar-scale** call, not a cents-scale one
> like mfergpt or the LoRAs. Budget accordingly.

## How it works (synchronous — no polling)

Like mfergpt (and unlike the cc0 image LoRAs), this is **synchronous**: you
pay, and the finished card comes back in the SAME response. No `job_id`, no
poll loop.

`POST /api/store/agent-services/tcgenerate-random/invoke` with the standard
x402 v2 flow (402 challenge → sign EIP-3009 → retry with `PAYMENT-SIGNATURE`).
Client code for every wallet type:
[`../x402-payments/SKILL.md`](../x402-payments/SKILL.md).

If TCGenerate fails or times out, cc0.company returns a 4xx/5xx and your payment
**auto-cancels** (settle-after) — you are never charged for a failed call.
Full error matrix: [`../SKILL.md`](../SKILL.md).

> **External dependency:** this endpoint depends on TCGenerate's upstream
> service staying live. A probe (step-1 402) costs nothing — if it has gone
> dark you'll see the failure before any money moves.

## Input

`tcgenerate-random` takes **no input** — the card is fully autofilled by
TCGenerate. Send an empty JSON body:

```json
{}
```

A `prompt`, if present, is ignored. (Custom briefs — name / subject / action /
art style — are not exposed yet; this MVP is the random generator only.)

## Output

```json
{
  "success": true,
  "service": "tcgenerate-random",
  "result": {
    "image": "https://<gateway>/ipfs/<cid>",
    "imageUrl": "https://<gateway>/ipfs/<cid>",
    "card": {
      "name": "…",
      "subject": "…",
      "action": "…",
      "background": "…",
      "model": "…",
      "generation_id": "…"
    }
  }
}
```

- `result.image` / `result.imageUrl` — the **IPFS gateway URL** of the pinned
  card. Permanent; safe to store and display.
- `result.card` — the generation metadata TCGenerate returns in its `x-tcg-*`
  response headers, normalized to snake_case.
- If IPFS pinning ever fails, cc0.company falls back to relaying the image as a
  `data:image/...;base64,...` URI in `result.image` (with `"ipfs": false`) so a
  paid card is never dropped.

The card also appears in the model's public runs gallery:
`GET /api/store/agent-services/tcgenerate-random/runs?limit=24`.

## Worked example

```bash
# Probe → 402 advertising 1.005 USDC; sign; retry:
curl -X POST https://cc0.company/api/store/agent-services/tcgenerate-random/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -d '{}'
# → 200 {
#     "success": true,
#     "service": "tcgenerate-random",
#     "result": {
#       "image": "https://<gateway>/ipfs/<cid>",
#       "card": { "name": "...", "subject": "...", "model": "..." }
#     }
#   }
```

## Notes

- **Provider:** TCGenerate (`tcgenerate.com`). cc0.company is the re-broker,
  not the author of the model.
- **Settlement:** you → cc0.company (Base USDC, x402 v2). cc0.company →
  TCGenerate (Base USDC, x402 v2). Two settlements, one round-trip for you.
- **Binary under the hood:** TCGenerate returns a raw JPEG with card metadata
  in `x-tcg-*` headers; cc0.company handles the binary + IPFS so you just get a
  clean JSON result with a URL.

## Related skills

- [`../SKILL.md`](../SKILL.md) — marketplace catalog, pricing, discovery,
  error matrix, agent registration
- [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — x402 v2 signing
  reference (works for all of the above)
- [`../mfergpt/SKILL.md`](../mfergpt/SKILL.md) — the other re-brokered
  third-party services (lore / ask / mferfy)
- [`../image-generation/SKILL.md`](../image-generation/SKILL.md) — cc0's own
  image LoRAs (async, job-based)
