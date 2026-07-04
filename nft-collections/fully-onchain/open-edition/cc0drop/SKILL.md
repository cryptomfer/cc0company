---
name: cc0company-nft-fully-onchain-open-cc0drop
version: 3.0.0
description: Fully-onchain single-artwork ERC721 open edition — one image shared by every token, stored on-chain via SSTORE2, unlimited unique tokenIds over a mint window (maxSupply 0). Single-payment orchestrated deploy (one ETH transfer does deploy + artwork + finalize). Solidity contract CC0CollectionShared. Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully-onchain cc0drop (ERC721) — open edition

One artwork shared by every minted token, **unlimited unique tokenIds** over a
mint window, artwork stored on-chain via SSTORE2 — a classic open-edition drop
with **one wallet signature** total: the backend orchestrates deploy +
on-chain artwork commit + finalize from a single ETH payment. Every token is a
unique ERC-721 tokenId, but `tokenURI(tokenId)` renders the **same shared
image** — holders get an implicit `#N` (the tokenId) without N distinct
images. No layers, no DNA, no traits.

> **Category vs contract name.** The user-facing category is **cc0drop
> (ERC721)**. The Solidity contract is `CC0CollectionShared` (v3) — that name
> appears only where a contract identifier is technically required (ABI, read
> functions).

**Auth, ETH payment model, chains, `social_links`:** [root router](../../../SKILL.md).
**Rail mechanics** (SSTORE2 economics, 402 flow, `prepare-onchain-tx`):
[rail router](../../SKILL.md). **Open-edition policy** (window semantics, no
finality footgun): [edition router](../SKILL.md). **Not in the SDK** —
[`@cc0company/sdk`](../../../../sdk/SKILL.md) `Cc0Drops` covers the IPFS rail
only; this is raw HTTP/ABI. For a **fixed cap + allowlist** instead, see the
[limited cc0drop leaf](../../limited-edition/cc0drop/SKILL.md).

## What makes this an open edition

`maxSupply: 0` — every mint gets the next tokenId, forever, while the window is
open. The mint window (`mintSettings.mintStart` / `mintEnd`) is the scarcity;
it is **owner-adjustable** after close via `setMintSettings` (no forever-close
finality on this rail).

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

**You are the contract owner.** The factory takes `creator` as an arg and
transfers ownership to it in the constructor — regardless of who paid gas. The
platform wallet only gets the `uploader` role, scoped to `addArtworkChunk` +
`finalizeArtwork` and useless after the seal.

Auth is the wallet-signature trio from the [root router](../../../SKILL.md);
the legacy API key is still accepted during the transition and currently still
required on the not-yet-migrated `POST /collections`, `artwork-chunk`, and
`orchestrate-shared-deploy`.

## The full lifecycle in 5 steps

```
1. Create collection draft (DB row)
   POST /api/store/agents/me/collections
   body: { token_standard: "ERC721Shared", name, symbol, max_supply: 0, ... }
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
    "name": "gm forever",
    "symbol": "GMF",
    "description": "An open edition of a hand-drawn sunrise.",
    "token_standard": "ERC721Shared",
    "chain": "base",
    "max_supply": 0,
    "mint_price": "1000000000000000",
    "payment_token": "0x0000000000000000000000000000000000000000",
    "royalty_bps": 500
  }'
# → { collection: { id: "col_xxx", status: "draft", contract_address: null } }
```

| Field | Format | Notes |
|---|---|---|
| `token_standard` | string | Must be `"ERC721Shared"` |
| `chain` | `base` \| `ethereum` | Factory resolved per chain ([root](../../../SKILL.md)) |
| `mint_price` | string, wei (or token base units) | Public price PER TOKEN |
| `payment_token` | hex address | `0x000…000` = ETH; any ERC20 works (USDC on Base: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) |
| `max_supply` | uint | **`0` = open edition** (unlimited unique tokenIds) |
| `royalty_bps` | uint96 | ERC-2981 secondary royalty; `500` = 5%; recipient defaults to your wallet |

Save `collection.id` for every subsequent step.

## Step 2: Upload the artwork (chunked transit buffer)

Encode the artwork as a base64 data URL (`data:image/png;base64,...`; also
svg+xml, gif, jpeg), slice into chunks of ≤ 50,000 characters, POST **in
order**:

