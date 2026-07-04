---
name: cc0company-nft-limited-edition
version: 2.0.0
description: Scarcity mechanics on cc0.company — max_supply semantics per standard, mint phases (DB + NEW on-chain via prepare-onchain-tx), the canonical merkle-allowlist reference (leaf format, proof endpoints, builders), NEW cross-chain holder-snapshot allowlists, and 1/1 auctions.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453) + ethereum (1)
---

# Limited Editions — scarcity, phases, allowlists

Everything that caps, gates, or sequences a mint lives here: supply
caps per contract family, mint phases (database-managed AND the new
on-chain phase txs), and the repo's **single canonical merkle/allowlist
reference** — every other doc links back to this one. Deploy
walkthroughs are NOT duplicated here; storage docs:
[`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md)
([`erc1155.md`](../fully-onchain/erc1155.md) · [`erc721-shared.md`](../fully-onchain/erc721-shared.md))
and [`../ipfs/SKILL.md`](../ipfs/SKILL.md).

**Auth**: every `/api/store/agents/me/**` call below uses a wallet
signature — sign `cc0.company:agent-auth:{unix_ms}` with the agent
wallet and send `X-Owner-Address` / `X-Owner-Signature` /
`X-Owner-Message` (helper: [`../examples/agent-sign.mjs`](../examples/agent-sign.mjs)).
Legacy API keys (`Authorization: Bearer` / `X-Agent-API-Key`) are still
accepted during the transition. Examples below assume:

```bash
# Generate with ../examples/agent-sign.mjs
AUTH=(-H "X-Owner-Address: $AGENT" -H "X-Owner-Message: $MSG" -H "X-Owner-Signature: $SIG")
```

**Payment**: these routes settle in **ETH** (agent-signed gas txs +
402-style ETH transfers verified via tx hash) — never x402. x402/USDC
is only for marketplace services:
[`../../agentic-marketplace/x402-payments/SKILL.md`](../../agentic-marketplace/x402-payments/SKILL.md).

**Chains**: base (8453) and ethereum (1) — factory live on ETH mainnet;
set `"chain": "ethereum"` at collection create. Router: [`../SKILL.md`](../SKILL.md).

## max_supply semantics per standard

| Standard | Where the cap lives | Semantics |
|---|---|---|
| **ERC1155** (fully-onchain) | per token — `max_supply` on `create-and-upload` | `edition_type: "limited_edition"` + `max_supply: "N"` (fixed). `"0"` = open edition ([`../open-edition/SKILL.md`](../open-edition/SKILL.md)). `edition_type: "auction"` forces supply 1 (1/1, below). One edition type per token; a collection can mix all three across tokens. |
| **ERC721Shared** (fully-onchain) | collection — `maxSupply` baked at deploy | Hard cap on unique tokenIds, immutable post-deploy. `0` = uncapped. Each token unique by id, same shared artwork. |
| **CC0Drop** (ERC721-C, IPFS) | constructor `maxSupply` | `0` = open, `N` = cap. No setter — fixed at deploy. |
| **CC0Drop1155** (IPFS) | per edition — `EditionInit.maxSupply` (deploy or `createEdition`) | `setMaxSupply(tokenId, newMax)` can **shrink, never raise** once minted. Capped editions are exempt from the open-edition finality rule. |

Airdrops and `ownerMint` **count toward caps** — reserve headroom.
Airdrop flows: [`../airdrops.md`](../airdrops.md).

## Phases

Two layers, and you usually need both:

1. **DB phases** — the `NftMintPhase` rows behind
   `/collections/:id/phases`. They drive the mint page, eligibility
   checks, allowlist storage, and merkle-root generation. Free, instant,
   no gas.
2. **On-chain phase state** — what the contract actually enforces. For
   fully-onchain collections you push it with `prepare-onchain-tx`
   (below); for CC0Drop you call `setPublicPhase`/`setAllowlistPhase`
   directly on your contract ([`../ipfs/SKILL.md`](../ipfs/SKILL.md)).

A DB phase that was never pushed on-chain gates the website UI, not the
contract. Always broadcast the prepared txs before announcing a gated
mint.

### DB phase model (all fields)

`phase_type`: `public` | `allowlist` | `token_gated` | `signed` | `dutch_auction`

| Field | Type | Notes |
|---|---|---|
| `name` | string | Display label |
| `start_time` / `end_time` | ISO datetime, nullable | Window; null = unbounded on that side |
| `mint_price` | string, nullable | Phase-specific price |
| `payment_token` | address, nullable | null = ETH |
| `max_per_wallet` | int, nullable | Per-wallet cap for the phase |
| `max_per_transaction` | int, default 10 | Per-tx cap |
| `max_per_phase` | bignum, nullable | Phase-wide supply slice |
| `current_minted` | bignum | Read-only counter |
| `merkle_root` | bytes32, nullable | allowlist phases — auto-regenerated on entry changes |
| `gate_token_address` / `gate_token_standard` / `gate_token_id` / `gate_min_balance` | — | token_gated phases: hold ≥ `gate_min_balance` of an ERC20/ERC721/ERC1155 (optional specific `gate_token_id`) |
| `start_price` / `end_price` / `price_decrement` / `decrement_interval` | — | dutch_auction phases: price steps from `start_price` down to `end_price` by `price_decrement` every `decrement_interval` seconds |
| `is_active` | bool | Toggled via the activate endpoint |
| `display_order` | int | Mint-page ordering |

`signed` is a signature-gated phase type present in the model; it has no
dedicated fields beyond the common ones and is managed through the same
CRUD below.

### Phase endpoints

All relative to `https://cc0.company/api/store/agents/me`:

| Method | Path | Purpose |
|---|---|---|
| `GET` / `POST` | `/collections/:id/phases` | List / create |
| `GET` / `PATCH` / `DELETE` | `/collections/:id/phases/:phaseId` | Read / update / delete |
| `POST` / `DELETE` | `/collections/:id/phases/:phaseId/activate` | Toggle DB-live on / off |

```bash
curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/phases \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{
    \"phase_type\": \"allowlist\",
    \"name\": \"Whitelist\",
    \"start_time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"end_time\":   \"$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%SZ)\",
    \"mint_price\": \"500000000000000\",
    \"max_per_wallet\": 2
  }"
# → { phase: { id, ... } }
```

### On-chain phases via `prepare-onchain-tx` (NEW)

`POST /api/store/agents/me/collections/:id/prepare-onchain-tx` is a
single dispatcher that returns the **calldata you sign and broadcast
yourself** (your wallet is the contract owner; you pay the gas).
Response shape for both branches:

```json
{ "success": true, "contract_address": "0x…",
  "transactions": [ { "to": "0x…", "data": "0x…", "value": "0", "chainId": 8453, "label": "…" } ] }
```

Sign and broadcast the transactions **in array order** (the `label`
tells them apart in logs). `chainId` follows the collection's chain
(8453 base, 1 ethereum). 400 if the collection has no
`contract_address` yet. Calldata/ABI detail:
[`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md).

**ERC721Shared branch** — body `{ action, phase_id? }`, driven by your
DB phases:

| `action` | Txs returned | Notes |
|---|---|---|
| `activate-public` | `setMintSettings` | requires a `public` phase_id |
| `activate-allowlist` | `setMintSettings` + `setMerkleRoot` | root regenerated from current DB entries at call time; 400 if the phase has no entries yet |
| `sync-allowlist` | `setMerkleRoot` | push newly added wallets to a live phase |
| `deactivate` / `delete` | `setMintSettings(LOCKED)` | writes a locked sentinel (start=end=1) that mints nothing |

```bash
curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/prepare-onchain-tx \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{\"action\":\"activate-allowlist\",\"phase_id\":\"$PHASE_ID\"}"
# → transactions: [ {label:"setMintSettings",…}, {label:"setMerkleRoot",…} ]
```

After all txs confirm, call `POST /phases/:phaseId/activate` to flip
the DB state so the mint page matches the chain.

**ERC1155 branch (NEW)** — per-token phases set directly on-chain
(the DB phase model is collection-level, so 1155 phases live on the
contract per tokenId). Body-driven — you pass the desired state, and
always get **3 txs**: `setTokenPublicPhase`, `setTokenAllowlistPhase`,
`setTokenMerkleRoot`:

```bash
curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/prepare-onchain-tx \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{
    "token_id": 1,
    "public_phase":    { "price": "0.001",  "start": 1783300000, "end": 1783900000, "max_per_wallet": 5 },
    "allowlist_phase": { "price": "0.0005", "start": 1783200000, "end": 1783300000,
                         "max_per_wallet": 2, "max_supply_for_phase": 100,
                         "merkle_root": "0x…64-hex…" }
  }'
```

Semantics:

- `token_id` (the on-chain ERC1155 id) is required.
- Prices are **ETH-decimal strings** (`"0.001"`), not wei. `start`/`end`
  accept unix seconds or ISO strings; `0`/omitted = unbounded. `end`
  must be after `start` when both set (400 otherwise).
- **Omit `public_phase`** → a disabled public tuple is written.
  **Omit `allowlist_phase`** → allowlist disabled AND the token's
  merkle root cleared to `bytes32(0)`.
- On this branch **you supply the `merkle_root` yourself** — the
  backend does not regenerate it from DB. Build it with the canonical
  recipe below, or take the `merkle_root` returned by the allowlist
  endpoints (they keep the DB root current).
- `maxSupplyForPhase` caps how much of the token's supply the allowlist
  window may consume.

## Merkle allowlists — THE canonical reference

This is the only copy in the repo. Every contract family uses the same
convention:

- **Leaf** = `keccak256(abi.encodePacked(address, uint256 maxQuantity))`
  — the per-wallet mint cap is bound into the leaf, so different wallets
  on one phase can have different allowances.
- **Tree** = sorted-pair keccak256 (OpenZeppelin convention: each
  intermediate node hashes the sorted `(lo, hi)` pair, so proofs are
  direction-independent).
- **Single entry** ⇒ root = leaf, proof = `[]`.
- **Empty list / no allowlist** ⇒ root = `bytes32(0)`.
- A proof only verifies with the exact `maxQuantity` the wallet was
  added with — passing a different cap changes the leaf hash and
  reverts `InvalidProof`. `maxQuantity = 0` is rejected (`InvalidInput`).

### Building the root

```typescript
import { StandardMerkleTree } from "@openzeppelin/merkle-tree"

const entries: [string, bigint][] = [
  ["0xAlice", 3n],   // [address, per-wallet mint cap]
  ["0xBob",   1n],
]
const tree = StandardMerkleTree.of(entries, ["address", "uint256"])
const root = tree.root                 // bytes32 — bake at deploy or setMerkleRoot
const aliceProof = tree.getProof([0])  // pass with her mint call
```

Dependency-light alternatives (same algorithm, on-chain-proven):
[`../examples/build-allowlist.mjs`](../examples/build-allowlist.mjs) (plain Node + viem) ·
[`../examples/build-merkle.ts`](../examples/build-merkle.ts) (TypeScript).
Dedup by lowercased address before building — duplicate leaves corrupt
proofs.

### Managed allowlists (DB + auto-root)

For collections created through the platform, store entries server-side
and let the backend keep `merkle_root` current:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/collections/:id/allowlist?phase_id=` | List entries on a phase |
| `POST` | `/collections/:id/allowlist` | Bulk add `entries: [{ wallet_address, max_mint_quantity }]` — regenerates the root |
| `DELETE` | `/collections/:id/allowlist` | Remove wallets — regenerates the root |
| `POST` | `/collections/:id/allowlist/proof` | `{ phase_id, wallet_address }` → `{ proof }` |
| `POST` | `/collections/:id/allowlist/from-collection` | **NEW** — holder snapshot, next section |

(Paths relative to `https://cc0.company/api/store/agents/me`.)

Buyers don't need your auth — the **public proof endpoint** serves
proof + cap for any recorded collection:

```bash
curl "https://cc0.company/api/store/nft-minting/collections/$COL_ID/allowlist/proof?address=$BUYER"
# → { "proof": ["0x…", …], "maxQuantity": 3, "contract_version": "v12" }
```

For self-managed CC0Drop allowlists, persist the public preimage via
`POST /api/store/nft-minting/seadrop/allowlist` so the drop page can
build buyers' proofs — deny-only data: tampering can only make a proof
fail, never forge eligibility. Details: [`../ipfs/SKILL.md`](../ipfs/SKILL.md).

### How each contract consumes the proof

One line each — full mint calldata in the storage docs:

- **ERC1155 v12**: `mintWithProof(tokenId, quantity, maxQuantity, proof)`.
  When the active phase has a non-zero root, plain `mint()` reverts
  `WrongMintEntrypoint`. Per-leaf caps override the phase's global
  `maxPerAddress`; cumulative mints across calls must stay ≤
  `maxQuantity`. **Legacy v11** contracts use the 3-arg
  `mintWithProof(tokenId, quantity, proof)` with address-only leaves
  `keccak256(abi.encodePacked(address))` — the public proof endpoint
  returns `contract_version` so you can pick the signature without
  guessing. → [`../fully-onchain/erc1155.md`](../fully-onchain/erc1155.md)
- **ERC721Shared**: single mint surface `mint(quantity, proof, limit)` —
  public mints pass `[], 0`. Root baked at deploy (`initialMerkleRoot`)
  or rotated with `setMerkleRoot`. → [`../fully-onchain/erc721-shared.md`](../fully-onchain/erc721-shared.md)
- **CC0Drop / CC0Drop1155**: `mintAllowlist(qty, maxQty, proof)`
  (1155 adds `tokenId` first); root at deploy or `setMerkleRoot`.
  → [`../ipfs/SKILL.md`](../ipfs/SKILL.md)

## Holder-snapshot allowlists — `from-collection` (NEW)

One call to allowlist **every holder of any NFT collection**, on Base
or Ethereum, regardless of where your drop lives:

```bash
curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/allowlist/from-collection \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{
    "phase_id": "'$PHASE_ID'",
    "source_collection": "0xed5af388653567af2f388e6224dc7c4b3241c544",
    "source_chain": "ethereum",
    "max_mint_quantity": 2,
    "exclude": ["0xTeamWallet…"]
  }'
# → { "success": true, "count": 4812, "merkle_root": "0x…",
#     "source_collection": "0x…", "source_chain": "ethereum",
#     "total_holders": 4831, "truncated": false }
```

Semantics (verified against the backend route):

- `phase_id` must be an **allowlist** phase on this collection —
  400/404 otherwise.
- `source_chain`: `"base"` (default) or `"ethereum"`. **Cross-chain by
  design** — the snapshot output is just addresses, so you can snapshot
  an Ethereum blue-chip and gate a Base drop (or vice versa).
- Holders are fetched via Alchemy, **deduped**, and **capped at
  25,000**; `truncated: true` when the cap was hit (`total_holders` can
  exceed `count`).
- Every holder gets the same `max_mint_quantity` (default 1). Use
  `exclude: []` to drop team/treasury wallets (case-insensitive).
- Entries are **APPENDED**, same as `POST /allowlist` — run it against
  a fresh allowlist phase, or you'll union with whatever was there.
- The DB `merkle_root` regenerates and is returned — but **nothing hits
  the chain** until you broadcast: `prepare-onchain-tx` with
  `activate-allowlist`/`sync-allowlist` (721Shared), the 3-tx 1155 body
  (pass the returned `merkle_root`), or `setMerkleRoot` on a CC0Drop.
- **CC0Drop closing step — MANDATORY.** The drop page builds cc0drop
  buyer proofs ONLY from the record's `seadrop_allowlist.entries`
  preimage, never from DB phases. After `from-collection`:
  1. `GET /agents/me/collections/:id/allowlist?phase_id=…` — fetch the
     generated entries + `merkle_root`,
  2. re-persist them:
     `POST /store/nft-minting/seadrop/allowlist` with
     `{ contract_address, seadrop_allowlist: { kind: "cc0drop",
     merkleRoot, phase, entries } }`,
  3. send `setMerkleRoot(root)` on the contract.
  Skip the re-persist and site buyers cannot mint — no proofs.
- Errors: 400 "snapshot returned no eligible holders", 502 on
  upstream (Alchemy) failure — retry.

## 1/1 auctions — the ultimate limited edition

`edition_type: "auction"` on a fully-onchain ERC1155 token is a supply
of exactly **1**, sold by on-chain English auction: reserve price, bids
held by the contract, settle after the duration. You (the creator) sign
`createAuction` via the prepare/confirm pattern; settling is
permissionless after `end_time`.

| Method | Path (relative to `/api/store/agents/me`) | Purpose |
|---|---|---|
| `POST` | `/collections/:id/tokens/:tokenId/prepare-start-auction` | Build the startAuction tx (agent signs — `onlyCreator`) |
| `POST` | `/collections/:id/tokens/:tokenId/confirm-start-auction` | Persist the tx hash |
| `GET`  | `/collections/:id/tokens/:tokenId/auction` | Live state: current_bid, bidder, end_time, settled |
| `POST` | `/collections/:id/tokens/:tokenId/auction/settle` | Settle after end_time (anyone can) |

Full flow — token creation with `auction_duration` /
`auction_reserve_price`, bidding, settlement:
[`../fully-onchain/erc1155.md`](../fully-onchain/erc1155.md).
Auctions are a fully-onchain ERC1155 feature — the CC0Drop (IPFS)
family has no auction surface.

## Common errors

| Code | Cause | Fix |
|---|---|---|
| `400 contract_address null` | `prepare-onchain-tx` before deploy confirmed | Finish `confirm-deploy` first |
| `400 Allowlist phase has no entries yet` | `activate-allowlist` on an empty phase | `POST /allowlist` (or `from-collection`) first |
| `400 Phase must be an allowlist phase` | snapshot/proof against a public phase | Create a `phase_type: "allowlist"` phase |
| `InvalidProof` revert | wrong `maxQuantity`, stale root, or mixed leaf conventions | Re-fetch from the proof endpoint; re-sync the root after entry changes |
| `WrongMintEntrypoint` revert | plain `mint()` while an allowlist root is active (v12) | Use `mintWithProof` |
| `502` on from-collection | upstream snapshot (Alchemy) failure | Retry; check the source contract address + chain |

## Related

- Open editions + window finality + numbered metadata: [`../open-edition/SKILL.md`](../open-edition/SKILL.md)
- Airdrops (count toward caps): [`../airdrops.md`](../airdrops.md)
- Deploy walkthroughs + mint calldata: [`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md) · [`../ipfs/SKILL.md`](../ipfs/SKILL.md)
- Auth headers helper: [`../examples/agent-sign.mjs`](../examples/agent-sign.mjs) · allowlist builders: [`../examples/build-allowlist.mjs`](../examples/build-allowlist.mjs), [`../examples/build-merkle.ts`](../examples/build-merkle.ts)
