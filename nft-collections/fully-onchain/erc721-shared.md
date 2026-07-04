# ERC721Shared — single-artwork on-chain collections

One artwork shared by every minted token, fixed max supply, optional
allowlist + public phases — a classic edition drop with **one wallet
signature** total: the backend orchestrates deploy + on-chain artwork
commit + finalize from a single ETH payment. No layers, no DNA, no
traits.

Shared concepts (standard picker, SSTORE2 economics, payment model,
auth, addresses): [`./SKILL.md`](./SKILL.md). If you need multiple
artworks or auctions under one contract, you want
[`./erc1155.md`](./erc1155.md) instead.

## Mental model

```
┌─ Collection (= one CC0CollectionShared v3 contract on chain) ──┐
│   - name, symbol, description (constructor args)               │
│   - maxSupply (hard cap, baked at deploy)                      │
│   - publicMintPrice + paymentToken (ETH or any ERC20)          │
│   - initialMerkleRoot (allowlist, baked at deploy)             │
│   - SHARED ARTWORK fully on-chain via SSTORE2 + DEFLATE        │
│                                                                 │
│   Mint surface:                                                │
│     mint(quantity, allowlistProof, allowlistLimit)             │
│     ┌─ public mint     → empty proof, limit=0                  │
│     └─ allowlist mint  → proof from the tree, limit from leaf  │
└─────────────────────────────────────────────────────────────────┘
```

Every token is a unique ERC-721 tokenId, but `tokenURI(tokenId)`
renders the **same shared image** — holders get a "#1/100" feel
without 100 distinct images.

## Who signs what

| Step | Signer | Cost |
|---|---|---|
| Create collection draft (DB row) | Backend | free |
| Upload artwork chunks (transit buffer) | Backend | free |
| Get the deploy quote | Backend | free |
| **Pay** the quoted ETH amount | **Agent** (your wallet) | quoted (~$0.05–0.50 on Base by artwork size) |
| `factory.deployCollection(...)` | Backend (creator = YOU) | covered by the payment |
| `addArtworkChunk(...)` × N + `finalizeArtwork()` | Backend (uploader role) | covered by the payment |
| Mint as buyer | Buyer | `mintPrice × qty` + gas |
| Phase changes post-deploy (`prepare-onchain-tx`) | Agent (owner) | ~$0.01 gas |

**You are the contract owner.** The factory takes `creator` as an arg
and transfers ownership to it in the constructor — regardless of who
paid gas. The platform wallet only gets the `uploader` role, scoped to
`addArtworkChunk` + `finalizeArtwork` and useless after the seal.

Auth: wallet-signature headers as in [`./SKILL.md`](./SKILL.md)
(helper [`../examples/agent-sign.mjs`](../examples/agent-sign.mjs));
the legacy API key is still accepted during the transition and
currently still required on `POST /collections`, `artwork-chunk`, and
`orchestrate-shared-deploy` (not yet migrated to wallet-sig).

## The full lifecycle in 5 steps

```
1. Create collection draft (DB row)
   POST /api/store/agents/me/collections
   body: { token_standard: "ERC721Shared", name, symbol, ... }
2. Stream artwork chunks into the transit buffer
   POST /api/store/agents/me/collections/:id/artwork-chunk   (chunk_index 0…N-1)
3. Get the deploy quote (402 challenge)
   POST /api/store/agents/me/collections/:id/orchestrate-shared-deploy
   body: { deploy_params }                       ← no payment_tx_hash
   → 402 { ethCostWei, platformWallet, chunkCount, ... }
4. Send a plain ETH transfer of ethCostWei to platformWallet
5. Retry the orchestrator with payment_tx_hash
   → { contract_address, deploy_tx_hash, chunk_tx_hashes, finalize_tx_hash }
```

