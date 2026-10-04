---
name: cc0company-print-on-demand
version: 1.0.0
description: Print on demand for AI agents, listed by cc0toshi — order a framed print, a stretched canvas or a metal print of ANY image for your human, made to order and shipped worldwide with tracking. 1 USDC per order over x402 (the service fee), then the print itself paid by a USDC transfer on Base. Catalogue, image check, prices with delivery estimates, live tracking, signed webhooks, cancellation, full refunds and claims — everything a human buyer gets.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
slug: cc0-print
---
# Print on demand for AI agents — `cc0-print`

Base URL: `https://cc0.company`. Every price is in USDC with 6 decimals, written
in **base units as strings** (`"61420000"` = 61.42 USDC). Never convert through
a float.

## The flow at a glance

```
1. GET  /api/store/prints/catalog                 free — what we make
2. POST /api/store/prints/custom/check            free — what YOUR image can carry
3. POST /api/store/prints/shipping-options        free — price + delivery estimate per method
4. POST /api/store/agent-services/cc0-print/invoke   x402, $1 — place the order
5. USDC transfer on Base (raw calldata)           the print's price, from step 4
6. POST /api/store/prints/orders/{id}/pay         { tx_hash } — we verify on-chain, send to the lab
7. GET  /api/store/prints/orders/{id}             follow it (or wait for your webhook)
```

Two payments, on purpose: the **$1 service fee** pays for this call (we download
your image, render a print-ready file at the lab's exact pixel target, stage it,
price it). The **print** is a separate USDC transfer: x402 settles after the
server has answered and never tells the server whether it worked, which is fine
for $1 and not for a physical object — so the print is verified on-chain before
anything is made.

**You are never charged for a refusal.** Any 4xx/5xx from step 4 (bad image,
unknown size, an address the lab cannot reach) cancels the $1.

## 1. The catalogue

```bash
curl -s https://cc0.company/api/store/prints/catalog
```

`products[]`: `sku`, `label` (`16 x 16"`, `A3`…), `family`
(`classic` · `classic_mounted` · `box` · `budget` · `canvas` · `metal`),
`inches_w/h`, `cm_w/h`, `option` + `option_values` (the one choice, usually the
frame colour), `attributes` (everything the product accepts — omit one and it
takes the first value), `target_px`, `ships_to` (empty = the quote decides).

`classic_mounted` (`GLOBAL-CFPM-…`) is the frame with a card mat around the
picture; `classic` (`GLOBAL-CFP-…`) has none.

## 2. Check your image

```bash
curl -s -X POST https://cc0.company/api/store/prints/custom/check \
  -H 'content-type: application/json' \
  -d '{ "image_url": "https://example.com/my-image.png" }'
```

`image_url`: a public `https://` URL, an `ipfs://` URI, or a small
`data:image/...` URI. PNG, JPEG, WebP, AVIF, TIFF, SVG; a GIF prints its first
frame. Up to 150 MB. Never a private or local address.

The answer lists every size the file can carry at our quality floor, closest
proportions first: `{ sku, label, family, dpi, quality, image_inches_w/h }`.
`quality` is `excellent` (≥ 300 dpi), `very_good` (≥ 220) or `good` (≥ 150);
below 150 dpi a size is simply not offered. `largest_at_excellent` is the
biggest size at full quality.

The whole image is always fitted inside the print area — **never cropped**. When
the proportions differ, the extra space is plain white paper (or the mat, on a
mounted frame). A square image looks best in a square size.

Pixel art: send `"pixel_art": true` here and at order time — the image is then
enlarged with hard square pixels instead of being smoothed.

## 3. Price a destination

```bash
curl -s -X POST https://cc0.company/api/store/prints/shipping-options \
  -H 'content-type: application/json' \
  -d '{ "sku": "GLOBAL-CFPM-16X16", "country_code": "US", "attributes": { "color": "black" } }'
```

One entry per delivery method the lab really offers for that size to that
country (they differ by country — never hardcode them): `method`, `price_usd`
(base units, everything included but duties), `display_price`, `carrier`,
`service`, `made_in`, and `estimate` — `{ total_days: [min, max], earliest,
latest, customs }`, business days, weekends skipped. **Present the estimate as
an estimate, never a promise.**

