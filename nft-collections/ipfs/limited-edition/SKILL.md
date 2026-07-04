---
name: cc0company-nft-ipfs-limited
version: 3.0.0
description: Limited-edition policy on the IPFS rail — a fixed-supply drop (max_supply N) usually gated by a per-wallet merkle allowlist. Covers what "limited" means on CC0Drop (ERC721) vs CC0Drop1155 (cap semantics, allowlist wiring), then routes to the two leaves. The canonical merkle recipe is NOT restated here — it lives in allowlist.md.
homepage: https://cc0.company
api_base: https://cc0.company/api
---

# IPFS Limited Editions — policy router

A **limited edition** caps supply at a fixed **N** and usually gates the
mint (or a lower-priced early window) behind a per-wallet merkle
allowlist. Both contracts on this rail take the cap in the constructor.

> Shared IPFS mechanics (pin, artifacts, 1-tx deploy skeleton, record,
> minting, owner lifecycle, allowlist **persistence** step) live in the
> rail router: [`../SKILL.md`](../SKILL.md). Auth / ETH payment / chains /
> `social_links`: the [root router](../../SKILL.md).
> **The canonical merkle recipe** (leaf format, tree convention,
> single-entry case, builders, holder snapshots) lives in ONE place:
> [`../../allowlist.md`](../../allowlist.md). The leaves link to it — this
> router does not restate the algorithm.

## Cap semantics per contract

| | Contract | Where the cap lives | Semantics |
|---|---|---|---|
| **cc0drop (ERC721)** | CC0Drop | constructor `maxSupply` | `N` = hard cap on unique tokenIds. **No setter** — fixed at deploy. `0` would mean open. |
| **erc1155** | CC0Drop1155 | per edition — `EditionInit.maxSupply` (deploy or `createEdition`) | `setMaxSupply(tokenId, newMax)` can **shrink, never raise** once minted. Capped editions are **exempt** from the open-edition finality rule (the cap protects holders instead). |

`ownerMint` / airdrops **count toward the cap** — reserve headroom.
Airdrop flows: [`../../airdrops.md`](../../airdrops.md).

## Allowlist wiring (both leaves)

The mechanism is the same everywhere; only the on-chain consumption
differs slightly:

- Build the root with the canonical recipe:
  [`../../allowlist.md`](../../allowlist.md).
- Set it at deploy (`initialMerkleRoot`) or rotate with `setMerkleRoot`
  (1155 adds `tokenId` first).
- **Persist the public preimage** via
  `POST /api/store/nft-minting/seadrop/allowlist` (`kind: "cc0drop"`) so
  the drop page can build buyers' proofs — the page reads ONLY that
  preimage, never DB phases. Recipe + body in the rail router:
  [`../SKILL.md`](../SKILL.md).
- Buyers mint with `mintAllowlist(qty, maxQty, proof)` (1155 adds
  `tokenId` first).

Holder-snapshot allowlists (allowlist every holder of any collection,
cross-chain) are a DB-phase feature documented in
[`../../allowlist.md`](../../allowlist.md); on this rail the mandatory
closing step is the same `seadrop/allowlist` re-persist above.

## The two leaves

| | Contract | Cap | Numbered "#N" | Leaf |
|---|---|---|---|---|
| **cc0drop (ERC721)** | CC0Drop | fixed N unique tokenIds | optional — numbered metadata works for capped drops too | [`cc0drop/SKILL.md`](cc0drop/SKILL.md) |
| **erc1155** | CC0Drop1155 | capped edition, shrink-only | n/a — copies share one tokenId | [`erc1155/SKILL.md`](erc1155/SKILL.md) |

## Related

- Rail mechanics: [`../SKILL.md`](../SKILL.md)
- Canonical merkle recipe + holder snapshots: [`../../allowlist.md`](../../allowlist.md)
- Open (uncapped) counterpart: [`../open-edition/SKILL.md`](../open-edition/SKILL.md)
- Root router (auth/payment/chains): [`../../SKILL.md`](../../SKILL.md)
- Airdrops: [`../../airdrops.md`](../../airdrops.md)
