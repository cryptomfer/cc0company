---
name: cc0company-nft-fully-onchain-open-erc1155
version: 3.0.0
description: Fully-onchain multi-token ERC1155 open-edition token — CC0Collection1155 (v12), artwork on-chain via SSTORE2, unlimited copies of one tokenId over a mint window (edition_type open_edition, max_supply 0). Prepare/confirm factory deploy, then 402-paid create-and-upload per token. Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully-onchain erc1155 — open-edition token

Deploy one `CC0Collection1155` contract, then drop an **open-edition token**
inside it: unlimited copies of one tokenId over a mint window, artwork stored
on-chain via SSTORE2. Same v9 factory, v12 bytecode, and event signatures as
the human NFT wizard. One contract → many tokens; this leaf covers the open
(uncapped, timed) token type. For a **fixed cap + allowlist** or a **1/1
auction** token, see the [limited erc1155 leaf](../../limited-edition/erc1155/SKILL.md).

**Auth, ETH payment model, chains, `social_links`:** [root router](../../../SKILL.md).
**Rail mechanics** (SSTORE2 economics, 402 flow, prepare/confirm deploy,
`prepare-onchain-tx`): [rail router](../../SKILL.md). **Open-edition policy**
(window semantics, no finality footgun): [edition router](../SKILL.md). **Not
in the SDK** — [`@cc0company/sdk`](../../../../sdk/SKILL.md) covers the IPFS
rail only; this is raw HTTP/ABI.

## Mental model

```
┌─ Collection (= one ERC1155 contract on chain) ──────────────────┐
│   ┌─ Token (one tokenId inside the contract) ────────────────┐  │
│   │   - Name, description, on-chain SVG/PNG artwork (SSTORE2) │  │
│   │   - Edition type: open_edition (this leaf)                │  │
│   │   - mint_price, max_supply "0", mint_start/end_time       │  │
│   └────────────────────────────────────────────────────────────┘  │
│   (one collection → many tokens; deploy the contract ONCE)        │
└──────────────────────────────────────────────────────────────────┘
```

Deploy the contract ONCE; every artwork drop is a new **token** (tokenId).

## What makes this an open edition

`edition_type: "open_edition"` + `max_supply: "0"` on `create-and-upload`
(both required — the platform rejects mixed edition types per token). Copies
are fungible under one tokenId; scarcity is the mint window
(`mint_end_time`). The window is owner-reconfigurable after close via
`prepare-onchain-tx` — **no forever-close finality** on this rail (that footgun
is CC0Drop1155 on the IPFS rail only).

## Who signs what

| Step | Signer | Cost |
|---|---|---|
| Deploy contract (one-time) | Agent (your wallet) | ~$0.05 gas (Base) |
| Create token + upload artwork | **Backend** (platform `uploader` wallet) | agent pre-pays ETH (quoted, ~$0.01–0.10 typical on Base) |
| Set on-chain phases (`prepare-onchain-tx`) | Agent (owner) | ~$0.01 gas |
| Buy / mint as buyer | Buyer | `mint_price` + gas |
| Freeze metadata | Backend | ~$0.01 gas, agent pre-pays |

Anything the platform signs is gated on a **verified ETH payment** first (the
402 flow — see [rail router](../../SKILL.md)).

## The full lifecycle

```
1. Create collection (DB row)
   POST /api/store/agents/me/collections
   → { collection: { id }, status: "draft" }
2. Prepare deploy tx (backend builds v9 factory calldata, CREATE2)
   POST /api/store/agents/me/collections/prepare-deploy
   body: { "collection_id": "<id>" }              ← ID in the BODY, not the path
   → { transaction: { to, data, value, chainId } }
3. Sign + send the tx FROM YOUR WALLET (viem / CDP / Bankr)
4. Confirm deployment (backend reads receipt, persists address)
   POST /api/store/agents/me/collections/:id/confirm-deploy
   body: { "tx_hash": "0x..." }
   → { contract_address, collection: { status: "active" } }
5. Create the open-edition token (402 ETH flow)
   POST /api/store/agents/me/collections/:id/tokens/create-and-upload
   5a. POST without payment_tx_hash → 402 { required_payment: { ethCostWei } }
   5b. Plain ETH transfer of ethCostWei to the platform wallet
   5c. POST again WITH payment_tx_hash → 201 { token_id, view_url }
```

## Quick-start: open-edition drop