## Step 1: Create the collection draft

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
# → { collection: { id: "col_xxx", status: "draft", contract_address: null } }
```

| Field | Format | Notes |
|---|---|---|
| `token_standard` | string | Must be `"ERC721Shared"` |
| `chain` | `base` \| `ethereum` | Factory resolved per chain (see [`./SKILL.md`](./SKILL.md)) |
| `mint_price` | string, wei (or token base units) | Public price PER TOKEN |
| `payment_token` | hex address | `0x000…000` = ETH; any ERC20 works (USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) |
| `max_supply` | uint | Hard cap. `0` = unlimited (rarely a good idea for a Shared drop) |
| `royalty_bps` | uint96 | ERC-2981 secondary royalty; `500` = 5%; recipient defaults to your wallet |

Save `collection.id` for every subsequent step.

## Step 2: Upload the shared artwork (chunked transit buffer)

Encode the artwork as a base64 data URL
(`data:image/png;base64,...`; also svg+xml, gif, jpeg), slice into
chunks of ≤ 50,000 characters, POST **in order**:

```typescript
import { readFile } from "node:fs/promises"
import { privateKeyToAccount } from "viem/accounts"
import { agentAuthHeaders } from "../examples/agent-sign.mjs"

const account = privateKeyToAccount(process.env.AGENT_PK as `0x${string}`)
const COLLECTION_ID = "col_xxx"

const bytes = await readFile("./cosmic-dreams.png")
const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`
const CHUNK = 50_000
const chunks: string[] = []
for (let i = 0; i < dataUrl.length; i += CHUNK) chunks.push(dataUrl.slice(i, i + CHUNK))

for (let i = 0; i < chunks.length; i++) {
  const res = await fetch(
    `https://cc0.company/api/store/agents/me/collections/${COLLECTION_ID}/artwork-chunk`,
    {
      method: "POST",
      headers: await agentAuthHeaders(account),
      body: JSON.stringify({ chunk_index: i, total_chunks: chunks.length, data: chunks[i] }),
    },
  )
  const json = await res.json()
  console.log(`chunk ${i + 1}/${chunks.length}`, json.complete ? "buffer complete" : `${json.received}/${json.total}`)
}
```

**Buffer caveats:**

- Transit-only, **in-memory, 30-minute idle TTL**, never persisted to
  DB. Stall between chunks (or between Step 2 and Step 3) and the
  buffer drops — re-run Step 2 immediately before quoting.
- POST chunks **serially** — the buffer is not concurrency-safe.
- Practical ceiling ~5 MB; deploy cost grows linearly with bytes.

## Step 3: Get the deploy quote (402 challenge)

POST the orchestrator **without** `payment_tx_hash`:

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections/col_xxx/orchestrate-shared-deploy \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{
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
      "withdrawRecipients": [
        { "recipient": "0xYourAgentWallet", "percentage": 10000 }
      ],
      "royaltyRecipient": "0xYourAgentWallet",
      "royaltyBps": 500,
      "owner": "0xYourAgentWallet",
      "initialMerkleRoot": "0x0000000000000000000000000000000000000000000000000000000000000000"
    }
  }'
```

**402 response:**

```json
{
  "success": false,
  "error": "Payment Required",
  "message": "Send a plain ETH transfer of ethCostWei to platformWallet, then POST again with payment_tx_hash.",
  "ethCostWei": "4521000000000000",
  "requiredMinPaymentWei": "4068900000000000",
  "platformWallet": "0xAabE...0625",
  "chunkCount": 11,
  "uploadBytes": 145600,
  "useCompression": true
}
```

Pay to **`platformWallet` from this response** — never hardcode it.

### `deploy_params` reference

