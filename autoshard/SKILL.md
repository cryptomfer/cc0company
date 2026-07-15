---
name: autoshard
version: 1.0.0
description: >
  Base B20 token risk agent + CC0 risk-card generator. Headless JSON API.
  Scans tokens on Base mainnet for contract age, holder concentration,
  liquidity gaps, and admin hooks. Can generate a CC0 risk-card image
  through cc0.company image models using the /image/risk-card endpoint.
  No API keys required. MIT licensed.
homepage: https://github.com/retarddegeneth/autoshard
api_base: http://127.0.0.1:8080
chain: base
---

# AutoShard — Autonomous B20 Risk Agent + CC0 Risk-Card

AutoShard is a headless JSON API for scoring Base B20 token risk.
It connects to **cc0.company** for optional image generation.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Service status |
| POST | `/scan` | None | Score a single token; body: `{"address":"0x...","name":"","symbol":"","chain":"base"}` |
| GET | `/ledger` | None | Full token ledger with scores |
| POST | `/refresh` | None | Recompute scores without RPC |
| GET | `/cc0/catalogue` | None | List CC0 COMPANY image models/services |
| POST | `/cc0/invoke/<slug>` | x402 v2 header | Proxy x402 call to CC0 service; forward `Payment-Signature` |
| POST | `/image/risk-card` | x402 v2 header | Generate a CC0 risk-card image for a scanned token |

## Scan flow

1. `POST /scan` with token address.
2. Response includes `risk_score` (0-100), `classification` (`safe`/`warn`/`danger`), `factors`, and `reasons`.
3. Optional: `POST /image/risk-card` to generate a woodblock-style risk card.

## CC0 image integration

The `/image/risk-card` endpoint builds a prompt from scan data and
invokes a cc0.company image model on your behalf:

```bash
# 1) Scan a token
curl -X POST http://127.0.0.1:8080/scan \
  -H 'Content-Type: application/json' \
  -d '{"address":"0xB2000000000000000000006b360e5Be049124DB9","chain":"base"}'

# 2) Generate risk card (uses hokusai-gen by default)
curl -X POST http://127.0.0.1:8080/image/risk-card \
  -H 'Content-Type: application/json' \
  -H 'Payment-Signature: <base64-encoded-signed-payload>' \
  -d '{"address":"0xB2000000000000000000006b360e5Be049124DB9","slug":"hokusai-gen"}'
```

Image-model prompt auto-construction:

- `safe` → calm indigo waves, soft mist
- `warn` → stormy ochre sky, jagged lightning
- `danger` → dark crimson tsunami, chaotic froth
- Adds token symbol as a kanji-style watermark and lists top 3 reasons.

No custom prompt needed; override with `prompt` if desired.

## Pricing

Autoshard itself is free and open-source (MIT). CC0 image generation
costs are passed through from cc0.company (~$0.069/job for first-party
LoRAs). You only pay for images you generate.

## Prompt guide

The canonical prompt template and training-example register for the
default `hokusai-gen` risk-card style lives at:

```
https://cc0.company/skill/hokusai-gen.md
```

Override `slug` to use other CC0 models; see `/cc0/catalogue` for options.

## Related

- [`../../agentic-marketplace/SKILL.md`](../agentic-marketplace/SKILL.md) — cc0 COMPANY catalog router
- [`https://github.com/retarddegeneth/autoshard`](https://github.com/retarddegeneth/autoshard) — source
- [`https://retarddegeneth.github.io/autoshard/`](https://retarddegeneth.github.io/autoshard/) — docs

## License

MIT
