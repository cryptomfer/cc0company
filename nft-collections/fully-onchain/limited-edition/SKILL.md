---
name: cc0company-nft-fully-onchain-limited
version: 3.0.0
description: Limited editions on the fully-onchain rail — fixed-supply drops with artwork stored on-chain via SSTORE2, plus allowlist gating and (erc1155 only) 1/1 English auctions. Pick contract family (cc0drop ERC721 single-artwork, or erc1155 multi-token). Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully on-chain — limited editions

A limited edition caps supply at a fixed **N** and usually gates part of the
window with an allowlist. On this rail the artwork lives on-chain (SSTORE2)
forever. This is the counterpart to the [open-edition router](../open-edition/SKILL.md)
(time-window scarcity, no cap).

**Auth, ETH payment model, chains, and `social_links` live in the
[root router](../../SKILL.md).** Rail mechanics live in the
[rail router](../SKILL.md). **The canonical merkle/allowlist recipe lives once
in [`../../allowlist.md`](../../allowlist.md)** — leaf format, tree
convention, builders, proof endpoints, and the `from-collection` holder
snapshot. The leaves link to it; they don't restate the algorithm.

## Pick your contract

| | **cc0drop (ERC721)** | **erc1155** |
|---|---|---|
| Leaf | [`cc0drop/SKILL.md`](cc0drop/SKILL.md) | [`erc1155/SKILL.md`](erc1155/SKILL.md) |
| Contract | `CC0CollectionShared` (v3) | `CC0Collection1155` (v12) |
| Where the cap lives | `maxSupply` baked at deploy, immutable | per-token `max_supply` on `create-and-upload` |
| Cap semantics | hard cap on unique tokenIds; `0` = uncapped | `edition_type: "limited_edition"` + `max_supply: "N"`; `"0"` = open |
| Allowlist | `initialMerkleRoot` at deploy, or `setMerkleRoot` later | per-token merkle root via the 3-tx phase flow |
| Auctions | No | Yes — `edition_type: "auction"` = 1/1 English |
| Deploy | one 402-quoted ETH payment, server-orchestrated | agent signs factory tx, then 402 per token |

## max_supply semantics

- **cc0drop (ERC721):** `maxSupply` is baked at deploy (constructor arg) and
  is **immutable** post-deploy. Each token is a unique tokenId; all render the
  same shared on-chain artwork. `0` = uncapped (that's the
  [open edition](../open-edition/cc0drop/SKILL.md)).
- **erc1155:** the cap is **per token** — `edition_type: "limited_edition"` +
  `max_supply: "N"` (fixed) on `create-and-upload`. `"0"` on the same field is
  an [open edition](../open-edition/erc1155/SKILL.md). One edition type per
  token; a collection can mix limited, open, and auction tokens.

Airdrops and owner-mints **count toward caps** — reserve headroom. Airdrop
flows: [`../../airdrops.md`](../../airdrops.md).

## Allowlists on this rail

Both families consume the same merkle convention (leaf =
`keccak256(abi.encodePacked(address, uint256 maxQty))`, OZ sorted-pair tree)
from [`../../allowlist.md`](../../allowlist.md). Where the root lives differs:

- **cc0drop (ERC721):** one `merkleRoot` per contract — bake `initialMerkleRoot`
  at deploy, or rotate later with `setMerkleRoot` via the phase dispatcher
  (`activate-allowlist` / `sync-allowlist`). The backend regenerates the root
  from your DB entries.
- **erc1155:** a merkle root **per tokenId**, written by the 3-tx
  `prepare-onchain-tx` flow (`setTokenMerkleRoot`). You supply the root
  yourself (reuse the DB-generated one from the allowlist endpoints).

The `from-collection` holder snapshot (allowlist every holder of any Base or
Ethereum collection, cross-chain, Alchemy-sourced, 25k cap) is documented in
[`../../allowlist.md`](../../allowlist.md).

## 1/1 auctions (erc1155 only)

`edition_type: "auction"` on an erc1155 token is a supply of exactly **1**,
sold by on-chain English auction: reserve price, bids held by the contract,
permissionless settle after the duration. The cc0drop (ERC721) family has no
auction surface. Full flow: [`erc1155/SKILL.md`](erc1155/SKILL.md).

## Related

- [`cc0drop/SKILL.md`](cc0drop/SKILL.md) — single-artwork ERC721, fixed cap + allowlist
- [`erc1155/SKILL.md`](erc1155/SKILL.md) — multi-token, capped token + allowlist + auctions
- [`../../allowlist.md`](../../allowlist.md) — **the** merkle/allowlist recipe + holder snapshot
- [`../SKILL.md`](../SKILL.md) — rail router: SSTORE2, 402 uploads, deploy patterns
- [`../../SKILL.md`](../../SKILL.md) — root: auth, ETH payment, chains, `social_links`
- [`../open-edition/SKILL.md`](../open-edition/SKILL.md) — the uncapped counterpart
- [`../../airdrops.md`](../../airdrops.md) — airdrops (count toward caps)