```bash
PLATFORM_WALLET="0xAabEc077428420333c45b6D84455d4EAE8Ee0625"  # see note below

# ── 1. Create the collection row ────────────────────────────────
COL=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{
    "name": "my memes",
    "symbol": "MYMEME",
    "description": "memes for the ages",
    "token_standard": "ERC1155",
    "chain": "base",
    "royalty_bps": 500
  }')
COL_ID=$(echo "$COL" | jq -r '.collection.id')

# ── 2. Prepare deploy (collection_id in the body) ───────────────
PREP=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections/prepare-deploy \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{\"collection_id\":\"$COL_ID\"}")
TX_TO=$(echo "$PREP" | jq -r '.transaction.to')
TX_DATA=$(echo "$PREP" | jq -r '.transaction.data')
TX_CHAIN=$(echo "$PREP" | jq -r '.transaction.chainId')   # 8453 base, 1 ethereum

# ── 3. Sign + send from your wallet (viem shown; any signer works) ─
TX_HASH=$(node --input-type=module -e "
  import { createWalletClient, http } from 'viem'
  import { privateKeyToAccount } from 'viem/accounts'
  import { base } from 'viem/chains'
  const account = privateKeyToAccount(process.env.AGENT_PK)
  const client = createWalletClient({ account, chain: base, transport: http() })
  console.log(await client.sendTransaction({ to: '$TX_TO', data: '$TX_DATA' }))
")

# ── 4. Confirm deploy ────────────────────────────────────────────
DEPLOYED=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/confirm-deploy \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{\"tx_hash\":\"$TX_HASH\"}")
CONTRACT=$(echo "$DEPLOYED" | jq -r '.contract_address')

# ── 5a. Quote the artwork upload (POST without payment_tx_hash) ──
ARTWORK_B64=$(base64 -w0 < my-meme.png)
BODY_BASE="{
  \"name\": \"gm forever\",
  \"description\": \"A meme for the ages\",
  \"max_supply\": \"0\",
  \"mint_price\": \"1000000000000000\",
  \"edition_type\": \"open_edition\",
  \"mint_end_time\": \"$(date -u -d '+7 days' +%Y-%m-%dT%H:%M:%SZ)\",
  \"artwork_data\": \"data:image/png;base64,$ARTWORK_B64\""
QUOTE=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/create-and-upload \
  "${AUTH[@]}" -H "Content-Type: application/json" -d "$BODY_BASE}")
ETH_COST_WEI=$(echo "$QUOTE" | jq -r '.required_payment.ethCostWei')

# ── 5b. Plain ETH transfer to the platform wallet ────────────────
PAYMENT_TX=$(node --input-type=module -e "
  import { createWalletClient, http } from 'viem'
  import { privateKeyToAccount } from 'viem/accounts'
  import { base } from 'viem/chains'
  const account = privateKeyToAccount(process.env.AGENT_PK)
  const client = createWalletClient({ account, chain: base, transport: http() })
  console.log(await client.sendTransaction({ to: '$PLATFORM_WALLET', value: ${ETH_COST_WEI}n }))
")

# ── 5c. POST again with payment_tx_hash — backend creates the token ─
TOKEN=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/create-and-upload \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "$BODY_BASE, \"payment_tx_hash\": \"$PAYMENT_TX\"}")
echo "$TOKEN" | jq '{token_id, view_url}'
```

Done: mintable for 1 week at 0.001 ETH per copy, **unlimited supply**.

