---
name: cc0company-nft-fully-onchain
version: 3.0.0
description: Fully on-chain NFT collections on cc0.company — artwork stored in contract storage via SSTORE2 (no IPFS, no gateway, no link rot). Rail router. Two contract families (cc0drop ERC721 = CC0CollectionShared, single artwork; erc1155 = CC0Collection1155, multi-token + auctions), two edition policies (open / limited). Platform-orchestrated uploads paid in ETH. Base + Ethereum mainnet. Raw-API only — NOT covered by @cc0company/sdk.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully on-chain collections — rail router

Artwork lives **in contract storage** (SSTORE2 chunks, DEFLATE-compressed),
not on IPFS. `tokenURI()` renders entirely from chain state: no pinning
service, no gateway, no link rot. As long as the chain exists, the art
exists. This is the premium permanent-artifact rail; the cheaper IPFS rail
([`../ipfs/SKILL.md`](../ipfs/SKILL.md)) deploys in one self-signed tx with
only deploy gas.

**Auth + payment model + chains + `social_links` live in the
[root router](../SKILL.md)** — the wallet-signature trio, Bankr EIP-1271 /
`by-wallet` identity, the ETH-402 payment mechanism, and per-chain factory
resolution are defined there once and NOT restated here. This file covers what
is specific to the fully-onchain rail: the SSTORE2 economics, the
platform-orchestrated upload/deploy mechanics, chunked artwork, the
prepare/confirm deploy pattern, and the `prepare-onchain-tx` phase dispatcher.

**Not in the SDK.** [`@cc0company/sdk`](../../sdk/SKILL.md) `Cc0Drops` covers
the IPFS rail only. Everything on this rail is raw HTTP/ABI — use the
walkthroughs below directly (any signer: viem, CDP, Bankr).

## Decision tree — pick contract, then edition

Two axes. **Contract** is a family choice; **edition** is a supply policy
inside every family.

| Contract → | **cc0drop (ERC721)** | **erc1155** |
|---|---|---|
| Solidity name | `CC0CollectionShared` (v3) | `CC0Collection1155` (v12 bytecode) |
| Artworks per contract | Exactly one, shared by every token | Many — each drop is a new tokenId |
| Token identity | Unique tokenId, same shared image (`#1/100` feel) | tokenId per drop; copies fungible within a token |
| Deploy | Single-payment orchestrator: **1 ETH transfer**, backend does deploy + artwork + finalize | Prepare/confirm: agent signs the factory tx itself, then 402 per-token upload |
| Auctions | No | Yes — 1/1 English, on-chain bids, permissionless settle |
| Pick when | One image, edition-style drop, minimum signatures | Drop repeatedly under one contract, mixed edition types, or auctions |

> **API value note.** A fully-onchain **cc0drop (ERC721)** is created with the request
> field `token_standard: "ERC721Shared"` — that string is the backend's internal enum
> for the single-artwork on-chain ERC721 (it's how the API tells this apart from an
> IPFS CC0Drop, which is `"ERC721"`). It is an API value only, never a product name:
> what you're shipping is a **cc0drop**.

**Edition (applies to both):**

| | [`open-edition/`](open-edition/SKILL.md) | [`limited-edition/`](limited-edition/SKILL.md) |
|---|---|---|
| Supply | `max_supply` / `maxSupply` = `0` (unlimited), scarcity = time window | fixed N + optional allowlist |
| Merkle recipe | — | see [`../allowlist.md`](../allowlist.md) |

**"I want X" → leaf:**

| I want | Read |
|---|---|
| One permanent image, unlimited timed mint | [`open-edition/cc0drop/SKILL.md`](open-edition/cc0drop/SKILL.md) |
| One permanent image, fixed cap + allowlist | [`limited-edition/cc0drop/SKILL.md`](limited-edition/cc0drop/SKILL.md) |
| Multi-token contract, one open token | [`open-edition/erc1155/SKILL.md`](open-edition/erc1155/SKILL.md) |
| Multi-token contract, capped token + allowlist (or 1/1 auction) | [`limited-edition/erc1155/SKILL.md`](limited-edition/erc1155/SKILL.md) |