| Field | Type | Notes |
|---|---|---|
| `name`, `symbol`, `description` | string | Must match the Step-1 draft; stored in contract storage |
| `maxSupply` | string uint256 | Hard cap; `"0"` = unlimited |
| `mintSettings.publicMintPrice` | string, wei/base units | Price PER MINT |
| `mintSettings.paymentToken` | address | `0x000…000` = ETH; any ERC20 = token-priced |
| `mintSettings.mintStart` / `mintEnd` | unix seconds | Public window; phases rotate post-deploy via `prepare-onchain-tx` |
| `mintSettings.maxPerAddress` | string uint256 | Per-wallet cap; `"0"` = unlimited |
| `withdrawRecipients` | array | Payout split, basis points, must sum to 10000 |
| `royaltyRecipient` / `royaltyBps` | address / uint96 | ERC-2981 |
| `owner` | address | Contract owner — your agent wallet, NOT the platform |
| `initialMerkleRoot` | bytes32 | Allowlist root baked at deploy; zero root = none (set one later) |

Want the allowlist sealed at block 0? Build the root per
[`../limited-edition/SKILL.md`](../limited-edition/SKILL.md)
(leaf = `keccak256(abi.encodePacked(address, uint256))`, OZ
sorted-pair `StandardMerkleTree.of(entries, ["address","uint256"])`;
dependency-free implementation:
[`../examples/build-merkle.ts`](../examples/build-merkle.ts)).

## Steps 4–5: Pay, then retry

Plain ETH transfer, **no calldata**, to the quoted `platformWallet`:

```typescript
import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"

const account = privateKeyToAccount(process.env.AGENT_PK as `0x${string}`)
const client = createWalletClient({ account, chain: base, transport: http() })

const paymentTxHash = await client.sendTransaction({
  to: quote.platformWallet as `0x${string}`,
  value: BigInt(quote.ethCostWei),
})
```

Retry with the same `deploy_params` plus the hash:

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections/col_xxx/orchestrate-shared-deploy \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{ "payment_tx_hash": "0x...", "deploy_params": { ...same as Step 3... } }'
```

**Success response:**

```json
{
  "success": true,
  "contract_address": "0xYourDeployedCollection",
  "deploy_tx_hash": "0x...",
  "chunk_tx_hashes": ["0x...", "0x..."],
  "finalize_tx_hash": "0x...",
  "collection": {
    "id": "col_xxx",
    "status": "active",
    "shared_artwork_onchain": true,
    "shared_artwork_payment_tx_hash": "0x..."
  }
}
```

What the orchestrator did: verified the payment (≥ 90% of the
re-quote), called `factory.deployCollection(...)` with you as owner,
looped `addArtworkChunk(...)` over every chunk, called
`finalizeArtwork()` (mint is blocked until this — the collection
stays `deploying` until the artwork is sealed), cleared the buffer.

**Idempotency:** one `payment_tx_hash` authorizes exactly one deploy —
reuse returns `402 Payment already consumed`; a collection with a
`contract_address` can't be deployed again.

## Buyer mint (native contract call — no platform intermediary)

Buyers call `mint(quantity, allowlistProof, allowlistLimit)` directly,
paying ETH `value` (or pre-approved ERC20):

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

// Allowlist mint: proof + the exact limit the buyer's leaf was hashed with
await client.writeContract({
  address: COLLECTION, abi: SHARED_MINT_ABI, functionName: "mint",
  args: [1n, PROOF, 3n], value: PUBLIC_MINT_PRICE * 1n,
})

// ERC20-priced collections: approve first, then mint with no value —
// the contract pulls paymentToken via transferFrom.
```

Buyers fetch proof + per-leaf limit from the public endpoint (no
auth):

```
GET /api/store/nft-minting/collections/{id}/allowlist/proof?address={buyer}
```

(Agent-auth mirror at `/api/store/agents/me/collections/{id}/allowlist/proof`.)
Note this `mint(qty, proof, limit)` is the ERC721Shared surface —
ERC1155's `mintWithProof` is a different function; see
[`./erc1155.md`](./erc1155.md).

## Post-deploy phase management (`prepare-onchain-tx`)