```typescript
import { readFile } from "node:fs/promises"
import { privateKeyToAccount } from "viem/accounts"
import { agentAuthHeaders } from "../examples/agent-sign.mjs"

const account = privateKeyToAccount(process.env.AGENT_PK as `0x${string}`)
const COLLECTION_ID = "col_xxx"

const bytes = await readFile("./gm-forever.png")
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

- Transit-only, **in-memory, 30-minute idle TTL**, never persisted to DB.
  Stall between chunks (or between Step 2 and Step 3) and the buffer drops —
  re-run Step 2 immediately before quoting.
- POST chunks **serially** — the buffer is not concurrency-safe.
- Practical ceiling ~5 MB; deploy cost grows linearly with bytes.

## Step 3: Get the deploy quote (402 challenge)

POST the orchestrator **without** `payment_tx_hash`. For an open edition set
`maxSupply: "0"`:

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections/col_xxx/orchestrate-shared-deploy \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{
    "deploy_params": {
      "name": "gm forever",
      "symbol": "GMF",
      "description": "An open edition of a hand-drawn sunrise.",
      "maxSupply": "0",
      "mintSettings": {
        "publicMintPrice": "1000000000000000",
        "paymentToken": "0x0000000000000000000000000000000000000000",
        "mintStart": 1733000000,
        "mintEnd": 1735000000,
        "maxPerAddress": "0"
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

### `deploy_params` reference (open edition)

| Field | Type | Notes |
|---|---|---|
| `name`, `symbol`, `description` | string | Must match the Step-1 draft; stored in contract storage |
| `maxSupply` | string uint256 | **`"0"` = open edition** (unlimited tokenIds) |
| `mintSettings.publicMintPrice` | string, wei/base units | Price PER MINT |
| `mintSettings.paymentToken` | address | `0x000…000` = ETH; any ERC20 = token-priced |
| `mintSettings.mintStart` / `mintEnd` | unix seconds | Public window (**`0` = unbounded on that side**); rotate post-deploy via `prepare-onchain-tx` |
| `mintSettings.maxPerAddress` | string uint256 | Per-wallet cap; `"0"` = unlimited |
| `withdrawRecipients` | array | Payout split, basis points, must sum to 10000 |
| `royaltyRecipient` / `royaltyBps` | address / uint96 | ERC-2981 |
| `owner` | address | Contract owner — your agent wallet, NOT the platform |
| `initialMerkleRoot` | bytes32 | Zero root = no allowlist; an OE can still gate an early window — see the [limited leaf](../../limited-edition/cc0drop/SKILL.md) |

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

What the orchestrator did: verified the payment (≥ 90% of the re-quote), called
`factory.deployCollection(...)` with you as owner, looped `addArtworkChunk(...)`
over every chunk, called `finalizeArtwork()` (mint is blocked until this — the
collection stays `deploying` until the artwork is sealed), cleared the buffer.

**Idempotency:** one `payment_tx_hash` authorizes exactly one deploy — reuse
returns `402 Payment already consumed`; a collection with a `contract_address`
can't be deployed again.

## Buyer mint (native contract call — no platform intermediary)

An open-edition public mint passes an empty proof and limit `0`:

```typescript
const SHARED_MINT_ABI = [{
  type: "function", name: "mint", stateMutability: "payable",
  inputs: [
    { name: "quantity", type: "uint256" },
    { name: "allowlistProof", type: "bytes32[]" },
    { name: "allowlistLimit", type: "uint256" },
  ], outputs: [],
}] as const

// Public open-edition mint: empty proof, limit 0
await client.writeContract({
  address: COLLECTION, abi: SHARED_MINT_ABI, functionName: "mint",
  args: [1n, [], 0n], value: PUBLIC_MINT_PRICE * 1n,
})

// ERC20-priced collections: approve paymentToken first, then mint with no
// value — the contract pulls via transferFrom.
```

(Allowlist mints — proof + per-leaf limit — are the [limited leaf](../../limited-edition/cc0drop/SKILL.md).)

## Post-deploy window management (`prepare-onchain-tx`)

The contract has one `mintSettings` struct. Re-open, re-price, or close the
window with an owner-signed tx built by the dispatcher (create the DB phase
first, `POST /phases`, then):

```bash
curl -X POST https://cc0.company/api/store/agents/me/collections/col_xxx/prepare-onchain-tx \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{ "action": "activate-public", "phase_id": "phase_xxx" }'
# → transactions: [ { label: "setMintSettings", ... } ]  — sign + broadcast
```

`activate-public` writes `setMintSettings`; `deactivate` / `delete` write a
locked sentinel (price 0, start=end=1) that closes minting. Phase `mint_price`
in the DB is an **ETH-decimal string** (`"0.001"`) — the dispatcher converts to
wei. After the tx confirms, `POST /phases/:phaseId/activate` to flip DB state to
match. The full action table (incl. allowlist actions) is in the
[limited leaf](../../limited-edition/cc0drop/SKILL.md).

## Read functions + events

| Function | Returns | Use for |
|---|---|---|
| `mintSettings()` | `(publicMintPrice, paymentToken, mintStart, mintEnd, maxPerAddress)` | Current mint config |
| `totalSupply()` / `maxSupply()` | `uint256` | Minted count (`maxSupply()` = 0 here) |
| `tokenURI(uint256)` | `string` | On-chain JSON; image is a data URL from the SSTORE2 artwork |
| `artworkFinalized()` | `bool` | Mint is blocked until true |
| `owner()` | `address` | Should be your agent wallet |

`Transfer(0x0, to, tokenId)` fires on every mint; `ArtworkFinalized()` fires
once, from the orchestrator.

## Common errors

| Status | Error | Cause / fix |
|---|---|---|
| 400 | "Artwork chunks not yet complete" | Skipped Step 2 or the 30-min TTL dropped the buffer — re-chunk immediately before quoting |
| 400 | "Collection already deployed" | One deploy per draft; create a new draft |
| 402 | Payment Required + `ethCostWei` | Intended first response — pay and retry |
| 402 | "Payment verification failed" | Tx not yet included, or value below `requiredMinPaymentWei` |
| 402 | "Payment already consumed" | Fresh ETH transfer needed per deploy |
| 503 | "Price oracle unavailable" | Price-feed blip — retry in ~10s |

Auth errors (`401 AGENT_AUTH_REQUIRED` / `AGENT_WALLET_UNKNOWN`) and the
payment-model detail are in the [root router](../../../SKILL.md).

## Related

- [`../../limited-edition/cc0drop/SKILL.md`](../../limited-edition/cc0drop/SKILL.md) — fixed cap + allowlist
- [`../erc1155/SKILL.md`](../erc1155/SKILL.md) — multi-token open edition (auctions available)
- [`../SKILL.md`](../SKILL.md) — open-edition policy on this rail
- [`../../SKILL.md`](../../SKILL.md) — rail router: SSTORE2, 402 uploads, deploy patterns
- [`../../../SKILL.md`](../../../SKILL.md) — root: auth, ETH payment, chains, `social_links`
- [`../../../airdrops.md`](../../../airdrops.md) — airdrops (count toward supply)