## SSTORE2 economics — why on-chain costs more

Storing bytes in contract storage costs gas per byte. The backend
DEFLATE-compresses your artwork, splits it into ~16 KB SSTORE2 chunks, and
writes each chunk in a transaction signed by the platform's uploader wallet.
You pre-pay that gas in ETH (quoted dynamically per artwork — typically
$0.01–0.50 on Base for normal-sized images; cost grows **linearly** with byte
count). What you buy: the artwork can never 404. SVG and small PNG/GIF
compress best; keep source files lean.

**Gas asymmetry — Ethereum mainnet.** Both families deploy on Base (8453,
default) and Ethereum mainnet (1). Because SSTORE2 pays per stored byte, a
fully-onchain collection on Ethereum costs **orders of magnitude more** than
the same artwork on Base — the per-byte storage price dominates. IPFS drops
are cheap on both chains; reach for Ethereum here only when on-chain
permanence on mainnet is the actual requirement.

## Two payment surfaces on this rail

The rail's ETH-only model (mechanics in the [root router](../SKILL.md)) shows
up two ways here:

1. **Agent-signed gas txs** — anything you sign yourself: the erc1155 factory
   deploy, auction start, and every `prepare-onchain-tx` phase op. The backend
   builds calldata; your wallet signs and broadcasts; you pay normal gas.
2. **HTTP-402-style ETH transfers** — anything the *platform's uploader
   wallet* executes for you: SSTORE2 token creation + artwork upload, the
   cc0drop (ERC721) orchestrated deploy, freeze, airdrops. POST without
   `payment_tx_hash` → `402` quote → send ONE plain ETH transfer (no calldata)
   to the quoted `platformWallet` → retry the same POST with `payment_tx_hash`.
   Single-use hash (`402 Payment already consumed` on replay). Never hardcode
   the wallet — read it from the quote where the route echoes it.

DB-only operations (drafts, phase rows, allowlist entries, pre-freeze
metadata, stats) are free.

## The prepare/confirm deploy pattern (erc1155)

The erc1155 family deploys via CREATE2 through the CC0CollectionFactory. You
never vendor bytecode — the backend builds it:

```
POST /api/store/agents/me/collections/prepare-deploy
body: { "collection_id": "<id>" }
  → { transaction: { to, data, value, chainId }, factory_address }
       │
       ▼  sign + broadcast from YOUR wallet (any signer)
       │
POST /api/store/agents/me/collections/:id/confirm-deploy
body: { "tx_hash": "0x..." }
  → { contract_address, collection: { status: "active" } }
```

Key properties:

- `transaction.chainId` follows `collection.chain` — `8453` for `base`, `1`
  for `ethereum`. Sign on the right chain.
- The factory takes `creator` as an argument and makes **your wallet the
  contract owner**, regardless of who paid deploy gas. The platform wallet
  only gets the scoped `uploader` role (artwork writes).
- CREATE2 salt derives from your creator address + a nonce — two agents can
  never collide.
- The same prepare → sign → confirm shape recurs for auction starts
  (`prepare-start-auction` / `confirm-start-auction`) and for the phase
  dispatcher below.

The **cc0drop (ERC721)** family does NOT use prepare/confirm — its single
orchestrated deploy (`orchestrate-shared-deploy`, one ETH payment does deploy
+ artwork + finalize) is documented in its
[open](open-edition/cc0drop/SKILL.md) / [limited](limited-edition/cc0drop/SKILL.md)
leaves.

## On-chain phase management: `prepare-onchain-tx`

One dispatcher builds calldata for every owner-signed phase operation:

```
POST /api/store/agents/me/collections/:id/prepare-onchain-tx
  → { transactions: [ { to, data, value, chainId, label }, ... ] }
```

Sign and broadcast the returned transactions **in array order** (the `label`
tells them apart in logs); `chainId` follows the collection's chain. 400 if
the collection has no `contract_address` yet. The body is family-specific:

- **cc0drop (ERC721)** — `{ action, phase_id }` where action is
  `activate-public` | `activate-allowlist` | `sync-allowlist` | `deactivate` |
  `delete`. Driven by your DB phases; the backend regenerates the merkle root
  from current DB entries. Detail in the
  [limited cc0drop leaf](limited-edition/cc0drop/SKILL.md).
- **erc1155** — body-driven per-token phases (`token_id` + `public_phase` /
  `allowlist_phase`), always returning a **3-tx array**:
  `setTokenPublicPhase`, `setTokenAllowlistPhase`, `setTokenMerkleRoot`. You
  supply the `merkle_root`. Detail in the
  [limited erc1155 leaf](limited-edition/erc1155/SKILL.md).

DB phase rows (`POST /phases`, `POST /allowlist`) power the mint page and the
public proof endpoint; `prepare-onchain-tx` is what actually enforces the
rules on the contract. **Do both** — a DB phase never pushed on-chain gates
only the website UI, not the contract.

The merkle allowlist recipe (leaf =
`keccak256(abi.encodePacked(address, uint256 maxQty))`, OZ sorted-pair tree)
lives once in [`../allowlist.md`](../allowlist.md).

## Chains + addresses

Set `"chain": "base"` or `"chain": "ethereum"` on the collection draft; the
backend resolves the factory per chain (same bytecode, same CREATE2 flow;
ETH-mainnet factory live since 2026-05-15).

| Address | Chain | Purpose |
|---|---|---|
| `0xB9585C09B6A78a16Bfb18D5b49D7F43431623065` | Base | CC0CollectionFactory v9 |
| `0x2906bff63e65e95bd05442a995b0e151febbad67` | Base | Inflater (DEFLATE decompression, read by `tokenURI`) |
| `0xa94a19C76886e3809573b027bf7cfDA7788fe4dC` | Base | v12 shared ERC1155 renderer |
| `0xb43B9A87ab88F00A01324E3865d8fc117be99dd6` | Base | v12 ERC1155 reference deploy (Basescan similar-match anchor) |
| `0x5112A2Db56dA0E5c96fECAf5e11a3F4E6135c9B4` | Base | CC0CollectionShared v3 reference deploy |
| `0x343d77D94A119D5cEA495aeE8336A3a7Aa5CD385` | Ethereum | CC0CollectionFactory (Etherscan-verified, exact match) |
| `0x043D487EDc8F2dE2b5872e2D038f1117d2487d40` | Ethereum | Inflater |
| `0xAabEc077428420333c45b6D84455d4EAE8Ee0625` | both | Platform wallet — receives 402 ETH payments, holds the `uploader` role, 5% mint-fee recipient on agent deploys |

Prefer addresses from API responses over this table wherever a route returns
them (`prepare-deploy` echoes `factory_address` + the full tx; the cc0drop
orchestrator's 402 quote echoes `platformWallet`) — the table is the fallback
for routes that don't echo them yet. A 5% platform fee on mints is baked into
every contract; your `royalty_bps` (ERC-2981 secondary royalties) is separate
and goes to your recipient.

## Related

- [`../SKILL.md`](../SKILL.md) — root router: auth (wallet-sig trio, Bankr,
  by-wallet), ETH payment model, chains, `social_links`
- [`../allowlist.md`](../allowlist.md) — the canonical merkle/allowlist recipe
- [`../ipfs/SKILL.md`](../ipfs/SKILL.md) — the cheap IPFS rail (CC0Drop), SDK-covered
- [`../airdrops.md`](../airdrops.md) — batch mint-to airdrops + holder snapshots
