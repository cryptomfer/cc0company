---
name: cc0company-store
version: 1.0.0
description: Buy from the cc0 Store (store.cc0.company) as an AI agent — framed prints of public-domain art (every card of The Memes by 6529 and more) and objects made by cc0, paid in USDC on Base, shipped to your human. The store is fully onchain — catalogue, prices, stock, payment — and every article mints a soulbound receipt NFT to the paying wallet. Pay with raw calldata (approve + checkout) or over x402.
homepage: https://store.cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
contract: "0xb8238CD0De22B9E45E38E59356BCA33875eC7225"
---
# The cc0 Store for AI agents

Base URL: `https://cc0.company`. Amounts are USDC with 6 decimals, written as
**base-unit strings** (`"61420000"` = 61.42 USDC). Never round-trip through a float.

The store is a contract on Base, `Cc0Store`
[`0xb8238CD0De22B9E45E38E59356BCA33875eC7225`](https://basescan.org/address/0xb8238CD0De22B9E45E38E59356BCA33875eC7225):
the catalogue, the fixed prices, the stock and the payments live there, the USDC
goes **straight to the store's treasury**, and each article you buy mints ONE
**soulbound ERC-721 receipt** (ERC-5192) to the paying wallet. Its image is drawn
onchain and its status follows the parcel: PAID → IN PRODUCTION → SHIPPED →
DELIVERED (or CANCELLED / REFUNDED). Your human's name, address and email never
go onchain — the order carries only a random commitment to them.

## The flow at a glance

```
1. GET  /api/store/shop/catalog?q=&category=prints        free — what is for sale
2. GET  /api/store/shop/products/{id}                     free — a product; for a print, the sizes its file carries
3. POST /api/store/shop/price                             free — what a cart costs, delivered (needs country_code for prints)
4. POST /api/store/shop/quote                             free — the order, priced and SIGNED for the contract
5a. raw calldata: USDC.approve(store, total) then store.checkout(quote, signature) — from `buyer`
    then POST /api/store/shop/orders/{id}/confirm { tx_hash }
5b. or x402: POST /api/store/shop/orders/{id}/x402 — pays exactly the total from `buyer`
6. GET  /api/store/shop/orders/{id}   header X-Shop-Token: <access_token>   — follow it
```

Nothing is charged before step 5. An unpaid quote expires after 30 minutes.

## 1. The catalogue

```bash
curl -s "https://cc0.company/api/store/shop/catalog?category=prints&q=gm&limit=10"
```

`products[]`: `id`, `slug`, `kind` (`print` | `physical`), `price_usdc` (`"0"` for a
print — a print is priced per size and destination), `shipping_usdc` (physical,
per unit), `stock` (`null` = unlimited), `art` (the artwork a print is made from:
`chain`, `contract`, `token_id`), `name`, `description`, `image`, `thumb_url`.
Sorts: `featured · newest · oldest · name · price_asc · price_desc · popular`.

## 2. A product — and a print's sizes

```bash
curl -s https://cc0.company/api/store/shop/products/65
```

For a print, `print.sizes[]` lists ONLY the sizes its file can carry sharply
(`sku`, `label`, `family_label`, `frames[]`, `frame_attribute`, `dpi`, `quality`);
`print.best_sku` is the largest at full quality. A size not listed is refused.

## 3. The price (free, nothing stored)

```bash
curl -s -X POST https://cc0.company/api/store/shop/price -H 'content-type: application/json' -d '{
  "lines": [{ "product_id": 64, "qty": 1, "sku": "GLOBAL-CFP-16X20", "attributes": { "color": "black" } }],
  "country_code": "FR",
  "shipping_method": "Standard"
}'
```

A print's price **includes its delivery** to that country (`shipping_method`:
`Budget` · `Standard` · `Express`); import duties are never included
(`duties_included: false`). Physical products add `shipping_usdc × qty`. A
`discount_code` may be passed.

## 4. The quote — the order, signed

