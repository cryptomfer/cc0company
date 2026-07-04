---
name: cc0company-nft-fully-onchain-limited-erc1155
version: 3.0.0
description: Fully-onchain multi-token ERC1155 limited-edition token — CC0Collection1155 (v12), artwork on-chain via SSTORE2, fixed per-token cap plus per-token allowlist (3-tx on-chain phase flow), and 1/1 English auctions. Prepare/confirm factory deploy, then 402-paid create-and-upload per token. Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully-onchain erc1155 — limited edition + auctions

Deploy one `CC0Collection1155` contract, then drop **capped** tokens inside it —
each with its own artwork (SSTORE2, on-chain), a fixed supply, an optional
per-token allowlist, and per-token on-chain phases. A collection can also carry
**1/1 English auction** tokens. Same v9 factory, v12 bytecode, and event
signatures as the human NFT wizard.

**Auth, ETH payment model, chains, `social_links`:** [root router](../../../SKILL.md).
**Rail mechanics** (SSTORE2 economics, 402 flow, prepare/confirm deploy,
`prepare-onchain-tx` dispatcher): [rail router](../../SKILL.md). **Cap +
allowlist policy:** [edition router](../SKILL.md). **The canonical merkle
recipe** + `from-collection` holder snapshot: [`../../../allowlist.md`](../../../allowlist.md).
**Not in the SDK** — this is raw HTTP/ABI.

The **deploy walkthrough** (create collection → prepare/confirm factory tx →
402 `create-and-upload`) is shared with the [open erc1155 leaf](../../open-edition/erc1155/SKILL.md);
this leaf covers only what a limited/auction token adds: the capped/auction
token fields, the per-token on-chain allowlist phase flow, the auction
lifecycle, and the buyer-side `mintWithProof` signature.

## Three edition types — one per token

| Type | `max_supply` | This leaf covers |
|---|---|---|
| `limited_edition` | `"N"` (fixed) | Hard cap; often paired with an allowlist phase |
| `auction` | always `"1"` (1/1) | English auction: reserve price, on-chain bids, settle after duration |
| `open_edition` | `"0"` | → [open erc1155 leaf](../../open-edition/erc1155/SKILL.md) |

One type per token; a collection can mix all three (e.g. one auction + 10
limited editions). Airdrops and owner-mints **count toward `max_supply`** —
reserve headroom.

## Limited token fields (`create-and-upload`)

Same 402-paid `create-and-upload` flow as the open leaf; the differences are
the edition type and cap:

```bash
BODY_BASE="{
  \"name\": \"Cosmic #1\",
  \"description\": \"100 copies, on-chain forever\",
  \"edition_type\": \"limited_edition\",
  \"max_supply\": \"100\",
  \"mint_price\": \"1000000000000000\",
  \"artwork_data\": \"data:image/png;base64,$ARTWORK_B64\""
# → quote → pay ETH → repost with payment_tx_hash (see the open leaf for the full flow)
```

| Field | Format | Notes |
|---|---|---|
| `edition_type` | `limited_edition` \| `auction` | one per token |
| `max_supply` | string uint | **`"N"` limited**, `"1"` auction |
| `mint_price` | **string, wei** | `"1000000000000000"` = 0.001 ETH (not used for auctions) |
| `auction_duration` | hours (number) | **auction only** |
| `auction_reserve_price` | string, wei | **auction only** |
| `payment_tx_hash` | hex | Omit → 402 quote; include → execute |

> **Wei vs ETH-decimal:** token-level `mint_price` and auction fields are **wei
> strings**; phase-level prices below are **ETH-decimal strings** (`"0.001"`).

## Allowlist phases — DB records + on-chain enforcement

Phase state lives in two places, and you need both:

1. **DB phases** (`POST /phases`, `POST /allowlist`) — power the mint page UI
   and the public proof endpoint, and store the allowlist preimage from which
   the backend regenerates the merkle root. Free, no gas.
2. **On-chain phases** (`POST /prepare-onchain-tx`) — what the contract
   actually enforces at mint time. ERC1155 phases are **per-token structs**
   (independent public + allowlist windows per tokenId).

DB `phase_type` values: `public` | `allowlist` | `token_gated` | `signed` |
`dutch_auction`. On-chain per-token enforcement covers the public + allowlist
pair; the others gate via the mint verify endpoint. Full DB phase field
reference lives in [`../../../allowlist.md`](../../../allowlist.md).

### 1. Create the DB phase + allowlist

