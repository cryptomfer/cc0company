---
name: cc0company-nft-fully-onchain-limited-cc0drop
version: 3.0.0
description: Fully-onchain single-artwork ERC721 limited edition — one image shared by every token, stored on-chain via SSTORE2, fixed maxSupply cap plus optional allowlist (initialMerkleRoot at deploy or setMerkleRoot later). Single-payment orchestrated deploy. Solidity contract CC0CollectionShared. Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully-onchain cc0drop (ERC721) — limited edition

One artwork shared by every minted token, **fixed max supply**, optional
allowlist + public phases — a classic edition drop with **one wallet
signature** total: the backend orchestrates deploy + on-chain artwork commit +
finalize from a single ETH payment. Every token is a unique ERC-721 tokenId,
but `tokenURI(tokenId)` renders the **same shared image** — holders get a
`#1/100` feel without 100 distinct images. No layers, no DNA, no traits.

> **Category vs contract name.** The user-facing category is **cc0drop
> (ERC721)**. The Solidity contract is `CC0CollectionShared` (v3) — that name
> appears only where a contract identifier is technically required.

**Auth, ETH payment model, chains, `social_links`:** [root router](../../../SKILL.md).
**Rail mechanics** (SSTORE2 economics, 402 flow): [rail router](../../SKILL.md).
**Cap + allowlist policy:** [edition router](../SKILL.md). **The canonical
merkle recipe** (leaf format, tree, builders, holder snapshot):
[`../../../allowlist.md`](../../../allowlist.md). **Not in the SDK** —
[`@cc0company/sdk`](../../../../sdk/SKILL.md) `Cc0Drops` covers the IPFS rail
only; this is raw HTTP/ABI. For **unlimited timed** supply instead, see the
[open cc0drop leaf](../../open-edition/cc0drop/SKILL.md), which also carries
the full deploy walkthrough this leaf shares.

## What makes this a limited edition

`maxSupply: N` (fixed) — a hard cap on unique tokenIds, **immutable
post-deploy** (baked into the constructor). Optionally seal an allowlist at
block 0 with `initialMerkleRoot`, or add one later with `setMerkleRoot`.
Airdrops and owner-mints count toward the cap — reserve headroom.

## Mental model

```
┌─ Collection (= one CC0CollectionShared v3 contract on chain) ──┐
│   - name, symbol, description (constructor args)               │
│   - maxSupply (HARD CAP, baked at deploy, immutable)          │
│   - publicMintPrice + paymentToken (ETH or any ERC20)          │
│   - initialMerkleRoot (allowlist, baked at deploy — optional)  │
│   - one on-chain artwork (SSTORE2 + DEFLATE), reused by all   │
│                                                                 │
│   Mint surface:                                                │
│     mint(quantity, allowlistProof, allowlistLimit)             │
│     ┌─ public mint     → empty proof, limit=0                  │
│     └─ allowlist mint  → proof from the tree, limit from leaf  │
└─────────────────────────────────────────────────────────────────┘
```

## Deploy — same 5-step orchestrator, `maxSupply: "N"`

The deploy lifecycle (draft → chunk artwork into the transit buffer → 402
quote → pay → retry) is identical to the [open leaf](../../open-edition/cc0drop/SKILL.md);
the **only** differences for a limited edition are the cap and an optional
baked allowlist root.

**Step 1 draft** — set `max_supply` to your cap:

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{
    "name": "Cosmic Dreams",
    "symbol": "COSMIC",
    "description": "100 editions of a hand-drawn cosmic scene.",
    "token_standard": "ERC721Shared",
    "chain": "base",
    "max_supply": 100,
    "mint_price": "1000000000000000",
    "payment_token": "0x0000000000000000000000000000000000000000",
    "royalty_bps": 500
  }'
```

**Step 3 `deploy_params`** — `maxSupply: "100"`, and bake the allowlist if you
want it sealed at block 0:

```json
{
  "deploy_params": {
    "name": "Cosmic Dreams",
    "symbol": "COSMIC",
    "description": "100 editions of a hand-drawn cosmic scene.",
    "maxSupply": "100",
    "mintSettings": {
      "publicMintPrice": "1000000000000000",
      "paymentToken": "0x0000000000000000000000000000000000000000",
      "mintStart": 1733000000,
      "mintEnd": 1735000000,
      "maxPerAddress": "5"
    },
    "withdrawRecipients": [ { "recipient": "0xYourAgentWallet", "percentage": 10000 } ],
    "royaltyRecipient": "0xYourAgentWallet",
    "royaltyBps": 500,
    "owner": "0xYourAgentWallet",
    "initialMerkleRoot": "0xYOUR_ROOT_OR_ZERO"
  }
}
```

| Field vs open edition | Limited value |
|---|---|
| `maxSupply` | **`"N"`** (fixed cap; immutable post-deploy) |
| `mintSettings.maxPerAddress` | typically a real cap (`"5"`) rather than `"0"` |
| `initialMerkleRoot` | your allowlist root, or zero to add one later |

Build `initialMerkleRoot` with the canonical recipe (leaf =
`keccak256(abi.encodePacked(address, uint256 maxQty))`, OZ sorted-pair
`StandardMerkleTree.of(entries, ["address","uint256"])`) in
[`../../../allowlist.md`](../../../allowlist.md). Everything else — buffer
caveats, the 402 quote shape, pay-and-retry, success response, idempotency —
is verbatim the [open leaf](../../open-edition/cc0drop/SKILL.md).

## Buyer mint — public + allowlist

Buyers call `mint(quantity, allowlistProof, allowlistLimit)` directly, paying
ETH `value` (or pre-approved ERC20):

```typescript
const SHARED_MINT_ABI = [{
  type: "function", name: "mint", stateMutability: "payable",
  inputs: [
    { name: "quantity", type: "uint256" },
    { name: "allowlistProof", type: "bytes32[]" },
    { name: "allowlistLimit", type: "uint256" },
  ], outputs: [],
}] as const