```bash
curl -s -X POST https://cc0.company/api/store/shop/quote -H 'content-type: application/json' -d '{
  "buyer": "0xYOUR_PAYING_WALLET",
  "lines": [{ "product_id": 64, "qty": 1, "sku": "GLOBAL-CFP-16X20", "attributes": { "color": "black" } }],
  "recipient": { "name": "Ada Lovelace", "line1": "1 Rue de Rivoli", "city": "Paris", "postal_code": "75001", "country_code": "FR" },
  "email": "your-human@example.com",
  "shipping_method": "Standard"
}'
```

`buyer` is the wallet that pays AND receives the receipts. Answer (201):

- `order` — `id`, `status: awaiting_payment`, `lines[]`, `total_usdc`, …
- `access_token` — `cc0s_…`, opens this ONE order (header `X-Shop-Token`); also the
  human's link `https://store.cc0.company/orders/{id}?t={access_token}`.
- `payment.quote` + `payment.signature` — what `checkout` takes; `payment.deadline`.
- `calls.approve` / `calls.checkout` — ready raw calldata `{ to, data, value: "0" }`.

## 5a. Pay with raw calldata (any wallet, Bankr included)

Send, **from `buyer`**, on Base (8453):

1. `calls.approve` — `USDC.approve(store, total)` (skip if the allowance already covers it);
2. `calls.checkout` — `Cc0Store.checkout(quote, signature)`. The contract checks the
   signature, the deadline, the one-time nonce, the onchain prices and stock, pulls
   the USDC to the treasury and mints the receipts. Gas ≈ 250k + 60k per article.

Then:

```bash
curl -s -X POST https://cc0.company/api/store/shop/orders/$ID/confirm \
  -H 'content-type: application/json' -d '{"tx_hash":"0x…"}'
```

`202 { pending: true }` = not mined yet, ask again with the **same** hash. The
store also finds the payment on its own within a minute — never pay twice.

With Bankr: `POST https://api.bankr.bot/wallet/submit` with each `{ to, data, value }`
(see [`agentic-marketplace/x402-payments/`](../agentic-marketplace/x402-payments)).

## 5b. Pay over x402

```
POST https://cc0.company/api/store/shop/orders/{id}/x402
```

The 402 challenge asks for **exactly** the order's total in USDC on Base, `payTo` =
the store's owner (the treasury). Sign it with the wallet you named as `buyer` —
any other payer is refused before settlement (a 4xx cancels the payment, you are
not charged). Use the canonical envelope of
[`agentic-marketplace/x402-payments/`](../agentic-marketplace/x402-payments). Answer
`202 { status: "x402_settling", poll_url }`: once the USDC has settled, cc0 records
the order onchain and the receipts are minted to your wallet (about a minute).

## 6. Follow the order

```bash
curl -s https://cc0.company/api/store/shop/orders/$ID -H "X-Shop-Token: $TOKEN"
```

`order.status`: `awaiting_payment · x402_settling · paid · completed · expired`.
Per article (`lines[]`): `status` (`paid · in_production · shipped · delivered ·
cancelled · refunded`), `receipt_token_id`, `carrier`, `tracking_url`, `estimate`.
The receipt: `Cc0Store.tokenURI(receipt_token_id)` — a data URI, drawn onchain.

## Refunds

An article that cannot be made, or that cc0 cancels, becomes `cancelled` with its
price **due back**; the store's treasury sends it with the contract's
`refund(order, receipts, amount)` — capped at what the order paid — and the
receipts turn « REFUNDED ». Refunds are sent by hand by the store's owner, to the
wallet that paid. Questions: help@cc0.company with the order number.

## Errors

| Status | Meaning |
|---|---|
| 400 | a field is missing or invalid (the message says which) |
| 404 | no such product / order |
| 409 | off sale, out of stock, payer ≠ buyer, amount ≠ total, already paid |
| 410 | the quote expired — ask for a new one |
| 422 | a print size the file cannot carry, or a destination the lab does not ship to |
| 429 | slow down |
| 503 | the store cannot take orders right now |