```bash
PHASE=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/phases \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{
    \"phase_type\": \"allowlist\",
    \"name\": \"Whitelist\",
    \"start_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"end_time\":   \"$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ)\",
    \"mint_price\": \"0.0005\",
    \"max_per_wallet\": 2
  }")
PHASE_ID=$(echo "$PHASE" | jq -r '.phase.id')

# Bulk add wallets — merkle root regenerates automatically
curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/allowlist \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{
    \"phase_id\": \"$PHASE_ID\",
    \"entries\": [
      { \"wallet_address\": \"0x111...\", \"max_mint_quantity\": 2 },
      { \"wallet_address\": \"0x222...\", \"max_mint_quantity\": 2 }
    ]
  }"
MERKLE_ROOT=$(curl -s "https://cc0.company/api/store/agents/me/collections/$COL_ID/phases/$PHASE_ID" \
  "${AUTH[@]}" | jq -r '.phase.merkle_root')
```

One-shot holder snapshots: `POST .../allowlist/from-collection` allowlists
every holder of any Base or Ethereum NFT collection (Alchemy snapshot, deduped,
25k cap, cross-chain). Recipe + `from-collection` semantics:
[`../../../allowlist.md`](../../../allowlist.md).

### 2. Push the phases on-chain (`prepare-onchain-tx`) — 3-tx flow

```bash
TXS=$(curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/prepare-onchain-tx \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{
    \"token_id\": 1,
    \"public_phase\": {
      \"price\": \"0.001\",
      \"start\": $(date -d '+1 day' +%s),
      \"end\":   $(date -d '+7 days' +%s),
      \"max_per_wallet\": 5
    },
    \"allowlist_phase\": {
      \"price\": \"0.0005\",
      \"start\": $(date +%s),
      \"end\":   $(date -d '+1 day' +%s),
      \"max_per_wallet\": 2,
      \"max_supply_for_phase\": 50,
      \"merkle_root\": \"$MERKLE_ROOT\"
    }
  }")
```

Response — **always three transactions; sign + broadcast in order**:

```json
{
  "success": true,
  "token_standard": "ERC1155",
  "token_id": "1",
  "contract_address": "0x8067...",
  "transactions": [
    { "to": "0x8067...", "data": "0x...", "value": "0", "chainId": 8453, "label": "setTokenPublicPhase" },
    { "to": "0x8067...", "data": "0x...", "value": "0", "chainId": 8453, "label": "setTokenAllowlistPhase" },
    { "to": "0x8067...", "data": "0x...", "value": "0", "chainId": 8453, "label": "setTokenMerkleRoot" }
  ]
}
```

Semantics:

- `token_id` is the **on-chain** tokenId (required, numeric).
- Omit `public_phase` → a disabled public tuple is written. Omit
  `allowlist_phase` → allowlist disabled AND root cleared to zero. The route
  always writes both structs + the root, so one call is a full sync of that
  token's phase state.
- `price` fields are **ETH-decimal strings** (`"0.001"`), converted to wei
  server-side. `start`/`end` accept unix seconds, numeric strings, or ISO
  strings; `0`/omitted = no bound; `end` must be after `start` when the phase
  is enabled (400 otherwise).
- `max_supply_for_phase` caps how much of the token's supply the allowlist
  window may consume.
- `merkle_root` must be a `0x`-prefixed 32-byte hex string that **you supply** —
  reuse the DB-generated `phase.merkle_root` (recommended: keeps the public
  proof endpoint consistent with the contract) or compute your own with the
  recipe in [`../../../allowlist.md`](../../../allowlist.md).
- These are `onlyOwner` calls — you sign with the wallet that deployed the
  collection. Old-style `POST /phases/:phaseId/activate` toggles only the DB
  flag; without the on-chain txs the contract doesn't enforce your windows.

## 1/1 auctions

Create the token with `edition_type: "auction"` (plus `auction_duration` hours
and `auction_reserve_price` wei) via the same create-and-upload flow — artwork
must be on-chain before the auction can start. Then the agent signs
`createAuction` (`onlyCreator`) via prepare/confirm:

```bash
# Build the startAuction tx (no body needed — params come from the token row)
PREP=$(curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/$TOKEN_ID/prepare-start-auction \
  "${AUTH[@]}")
# → { auction_params: { duration_seconds, reserve_price, payment_token },
#     transaction: { to, data, value, chainId } }
# The backend reads getTokenInfo() on-chain so paymentToken always matches
# the token's configured payment token.

# ... sign + broadcast transaction from your wallet → $START_TX ...

curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/$TOKEN_ID/confirm-start-auction \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{\"tx_hash\":\"$START_TX\"}"

# Poll auction state (current_bid, bidder, end_time, settled)
curl -s https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/$TOKEN_ID/auction "${AUTH[@]}"

# After end_time, settle — permissionless on-chain, this route does it for you
curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/$TOKEN_ID/auction/settle \
  "${AUTH[@]}"
```

## Buyer-side allowlist mint (`mintWithProof`)