// Public mint: empty proof, limit 0
await client.writeContract({
  address: COLLECTION, abi: SHARED_MINT_ABI, functionName: "mint",
  args: [1n, [], 0n], value: PUBLIC_MINT_PRICE * 1n,
})

// Allowlist mint: proof + the EXACT limit the buyer's leaf was hashed with
await client.writeContract({
  address: COLLECTION, abi: SHARED_MINT_ABI, functionName: "mint",
  args: [1n, PROOF, 3n], value: PUBLIC_MINT_PRICE * 1n,
})
```

The `allowlistLimit` must equal the `maxQty` the wallet's leaf was built with —
a different value changes the leaf hash and reverts `InvalidProof`. Buyers
fetch proof + per-leaf limit from the public endpoint (no auth):

```
GET /api/store/nft-minting/collections/{id}/allowlist/proof?address={buyer}
```

(Agent-auth mirror at `/api/store/agents/me/collections/{id}/allowlist/proof`.)
This `mint(qty, proof, limit)` is the cc0drop (ERC721) surface — the erc1155
`mintWithProof` is a different function; see the
[limited erc1155 leaf](../erc1155/SKILL.md).

## Post-deploy phase management (`prepare-onchain-tx`)

The contract has one `mintSettings` struct + one `merkleRoot`. Rotate them
with owner-signed txs built by the dispatcher — create the DB phase first
(`POST /phases`, add wallets via `POST /allowlist` or `/allowlist/from-collection`),
then:

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections/col_xxx/prepare-onchain-tx \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{ "action": "activate-allowlist", "phase_id": "phase_xxx" }'
```

| `action` | Txs returned (in order) | Semantics |
|---|---|---|
| `activate-public` | `setMintSettings` | Writes the public phase's price/window/cap (`phase_type` must be `public`) |
| `activate-allowlist` | `setMintSettings`, `setMerkleRoot` | Two signatures. Backend regenerates the root from the phase's current DB entries at build time; 400 if the phase has no entries yet |
| `sync-allowlist` | `setMerkleRoot` | Push newly added wallets to a live phase (root regenerated) |
| `deactivate` / `delete` | `setMintSettings(LOCKED)` | Writes a locked sentinel (price 0, start=end=1) that closes minting |

Response:

```json
{
  "success": true,
  "action": "activate-allowlist",
  "phase_id": "phase_xxx",
  "contract_address": "0x...",
  "transactions": [
    { "to": "0x...", "data": "0x...", "value": "0", "chainId": 8453, "label": "setMintSettings" },
    { "to": "0x...", "data": "0x...", "value": "0", "chainId": 8453, "label": "setMerkleRoot" }
  ]
}
```

Sign + broadcast **all** transactions in order, then call
`POST /phases/:phaseId/activate` with the hashes to flip DB state to match.
`chainId` follows `collection.chain`. Phase `mint_price` in the DB is an
**ETH-decimal string** (`"0.001"`) — the dispatcher converts to wei; don't
store wei there. You can also call `setMintSettings` / `setMerkleRoot` directly
with your own calldata (both plain `onlyOwner`) — the dispatcher just saves you
the ABI encoding and guarantees the root matches the DB allowlist the proof
endpoint serves.

## Read functions + events

| Function | Returns | Use for |
|---|---|---|
| `mintSettings()` | `(publicMintPrice, paymentToken, mintStart, mintEnd, maxPerAddress)` | Current mint config |
| `totalSupply()` / `maxSupply()` | `uint256` | "X / cap minted" |
| `merkleRoot()` | `bytes32` | Zero root = no active allowlist |
| `tokenURI(uint256)` | `string` | On-chain JSON; image is a data URL from the SSTORE2 artwork |
| `artworkFinalized()` | `bool` | Mint is blocked until true |
| `owner()` | `address` | Should be your agent wallet |

`MintSettingsUpdated(...)` fires on phase rotation / price changes;
`ArtworkFinalized()` fires once from the orchestrator.

## Common errors

| Status | Error | Cause / fix |
|---|---|---|
| 400 | "Allowlist phase has no entries yet" | Add wallets via `POST /allowlist` before `activate-allowlist` |
| `InvalidProof` revert | wrong `allowlistLimit`, stale root, or mixed leaf conventions | Re-fetch from the proof endpoint; re-sync the root after entry changes |
| 400 | "Collection already deployed" | One deploy per draft; create a new draft |
| 402 | Payment Required / already consumed | Pay the quote / send a fresh ETH transfer per deploy |

Deploy-time errors (buffer TTL, payment verification) are in the
[open leaf](../../open-edition/cc0drop/SKILL.md); auth errors are in the
[root router](../../../SKILL.md).

## Related

- [`../../open-edition/cc0drop/SKILL.md`](../../open-edition/cc0drop/SKILL.md) — full deploy walkthrough (unlimited timed variant)
- [`../erc1155/SKILL.md`](../erc1155/SKILL.md) — multi-token capped edition + 1/1 auctions
- [`../../../allowlist.md`](../../../allowlist.md) — **the** merkle recipe + `from-collection` holder snapshot
- [`../SKILL.md`](../SKILL.md) — cap + allowlist policy on this rail
- [`../../SKILL.md`](../../SKILL.md) — rail router: SSTORE2, 402 uploads
- [`../../../SKILL.md`](../../../SKILL.md) — root: auth, ETH payment, chains, `social_links`
- [`../../../airdrops.md`](../../../airdrops.md) — airdrops (count toward the cap)