Import duties and local taxes, where the destination charges them, are NOT
included and are collected by the carrier. Say so to your human.

## 4. Place the order — x402, $1 USDC

```
POST https://cc0.company/api/store/agent-services/cc0-print/invoke
```

```json
{
  "image_url": "https://example.com/my-image.png",
  "title": "Sunset for Mom",
  "sku": "GLOBAL-CFPM-16X16",
  "attributes": { "color": "black" },
  "copies": 1,
  "shipping_method": "Standard",
  "recipient": {
    "name": "Jane Doe", "line1": "1 Main St", "line2": "Apt 4",
    "city": "Austin", "postal_code": "78701", "state_or_county": "TX", "country_code": "US"
  },
  "email": "jane@example.com",
  "rights_attestation": true,
  "callback_url": "https://my-agent.example/hooks/cc0-print",
  "agent_reference": "gift-2026-10-mom",
  "honour_price_usd": "61420000"
}
```

| Field | |
|---|---|
| `image_url` | required — as in step 2 |
| `sku` | required — from the catalogue / the check |
| `recipient` | required — `country_code` is ISO 3166-1 alpha-2 |
| `email` | required — **your human's** email: receipt, every step, the tracking link and delivery go there |
| `rights_attestation` | required, `true` — you have the right to reproduce this image (you made it, it is public domain, or you hold a licence). It is recorded on the order with your wallet. |
| `attributes`, `copies` (1–25), `shipping_method` | optional — defaults: the product's first option, 1, `Budget` |
| `callback_url` | optional — https webhook, see § 7 |
| `agent_reference` | optional — your own id, echoed everywhere |
| `title` | optional — shown on the order and in the emails |
| `honour_price_usd` | optional — the `price_usd` you got in step 3. If the live price moved up by ≤ 2 % (or ≤ $1), we charge yours. |
| `pixel_art` | optional — hard-edged enlargement |

### Paying the $1

The standard x402 v2 flow — client code for every wallet (viem / CDP one-liner,
Bankr HTTP-only, CDP SDK) lives in exactly one place:
[`../x402-payments/SKILL.md`](../x402-payments/SKILL.md). What is specific here:

- the first POST answers `402` with an **empty body**; the requirements are in
  the `PAYMENT-REQUIRED` header (base64 JSON) — `accepts[0].amount` is
  `"1000000"` (1 USDC), `maxTimeoutSeconds` is `300` (the server downloads
  and renders your image before it answers, so sign `validBefore` = now + 300);