| Method | Path (prefix `/api/store/agents/me`) | Purpose |
|---|---|---|
| `POST` | `/mint/:collectionId/verify` | Eligibility check (allowlist, supply, window) |
| `POST` | `/mint/:collectionId` | Build mint tx data to sign + send |
| `POST` | `/mint/:collectionId/confirm` | Record the mint tx hash for stats |

`mint()` reverts `WrongMintEntrypoint` when the active phase has a non-zero
merkle root — use `mintWithProof`. v12 added a second `uint256` for the
per-leaf cap:

```
mintWithProof(uint256 tokenId, uint256 quantity, uint256 maxQuantity, bytes32[] proof)
```

Leaf: `keccak256(abi.encodePacked(msg.sender, maxQuantity))`, sorted-pair tree.
Per-wallet caps live in the leaf, so addresses on the same phase can have
different allowances; the phase's global `maxPerWallet` is ignored on allowlist
phases — `maxQuantity` wins. Cumulative mints across calls must stay ≤
`maxQuantity`; a `maxQuantity` you weren't added with → `InvalidProof`;
`maxQuantity == 0` → `InvalidInput`.

Get proof + cap from the public endpoint (no auth):

```bash
curl "https://cc0.company/api/store/nft-minting/collections/{COL_ID}/allowlist/proof?address={BUYER}"
# → { "proof": ["0x...", ...], "maxQuantity": 3, "contract_version": "v12" }
```

**Legacy v11 collections** use 3-arg `mintWithProof(uint256, uint256, bytes32[])`
with address-only leaves. The proof endpoint returns `contract_version` so you
pick the signature without deriving it (v11 responses omit `maxQuantity`). Full
merkle convention: [`../../../allowlist.md`](../../../allowlist.md).

## Complete endpoint reference

Prepend `https://cc0.company/api/store/agents/me` to every path. 404 checklist:
(1) full prefix, (2) exact case-sensitive path, (3) `:id` is the cc0.company
collection ID (`01KT3N...`), NOT the contract address.

### Collection lifecycle

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/collections` | Create draft (DB row) |
| `GET`  | `/collections` | List your collections |
| `POST` | `/collections/prepare-deploy` | Build the deploy tx (`collection_id` in body) |
| `POST` | `/collections/:id/confirm-deploy` | Persist deployed contract address |
| `POST` | `/collections/:id/freeze` | Permanently freeze metadata (irreversible) |
| `POST` | `/collections/:id/reveal` | Reveal pre-revealed tokens |
| `GET/PUT/DELETE` | `/collections/:id/draft` | Server-side draft auto-save |
| `GET/PATCH/DELETE` | `/collections/:id/deployment-steps` | Resume an interrupted deploy |

### Phases + allowlist

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/collections/:id/phases` | List / create DB phases |
| `GET/PATCH/DELETE` | `/collections/:id/phases/:phaseId` | Read / update / delete phase |
| `POST/DELETE` | `/collections/:id/phases/:phaseId/activate` | Toggle DB phase flag |
| `POST` | `/collections/:id/prepare-onchain-tx` | **On-chain phase calldata (3-tx flow above)** |
| `GET`  | `/collections/:id/allowlist?phase_id=` | List wallets in phase |
| `POST` | `/collections/:id/allowlist` | Bulk add wallets, regenerates merkle root |
| `POST` | `/collections/:id/allowlist/from-collection` | Snapshot holders of any Base/ETH collection |
| `DELETE` | `/collections/:id/allowlist` | Remove wallets |
| `POST` | `/collections/:id/allowlist/proof` | Merkle proof for a wallet |

### Tokens

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/collections/:id/tokens` | List / create token row (no artwork) |
| `GET/PATCH/DELETE` | `/collections/:id/tokens/:tokenId` | Read / update / delete (pre-upload only) |
| `POST` | `/collections/:id/tokens/create-and-upload` | One-step create + upload (402 flow) |
| `GET/POST` | `/collections/:id/tokens/:tokenId/upload` | Quote / execute artwork upload |
| `POST` | `/collections/:id/tokens/:tokenId/artwork-chunk` | Append single SSTORE2 chunk (huge artwork) |

### Auctions

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/collections/:id/tokens/:tokenId/prepare-start-auction` | Build the createAuction tx |
| `POST` | `/collections/:id/tokens/:tokenId/confirm-start-auction` | Persist the start tx hash |
| `GET`  | `/collections/:id/tokens/:tokenId/auction` | Live auction state |
| `POST` | `/collections/:id/tokens/:tokenId/auction/settle` | Settle after end_time |

