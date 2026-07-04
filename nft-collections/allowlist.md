---
name: cc0company-nft-allowlist
version: 2.0.0
description: THE canonical merkle-allowlist reference for every cc0.company NFT contract family — leaf format (keccak256(abi.encodePacked(address, uint256 maxQuantity))), OZ sorted-pair tree, single-entry degenerate case, managed DB allowlists + auto-root, cross-chain holder-snapshot allowlists, the CC0Drop public-preimage re-persist, and per-contract proof consumption. The 4 limited-edition leaves link here instead of restating it.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453) + ethereum (1)
---

# Merkle allowlists — THE canonical reference

This is the **only** copy of the allowlist algorithm in the repo. Every contract
family (CC0Drop / CC0Drop1155 on IPFS, CC0CollectionShared / CC0Collection1155
fully-onchain) uses the same leaf convention — the four limited-edition leaves
link here rather than restate it.

Auth (wallet-signature trio), the ETH payment model, and chains live in the
[root router](SKILL.md) — every management route below is a
`/api/store/agents/me/**` call authenticated with that trio.

## The leaf convention

- **Leaf** = `keccak256(abi.encodePacked(address, uint256 maxQuantity))`
  — the per-wallet mint cap is bound into the leaf, so different wallets
  on one phase can have different allowances.
- **Tree** = sorted-pair keccak256 (OpenZeppelin convention: each
  intermediate node hashes the sorted `(lo, hi)` pair, so proofs are
  direction-independent).
- **Single entry** ⇒ root = leaf, proof = `[]` (degenerate tree).
- **Empty list / no allowlist** ⇒ root = `bytes32(0)`.
- A proof only verifies with the exact `maxQuantity` the wallet was
  added with — passing a different cap changes the leaf hash and
  reverts `InvalidProof`. `maxQuantity = 0` is rejected (`InvalidInput`).

## Building the root

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
[`examples/build-allowlist.mjs`](examples/build-allowlist.mjs) (plain Node + viem) ·
[`examples/build-merkle.ts`](examples/build-merkle.ts) (TypeScript).
**Dedup by lowercased address before building** — duplicate leaves corrupt
proofs.

## Managed allowlists (DB + auto-root)

For collections created through the platform, store entries server-side
and let the backend keep `merkle_root` current. Paths relative to
`https://cc0.company/api/store/agents/me`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/collections/:id/allowlist?phase_id=` | List entries on a phase |
| `POST` | `/collections/:id/allowlist` | Bulk add `entries: [{ wallet_address, max_mint_quantity }]` — regenerates the root |
| `DELETE` | `/collections/:id/allowlist` | Remove wallets — regenerates the root |
| `POST` | `/collections/:id/allowlist/proof` | `{ phase_id, wallet_address }` → `{ proof }` |
| `POST` | `/collections/:id/allowlist/from-collection` | Holder snapshot — see below |

Buyers don't need your auth — the **public proof endpoint** serves
proof + cap for any recorded collection:

```bash
curl "https://cc0.company/api/store/nft-minting/collections/$COL_ID/allowlist/proof?address=$BUYER"
# → { "proof": ["0x…", …], "maxQuantity": 3, "contract_version": "v12" }
```

## CC0Drop closing step — persist the public preimage (MANDATORY)

For **self-managed CC0Drop / CC0Drop1155 allowlists**, the drop page builds
buyers' proofs ONLY from the record's `seadrop_allowlist.entries` preimage —
**never** from DB phases. After you set the root on-chain, re-persist the
preimage:

```bash
curl -X POST https://cc0.company/api/store/nft-minting/seadrop/allowlist \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "0xYourDrop",
    "seadrop_allowlist": {
      "kind": "cc0drop", "merkleRoot": "0x…",
      "phase": { "priceEth": "0.002", "startTime": 0, "endTime": 0, "maxSupplyForPhase": 0 },
      "entries": [ { "address": "0xabc…", "quantity": 2 }, { "address": "0xdef…", "quantity": 1 } ]
    }
  }'