- send the SAME JSON body on the paid retry — the order is built from it;
- `X-Agent-Name: your_handle` on your first paid call names the agent profile
  created for your wallet (see [`../SKILL.md`](../SKILL.md#agent-registration--username-claiming));
- a fresh random nonce for every attempt.

### What comes back — `201`

```json
{
  "success": true,
  "service": "cc0-print",
  "order": {
    "id": "porder_1a2b3c4d5e6f", "reference": "cc0-print-1a2b3c4d5e6f",
    "status": "awaiting_payment",
    "status_detail": "Waiting for payment: transfer exactly 61.42 USDC on Base …",
    "product": { "sku": "GLOBAL-CFPM-16X16", "size_label": "16 x 16\"", "attributes": { "color": "black" } },
    "price": { "price_usd": "61420000", "display_price": "61.42" },
    "timeline": [ { "step": "placed", "label": "Order placed", "at": "…", "done": true }, … ],
    "delivery_estimate": { "total_days": [5, 12], "earliest": "2026-10-12", "latest": "2026-10-21" }
  },
  "access_token": "cc0p_…",
  "payment": { "amount_usdc": "61420000", "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
               "chain": "base", "chain_id": 8453, "decimals": 6, "pay_to": "0x…",
               "pay_url": "https://cc0.company/api/store/prints/orders/porder_…/pay" },
  "tracking": { "header": "X-Print-Token", "api_url": "…", "page_url": "https://cc0.company/prints/track/cc0p_…", "claims_url": "…" },
  "callback": { "url": "…", "secret": "whsec_…", "signature_header": "X-Cc0-Signature", "events": [ … ] },
  "file": { "source_px_w": 4800, "source_px_h": 4800, "dpi": 300, "quality": "excellent", "print_file_url": "…" },
  "support": { "email": "help@cc0.company", "reference": "cc0-print-…", "response_time": "Within two business days." },
  "next_steps": [ … ],
  "agent": { "name": "…", "api_key": "… only on your first call", "was_new": true }
}
```

**Keep `access_token`.** It is the credential for THIS order (track, pay,
cancel, claim) and the link your human gets. It is shown in full only here and
inside `order.tracking.page_url` on every `GET`. Store `callback.secret` too — it is only shown here.

Retried the same order (same image, size, options, method, address)? If your
earlier $1 settled, you get **409 `ORDER_EXISTS`** with the same order and
nothing is charged. If it never settled, the same order is served and the $1 is
charged once.

## 5. Pay the print — a plain USDC transfer

Transfer **exactly** `payment.amount_usdc` of USDC (`0x8335…2913`) on Base to
`payment.pay_to`. Raw calldata, from any wallet:

```
to:   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
data: 0xa9059cbb + pad32(pay_to) + pad32(amount_usdc)        // transfer(address,uint256)
value: 0
```

With Bankr — `POST https://api.bankr.bot/wallet/submit` (header `X-API-Key`),
**decimal strings** for `value` and `gas`, never a natural-language prompt:

```json
{ "transaction": { "to": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "data": "0xa9059cbb…",
                   "value": "0", "gas": "80000", "type": 2, "chainId": 8453 },
  "waitForConfirmation": true }
```

A `403` from Bankr is its own config, not ours: "Disable arbitrary contract
calls" must be OFF, the key must not be `readOnly`, and `allowedRecipients`
must be empty (Bankr cannot read a recipient out of calldata).

The wallet that sends this transfer is where a refund goes.

## 6. Confirm the payment

```bash
curl -s -X POST https://cc0.company/api/store/prints/orders/porder_…/pay \
  -H 'content-type: application/json' -H 'X-Print-Token: cc0p_…' \
  -d '{ "tx_hash": "0x…" }'
```

- `200` — paid, handed to the lab (`order.status` `submitted`), or paid and
  waiting for the lab (`note` says so — you are refunded in full if it never
  takes it).
- `202` + `retryable: true` — the transfer is not visible yet. **Retry with the
  SAME hash.** Never send a second transfer.
- `402 SERVICE_FEE_UNPAID` — the $1 of step 4 never settled. Call step 4 again
  with the same details (same order, $1 charged then), then pay.
- `400` — the transfer is wrong (amount, recipient, token, too old); the message
  says which.
- `409` — that hash already paid another order.

## 7. Follow it

```bash
curl -s https://cc0.company/api/store/prints/orders/porder_… -H 'X-Print-Token: cc0p_…'
```

`status`: `awaiting_payment` → `paid` → `submitted` (with the lab) →
`in_production` (being printed and framed) → `shipped` → `delivered`; or
`cancelled` / `refunded`. `status_detail` is one sentence you can repeat to
your human word for word. Also: `timeline[]` with the time of every step,
`tracking_url` + `carrier` once shipped, `delivery_estimate`,
`payment_tx_hash`, `refund_tx_hash`, `service_fee`, `claims[]`, `support`.

Poll at most every few minutes — a print takes days. Better: give a
`callback_url`. We POST the **whole order** (same shape as the GET) on
`print_order.paid · submitted · in_production · shipped · delivered · refunded ·
cancelled · claim_opened · claim_updated`:

```json
{ "event": "print_order.shipped", "sent_at": "…", "agent_reference": "…", "order": { … } }
```

Verify `X-Cc0-Signature: t=<unix>,v1=<hex>`:
`v1 == hex(HMAC_SHA256(secret, "<t>.<raw body>"))`, and reject a `t` older than
a few minutes. Retries: now, +20 s, +2 min on a network error, 429 or 5xx; a
4xx from you stops them. The callback URL must be public https.

Your human's page — the same order, readable without an account, with a
« Report a problem » form: `tracking.page_url`. Every email we send them links
there, and says the order was placed for them by an AI agent.

## 8. Cancel

```bash
curl -s -X DELETE https://cc0.company/api/store/prints/orders/porder_… -H 'X-Print-Token: cc0p_…'
```

Allowed while the order is `awaiting_payment`, `paid` or `submitted`. A paid
order is refunded **in full — the print's price and the $1 fee**, to the wallet
that paid. Once `in_production`, the frame physically exists and it can no
longer be cancelled (409).

Refunds: whenever we cannot get an order made (the lab refuses the file, the
lab cancels, we cannot place it within 72 hours), the full amount goes back
automatically — print price and $1 fee — and `refund_tx_hash` is on the order.

## 9. When something is wrong — claims

```bash
curl -s -X POST https://cc0.company/api/store/prints/orders/porder_…/claims \
  -H 'content-type: application/json' -H 'X-Print-Token: cc0p_…' \
  -d '{
    "reason": "damaged",
    "description": "The glass arrived cracked and the corner of the frame is dented.",
    "photo_urls": ["https://…/print.jpg", "https://…/label.jpg"],
    "contact_email": "jane@example.com"
  }'
```

`reason`: `damaged` · `lost` · `wrong_item` · `quality` · `late` · `other`.
`description` 10–2000 characters. Up to 4 public https photo URLs — for damage,
a photo of the print and one of the parcel's label. `contact_email` defaults to
the order's email.

A person reads every claim and answers within two business days, by email to
your human and on the order (`claims[].status`, `outcome`, `resolution`), with
the `print_order.claim_updated` webhook. Outcomes: `replacement`, `refund`,
`partial_refund`, `no_action`, `info_needed` (then answer by filing another
claim or replying to the email). `GET …/claims` lists them.

Have these ready when your human has a problem: the order `reference`, the
`status`, `tracking_url` + `carrier`, `delivery_estimate`, `payment_tx_hash`,
and the `support.email` (`help@cc0.company`).

## Endpoints

| Endpoint | Method | Auth | |
|---|---|---|---|
| `/api/store/prints/catalog` | GET | public | every product |
| `/api/store/prints/custom/check` | POST | public | sizes your image can carry |
| `/api/store/prints/shipping-options` | POST | public | price + estimate per method |
| `/api/store/agent-services/cc0-print/invoke` | POST | x402 $1 | place the order |
| `/api/store/prints/orders/{id}/pay` | POST | token | confirm the USDC transfer |
| `/api/store/prints/orders/{id}` | GET | token | the order |
| `/api/store/prints/orders/{id}` | DELETE | token | cancel (refund if paid) |
| `/api/store/prints/orders/{id}/claims` | GET · POST | token | problems + answers |
| `/api/store/prints/orders` | GET | agent signature | all your orders |

**token** = `X-Print-Token: <access_token>`. Your agent wallet's signature
(`X-Owner-Address` / `X-Owner-Signature` / `X-Owner-Message` over
`cc0.company:agent-auth:{unix_ms}`) works on every row too — your agent account
is created on your first paid call, from the wallet that paid.

## Rules

- Only images you have the right to reproduce. We may refuse an order and
  refund it in full.
- One order = one design, one size, 1–25 copies, one address.
- The $1 fee is kept if you never pay for the print — it paid for preparing the
  file. It is refunded whenever the print itself is refunded.
- Prices are what the lab charges for making and delivering it, plus our
  margin, in USD; duties are never included.

## Related

- [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — paying the $1 (viem / Bankr / CDP)
- [`../SKILL.md`](../SKILL.md) — the marketplace catalog, discovery, error matrix, agent registration
- [`../../artworks/SKILL.md`](../../artworks/SKILL.md) — buying the artworks themselves; framed prints of an indexed
  artwork are ordered on the website (skill.md § Order a print)

## License

CC0.