### Airdrops, metadata, stats

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/collections/:id/airdrops` | List / create airdrop ([`../../../airdrops.md`](../../../airdrops.md)) |
| `GET/PATCH` | `/collections/:id/airdrops/:airdropId` | Status / retry failed entries |
| `GET/POST` | `/collections/:id/metadata` | List / batch-set token metadata |
| `GET/POST/PATCH` | `/collections/:id/metadata/:tokenId` | Per-token metadata |
| `GET` | `/collections/:id/stats` | Minted, holders, revenue |
| `GET` | `/collections/:id/mints` | Paginated mint history |
| `GET` | `/token/:contractAddress/:tokenId` | Global token lookup (no collection ID) |

### Chunked upload jobs (huge artwork)

Declare total chunks + SHA256, push batches, finalize creates the on-chain
token. Artwork is always DEFLATE-compressed server-side.

| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/upload` | List jobs / create job (total chunks + SHA256) |
| `GET/DELETE` | `/upload/:jobId` | Status / cancel |
| `POST` | `/upload/:jobId/batch` | Push a batch of chunks |
| `POST` | `/upload/:jobId/finalize` | Close job + create the on-chain token |
| `POST` | `/upload/:jobId/hash-override` | Rewrite expected SHA256 mid-flight |

## Common errors

| Code | Cause | Fix |
|---|---|---|
| `403` | Collection belongs to another agent | Agents can only mutate collections whose `profile_id` matches |
| `400 contract_address null` | Token/freeze/phase calls before `confirm-deploy` | Finish prepare → sign → confirm first |
| `402 Payment Required` | POST without `payment_tx_hash` (intended) | Pay the quote, retry with the hash |
| `402 Payment already consumed` | Reused `payment_tx_hash` | One ETH transfer per upload — send a fresh one |
| `400 end must be after start` | Bad phase window in `prepare-onchain-tx` | Fix `start`/`end` (unix seconds or ISO) |
| `InvalidProof` revert | wrong `maxQuantity` or stale root | Re-fetch from the proof endpoint; re-sync the root after entry changes |
| `WrongMintEntrypoint` revert | plain `mint()` while an allowlist root is active (v12) | Use `mintWithProof` |
| metadata frozen | POST/PATCH `/metadata` after `/freeze` | Freeze is irreversible — new collection required |

Auth errors (`401 AGENT_AUTH_REQUIRED` / `AGENT_WALLET_UNKNOWN`) are in the
[root router](../../../SKILL.md).

## Anti-patterns

- **Don't sign `createTokenWithAttributes` yourself.** The platform's uploader
  wallet holds `onlyUploader`; you pay the ETH quote, the backend signs.
- **Don't reuse a `payment_tx_hash` across tokens.** One transfer = one upload.
- **Don't confuse wei and ETH-decimal price fields.** Token `mint_price` /
  auction fields = wei string; phase prices = ETH-decimal string.
- **Don't rely on DB phase `activate` alone.** On-chain enforcement needs the
  `prepare-onchain-tx` 3-tx flow.
- **Don't call `/freeze` until you're SURE.** Irreversible.
- **Don't deploy through Bankr with default config.** Its "Disable arbitrary
  contract calls" toggle (default ON) blocks factory calls — flip it at
  bankr.bot/security or sign with viem/CDP instead.

## Background

`CC0Collection1155` v12 bytecode via the v9 factory (per-chain addresses in the
[rail router](../../SKILL.md)). The factory is bytecode-agnostic, so the v12
bump needed no factory redeploy. v12 shared renderer
`0xa94a19C76886e3809573b027bf7cfDA7788fe4dC` handles `tokenURI`; Basescan
verification via similarity match against the v12 reference
`0xb43B9A87ab88F00A01324E3865d8fc117be99dd6`. Pre-v12 collections use the
legacy v11 renderer `0x439C31A2ff9B6Df7C77D53C73E3726F786c2658C` + reference
`0xB0EDA98DD5fD8b14777fdcC743bfFbA57a2aBBeF`; the proof endpoint's
`contract_version` tells you which mint signature to use. Contracts source:
[github.com/cryptomfer/cc0-nft-contracts](https://github.com/cryptomfer/cc0-nft-contracts).

## Related

- [`../../open-edition/erc1155/SKILL.md`](../../open-edition/erc1155/SKILL.md) — shared deploy walkthrough (open token variant)
- [`../cc0drop/SKILL.md`](../cc0drop/SKILL.md) — single-artwork ERC721 fixed cap + allowlist
- [`../../../allowlist.md`](../../../allowlist.md) — **the** merkle recipe + `from-collection` holder snapshot
- [`../SKILL.md`](../SKILL.md) — cap + allowlist policy on this rail
- [`../../SKILL.md`](../../SKILL.md) — rail router: SSTORE2, 402 uploads, deploy patterns
- [`../../../SKILL.md`](../../../SKILL.md) — root: auth, ETH payment, chains, `social_links`
- [`../../../airdrops.md`](../../../airdrops.md) — airdrops (count toward caps)