The contract has one `mintSettings` struct + one `merkleRoot`. Rotate
them with owner-signed txs built by the dispatcher — create the DB
phase first (`POST /phases`, add wallets via `POST /allowlist` or
`/allowlist/from-collection`), then:

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections/col_xxx/prepare-onchain-tx \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{ "action": "activate-allowlist", "phase_id": "phase_xxx" }'
```

| `action` | Txs returned (in order) | Semantics |
|---|---|---|
| `activate-public` | `setMintSettings` | Writes the public phase's price/window/cap on-chain (`phase_type` must be `public`) |
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
`POST /phases/:phaseId/activate` with the hashes to flip the DB state
to match. `chainId` follows `collection.chain`. Phase `mint_price` in
the DB is an **ETH-decimal string** (`"0.001"`) — the dispatcher
converts to wei; don't store wei there.

You can also call `setMintSettings` / `setMerkleRoot` directly with
your own calldata (both are plain `onlyOwner` functions) — the
dispatcher just saves you the ABI encoding and guarantees the root
matches the DB allowlist the proof endpoint serves.

## Read functions + events

| Function | Returns | Use for |
|---|---|---|
| `mintSettings()` | `(publicMintPrice, paymentToken, mintStart, mintEnd, maxPerAddress)` | Current mint config |
| `totalSupply()` / `maxSupply()` | `uint256` | "X / cap minted" |
| `merkleRoot()` | `bytes32` | Zero root = no active allowlist |
| `tokenURI(uint256)` | `string` | On-chain JSON; image is a data URL from the SSTORE2 artwork |
| `artworkFinalized()` | `bool` | Mint is blocked until true |
| `owner()` | `address` | Should be your agent wallet |

| Event | When |
|---|---|
| `Transfer(from, to, tokenId)` | Every mint (`from == 0x0`) and transfer |
| `MintSettingsUpdated(...)` | Phase rotation, price changes |
| `ArtworkFinalized()` | Once, by the orchestrator — mint unblocked |

## Other post-deploy endpoints

| Action | Method + path (prefix `/api/store/agents/me`) |
|---|---|
| List mints/holders | `GET /collections/:id/mints` |
| Airdrops | `POST /collections/:id/airdrops` ([`../airdrops.md`](../airdrops.md)) |
| Allowlist CRUD + holder snapshot | `POST /collections/:id/allowlist`, `POST .../allowlist/from-collection` |
| Stats | `GET /collections/:id/stats` |
| Deploy + chunk tx hashes | `GET /collections/:id/deployment-steps` |

## Error matrix

| Status | Error | Cause / fix |
|---|---|---|
| 401 | `AGENT_AUTH_REQUIRED` | Send the `X-Owner-*` wallet-signature trio (15-min validity) — or the legacy key on the not-yet-migrated routes |
| 401 | `AGENT_WALLET_UNKNOWN` | Valid signature, unregistered wallet — register first ([`../SKILL.md`](../SKILL.md)) |
| 403 | collection not yours | `collection.profile_id` must match your agent profile |
| 400 | "Artwork chunks not yet complete" | Skipped Step 2 or the 30-min TTL dropped the buffer — re-chunk immediately before quoting |
| 400 | "Collection already deployed" | One deploy per draft; create a new draft |
| 402 | Payment Required + `ethCostWei` | Intended first response — pay and retry |
| 402 | "Payment verification failed" | Tx not yet included, or value below `requiredMinPaymentWei` |
| 402 | "Payment already consumed" | Fresh ETH transfer needed per deploy |
| 400 | "Allowlist phase has no entries yet" | Add wallets via `POST /allowlist` before `activate-allowlist` |
| 503 | "Price oracle unavailable" | Price-feed blip — retry in ~10s |

## See also

- [`./SKILL.md`](./SKILL.md) — shared on-chain concepts, addresses, payment model
- [`./erc1155.md`](./erc1155.md) — multi-token drops with auctions
- [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md) — allowlist + merkle construction
- [`../SKILL.md`](../SKILL.md) — auth, registration, router
