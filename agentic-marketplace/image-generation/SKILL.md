---
name: cc0company-image-generation
version: 2.0.0
description: Pay-per-call AI image generation on cc0.company via x402 v2 USDC. Five fine-tuned CC0 LoRA models — sartoshi-gen, darkfarms-gen, hokusai-gen, van-gogh-gen, monet-gen — async job flow, automatic IPFS pinning, outputs released into the public domain.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
---

# cc0.company Image Generation — 5 CC0 LoRAs

Five fine-tuned CC0 image-generation models, accessible via x402 v2 on Base
mainnet. Agents pay **0.069 USDC per image**, receive a `job_id` immediately,
poll until the generation is ready, and use the output anywhere — every output
is CC0 (no licensing, no attribution required).

## The 5 models

| Slug | Style | Trained by | Per-model prompt guide |
|---|---|---|---|
| `sartoshi-gen` | Hand-drawn comics — mfer stick figures, pepe frogs, NFT in-jokes | cc0toshi | [`./sartoshi-gen.md`](./sartoshi-gen.md) |
| `darkfarms-gen` | Crypto pepe meme art (Darkfarms1 style) | cc0toshi | [`./darkfarms-gen.md`](./darkfarms-gen.md) |
| `hokusai-gen` | Edo-period ukiyo-e woodblock prints | cc0toshi | [`./hokusai-gen.md`](./hokusai-gen.md) |
| `van-gogh-gen` | Post-impressionist Van Gogh paintings | cc0toshi | [`./van-gogh-gen.md`](./van-gogh-gen.md) |
| `monet-gen` | French impressionist Monet paintings | cc0toshi | [`./monet-gen.md`](./monet-gen.md) |

**Critical:** before invoking a model, fetch its per-model prompt guide. Every
LoRA was trained on a specific caption register and the guide documents the
canonical templates. Skipping it typically costs 2-3× in output quality.

## How it works (3 calls)

```bash
# 1. Browse the catalog
curl https://cc0.company/api/store/agent-services

# 2. Invoke a model (x402-gated, 0.069 USDC)
curl -X POST https://cc0.company/api/store/agent-services/sartoshi-gen/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <base64-signed-payload>" \
  -H "X-Agent-Name: my_agent" \
  -d '{"prompt": "<your-prompt>"}'
# → 202 { "job_id": "agentservicejob_xxx", "agent": { "name", "api_key", "was_new" } }

# 3. Poll until done
curl https://cc0.company/api/store/agent-services/jobs/agentservicejob_xxx
# → { "job": { "status": "succeeded", "output_url": "https://...", "ipfs_url": "ipfs://..." } }
```

For the `PAYMENT-SIGNATURE` itself (viem one-liner, Bankr HTTP-only, CDP SDK),
see [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — three lines of
setup and any fetch handles the 402 → sign → retry cycle automatically.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/store/agent-services` | none | List all models + `prompt_guide_url` per model |
| `GET` | `/api/store/agent-services/{slug}` | none | One model's full detail |
| `POST` | `/api/store/agent-services/{slug}/invoke` | x402 v2 | Pay → start a generation. Returns 202 + `job_id` |
| `GET` | `/api/store/agent-services/jobs/{jobId}` | none | Poll a job. Status: `processing` / `succeeded` / `failed` / `refunded` |
| `POST` | `/api/store/agent-services/{slug}/pay-and-invoke` | tx_hash | Human path: send USDC, pass tx hash, no x402 lib needed |
| `GET` | `/api/store/agent-services/{slug}/runs` | none | Public gallery feed of a model's succeeded runs (image + date only) |

## Pricing + IPFS

- **Invoke:** 0.069 USDC per image, fixed across all 5 models. The price
  comes from the live `paymentRequired.maxAmountRequired` field on the 402
  challenge — never hard-code it; read it at runtime.
- **IPFS pinning is automatic and free.** Every succeeded generation is
  pinned to IPFS before the job transitions to `succeeded` — the `output_url`
  you get back IS the IPFS gateway URL, and `ipfs_url` carries the canonical
  `ipfs://` form (`ipfs_persisted: true` on the job). No extra payment, no
  extra call.

## Async job flow

`/invoke` settles your payment and returns 202 immediately; generation takes
~30-60s. Poll `GET /jobs/{jobId}` every 2-5s:

- `processing` — keep polling.
- `succeeded` — `output_url` (IPFS gateway) + `ipfs_url` are ready.
- `failed` → the backend retries every generation once internally.
- `refunded` — it failed twice; the USDC was refunded on-chain and
  `refund_tx_hash` is on the job. **You never lose money on a failed run.**

Full error matrix (400/402/425/5xx semantics): [`../SKILL.md`](../SKILL.md).

## Human path — `pay-and-invoke`

No x402 client? Send a plain USDC `transfer` for the exact price to the
platform receiver (read it from the 402 challenge or the service detail), then:

```bash
curl -X POST https://cc0.company/api/store/agent-services/sartoshi-gen/pay-and-invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "<your-prompt>", "tx_hash": "0x<usdc-transfer-tx>"}'
# → 202 + job_id  (425 = tx not confirmed yet, retry with backoff)
```

The backend verifies the tx on-chain (token, recipient, amount, recency,
idempotency) and the job lifecycle is identical to `/invoke` — including
auto-IPFS and refund-on-failure (if verification passes but generation can't
start, your USDC is refunded).

## Agent identity

First paid invoke auto-registers an agent profile keyed to your paying wallet;
`X-Agent-Name` claims a username. Full registration + renaming + auth story:
[`../SKILL.md`](../SKILL.md).

## Per-model prompt guides

The `prompt_guide_url` field on each model's catalog entry points to a
model-specific skill file in this folder:

- [`sartoshi-gen.md`](./sartoshi-gen.md) — strict comic templates
  (stay-away / r-u-winning-son patterns), `sartoshi signature` closer
- [`darkfarms-gen.md`](./darkfarms-gen.md) — comma-strung phrases,
  `smol pepe <action>` opener, `crypto meme art style` closer
- [`hokusai-gen.md`](./hokusai-gen.md) — Edo-period descriptive,
  `polychrome woodblock print` closer
- [`van-gogh-gen.md`](./van-gogh-gen.md) — LLaVA flat-declarative
  ("The image features…"), `post-impressionist painting with visible
  brushstrokes.` closer
- [`monet-gen.md`](./monet-gen.md) — same LLaVA register, `french
  impressionist painting with soft natural light.` closer

Each file ships 2-3 verbatim training examples (literal captions the LoRA was
trained on, copy-paste safe).

## Related skills

- [`../SKILL.md`](../SKILL.md) — marketplace catalog, pricing, discovery,
  error matrix, agent registration
- [`../x402-payments/SKILL.md`](../x402-payments/SKILL.md) — x402 v2 client
  reference (all signing patterns)
- [`../../nft-collections/SKILL.md`](../../nft-collections/SKILL.md) — turn
  generations into on-chain collections you can sell

## Output licensing

Every image produced by these models is **CC0 / public domain**. Use it in
commercial work, train other models on it, embed it in your platform's
content, redistribute it without attribution. The training data was scoped to
public-domain sources (museum archives for VG/Monet/Hokusai; CC0 collections
for sartoshi/darkfarms), so there's no upstream rights overhang.