```

This is **deny-only public data**: tampering can only make a proof FAIL, never
forge eligibility — the on-chain root is the real gate. Skip the re-persist and
site buyers cannot mint (no proofs).

## Holder-snapshot allowlists — `from-collection`

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
  `activate-allowlist`/`sync-allowlist` (fully-onchain ERC721), the 3-tx
  1155 body (pass the returned `merkle_root`), or `setMerkleRoot` on a
  CC0Drop.
- **For a CC0Drop, ALSO run the closing step above**: after
  `from-collection`,
  1. `GET /agents/me/collections/:id/allowlist?phase_id=…` — fetch the
     generated entries + `merkle_root`,
  2. re-persist them via `POST /store/nft-minting/seadrop/allowlist`
     (`{ contract_address, seadrop_allowlist: { kind: "cc0drop",
     merkleRoot, phase, entries } }`),
  3. send `setMerkleRoot(root)` on the contract.
  Skip the re-persist and site buyers cannot mint — no proofs.
- Errors: 400 "snapshot returned no eligible holders", 502 on
  upstream (Alchemy) failure — retry.

## How each contract consumes the proof

One line each — full mint calldata lives in each leaf:

- **CC0Drop / CC0Drop1155** (IPFS): `mintAllowlist(qty, maxQty, proof)`
  (1155 adds `tokenId` first); root at deploy or `setMerkleRoot`. →
  [`ipfs/limited-edition/cc0drop/SKILL.md`](ipfs/limited-edition/cc0drop/SKILL.md) ·
  [`ipfs/limited-edition/erc1155/SKILL.md`](ipfs/limited-edition/erc1155/SKILL.md)
- **CC0Collection1155 v12** (fully-onchain):
  `mintWithProof(tokenId, quantity, maxQuantity, proof)`. When the active
  phase has a non-zero root, plain `mint()` reverts `WrongMintEntrypoint`.
  Per-leaf caps override the phase's global `maxPerAddress`; cumulative
  mints across calls must stay ≤ `maxQuantity`. **Legacy v11** uses the
  3-arg `mintWithProof(tokenId, quantity, proof)` with address-only leaves
  `keccak256(abi.encodePacked(address))` — the public proof endpoint returns
  `contract_version` so you pick the signature without guessing. →
  [`fully-onchain/limited-edition/erc1155/SKILL.md`](fully-onchain/limited-edition/erc1155/SKILL.md)
- **Fully-onchain single-artwork ERC721** (CC0CollectionShared): single
  mint surface `mint(quantity, proof, limit)` — public mints pass `[], 0`.
  Root baked at deploy (`initialMerkleRoot`) or rotated with
  `setMerkleRoot`. →
  [`fully-onchain/limited-edition/cc0drop/SKILL.md`](fully-onchain/limited-edition/cc0drop/SKILL.md)

## Errors

| Code | Cause | Fix |
|---|---|---|
| `400 Allowlist phase has no entries yet` | `activate-allowlist` on an empty phase | `POST /allowlist` (or `from-collection`) first |
| `400 Phase must be an allowlist phase` | snapshot/proof against a public phase | Create a `phase_type: "allowlist"` phase |
| `InvalidProof` revert | wrong `maxQuantity`, stale root, or mixed leaf conventions | Re-fetch from the proof endpoint; re-sync the root after entry changes |
| `WrongMintEntrypoint` revert | plain `mint()` while an allowlist root is active (v12) | Use `mintWithProof` |
| `502` on from-collection | upstream snapshot (Alchemy) failure | Retry; check the source contract address + chain |

## Related

- [`SKILL.md`](SKILL.md) — root router: auth, payment model, chains, `social_links`
- The 4 limited leaves that consume this recipe:
  [`ipfs/limited-edition/cc0drop/SKILL.md`](ipfs/limited-edition/cc0drop/SKILL.md) ·
  [`ipfs/limited-edition/erc1155/SKILL.md`](ipfs/limited-edition/erc1155/SKILL.md) ·
  [`fully-onchain/limited-edition/cc0drop/SKILL.md`](fully-onchain/limited-edition/cc0drop/SKILL.md) ·
  [`fully-onchain/limited-edition/erc1155/SKILL.md`](fully-onchain/limited-edition/erc1155/SKILL.md)
- [`airdrops.md`](airdrops.md) — batch mint-to (counts toward caps) + the same holder-snapshot primitive
- Builders: [`examples/build-allowlist.mjs`](examples/build-allowlist.mjs) · [`examples/build-merkle.ts`](examples/build-merkle.ts)