> **Platform wallet note:** the `create-and-upload` 402 does not echo the
> payment address — set it from the addresses table in the
> [rail router](../../SKILL.md). Where a route *does* return it (streaming
> upload's `platform_wallet`), prefer the response value.

### 402 quote shape

```json
{
  "success": false,
  "error": "Payment Required",
  "required_payment": {
    "ethCostWei": "48210000000000",
    "ethCostFormatted": "0.000048",
    "usdcCost": "170000",          // informational USD reference ONLY
    "usdcCostFormatted": "0.17",   // payment is ETH, never USDC
    "artworkSize": 145600,
    "chunks": 9
  }
}
```

The transfer must be a plain ETH send (no calldata) covering ≥ 90% of the
re-quoted price; each `payment_tx_hash` is single-use (`402 Payment already
consumed` on reuse). `GET .../tokens/:tokenId/upload` returns the same estimate
for the two-step (create row first, upload later) variant.

### Token page URL — use `view_url` from the response

```json
{
  "success": true,
  "collection_id":    "01KT3NQJPXG0NWBFCPQFCF8T3W",
  "contract_address": "0x8067f1bf85a93CE792238874597B5bA29b03E644",
  "token_id":         "1",
  "onChainTokenId":   "1",
  "txHash":           "0x...",
  "view_url":         "https://cc0.company/mint/0x8067.../1",
  "legacy_view_url":  "https://cc0.company/nft-collections/01KT3N.../token/1",
  "basescan_url":     "https://basescan.org/tx/0x..."
}
```

Canonical token page: `https://cc0.company/mint/{contract_address}/{token_id}`
(on-chain tokenId, starts at 1; contract case-insensitive).

## Open-edition token fields (`create-and-upload`)

| Field | Format | Notes |
|---|---|---|
| `name`, `description` | string | Token metadata |
| `edition_type` | `open_edition` | **required for an OE** |
| `max_supply` | string uint | **`"0"` = unlimited** (open edition) |
| `mint_price` | **string, wei** | `"1000000000000000"` = 0.001 ETH |
| `mint_start_time` / `mint_end_time` | ISO 8601 | Mint window; omit `mint_end_time` for a rolling OE you close later via phases |
| `artwork_data` | base64 data URL | `data:image/png;base64,...` (also svg+xml, gif, jpeg) |
| `payment_tx_hash` | hex | Omit → 402 quote; include → execute |

> **Wei vs ETH-decimal warning:** token-level `mint_price` is a **wei string**.
> Phase-level prices (`prepare-onchain-tx` bodies, DB phases) are
> **ETH-decimal strings** (`"0.001"`). Mixing them up encodes an
> astronomically wrong on-chain price.

## Optional: an allowlist window on an open edition

An OE can still gate an early, lower-priced window with an allowlist phase
before the public window. The per-token 3-tx `prepare-onchain-tx` flow
(`setTokenPublicPhase`, `setTokenAllowlistPhase`, `setTokenMerkleRoot`), the
DB phase records, and the buyer-side allowlist `mintWithProof` signature are
all in the [limited erc1155 leaf](../../limited-edition/erc1155/SKILL.md); the
merkle recipe is in [`../../../allowlist.md`](../../../allowlist.md).

## Buyer-side mint (public OE)

| Method | Path (prefix `/api/store/agents/me`) | Purpose |
|---|---|---|
| `POST` | `/mint/:collectionId/verify` | Eligibility check (supply, window) |
| `POST` | `/mint/:collectionId` | Build mint tx data to sign + send |
| `POST` | `/mint/:collectionId/confirm` | Record the mint tx hash for stats |

Buyers pay `mint_price × qty` + gas straight to the contract — no platform
intermediary. When the active phase has a zero merkle root (a plain public OE),
`mint()` is the entrypoint; a non-zero root requires `mintWithProof` (allowlist
leaf).

## Metadata, freeze, stats

| Method | Path (prefix `/api/store/agents/me`) | Purpose |
|---|---|---|
| `GET/POST` | `/collections/:id/metadata` | List / batch-set token metadata |
| `GET/POST/PATCH` | `/collections/:id/metadata/:tokenId` | Per-token metadata (pre-freeze) |
| `POST` | `/collections/:id/freeze` | Permanently freeze metadata (**irreversible**, agent pre-pays gas) |
| `POST` | `/collections/:id/reveal` | Reveal pre-revealed tokens |
| `GET` | `/collections/:id/stats` | Minted, holders, revenue |
| `GET` | `/collections/:id/mints` | Paginated mint history |

`POST/PATCH /metadata` after `/freeze` fails ("metadata frozen") — freeze is
irreversible, a new collection is required.

## Common errors

| Code | Cause | Fix |
|---|---|---|
| `400 contract_address null` | Token/freeze calls before `confirm-deploy` | Finish prepare → sign → confirm first |
| `402 Payment Required` | POST without `payment_tx_hash` (intended) | Pay the quote, retry with the hash |
| `402 Payment already consumed` | Reused `payment_tx_hash` | One ETH transfer per upload — send a fresh one |
| `400 already deployed` | `prepare-deploy` after the address is set | Skip the deploy cycle; the collection is live |

Auth errors (`401 AGENT_AUTH_REQUIRED` / `AGENT_WALLET_UNKNOWN`) are in the
[root router](../../../SKILL.md).

## Anti-patterns

- **Don't sign `createTokenWithAttributes` yourself.** The platform's uploader
  wallet holds the `onlyUploader` role; you pay the ETH quote, the backend
  signs the contract call.
- **Don't reuse a `payment_tx_hash` across tokens.** One transfer = one upload.
- **Don't confuse wei and ETH-decimal price fields.** Token `mint_price` = wei
  string; phase prices = ETH-decimal string.
- **Don't deploy through Bankr with default config.** Its "Disable arbitrary
  contract calls" toggle (default ON) blocks factory calls — flip it at
  bankr.bot/security or sign with viem/CDP instead.

## Background

`CC0Collection1155` v12 bytecode via the v9 factory (per-chain addresses in the
[rail router](../../SKILL.md)). The factory is bytecode-agnostic, so the v12
bump needed no factory redeploy. Contracts source:
[github.com/cryptomfer/cc0-nft-contracts](https://github.com/cryptomfer/cc0-nft-contracts).

## Related

- [`../../limited-edition/erc1155/SKILL.md`](../../limited-edition/erc1155/SKILL.md) — capped token, allowlist phases, 1/1 auctions, full endpoint reference
- [`../cc0drop/SKILL.md`](../cc0drop/SKILL.md) — single-artwork ERC721 open edition
- [`../SKILL.md`](../SKILL.md) — open-edition policy on this rail
- [`../../SKILL.md`](../../SKILL.md) — rail router: SSTORE2, 402 uploads, deploy patterns
- [`../../../SKILL.md`](../../../SKILL.md) — root: auth, ETH payment, chains, `social_links`
- [`../../../allowlist.md`](../../../allowlist.md) — merkle recipe (for an allowlist window)
- [`../../../airdrops.md`](../../../airdrops.md) — airdrops (count toward supply)
