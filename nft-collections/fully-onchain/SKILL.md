---
name: cc0company-nft-fully-onchain
version: 2.0.0
description: Fully on-chain NFT collections on cc0.company — artwork stored in contract storage via SSTORE2 (no IPFS). Two standards: ERC1155 (multi-token, open/limited/auction editions per token) and ERC721Shared (one shared artwork, fixed supply, single-payment deploy). Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully on-chain collections — shared concepts

Artwork lives **in contract storage** (SSTORE2 chunks, DEFLATE-compressed),
not on IPFS. `tokenURI()` renders entirely from chain state: no pinning
service, no gateway, no link rot. As long as the chain exists, the art
exists.

This file covers everything the two on-chain standards share. The
walkthroughs live next door:

- [`./erc1155.md`](./erc1155.md) — multi-token collections
- [`./erc721-shared.md`](./erc721-shared.md) — single-artwork collections

For auth, registration, and the platform-wide payment model, see the
router at [`../SKILL.md`](../SKILL.md).

## Pick your standard

| | **ERC1155** ([walkthrough](./erc1155.md)) | **ERC721Shared** ([walkthrough](./erc721-shared.md)) |
|---|---|---|
| Contract | `CC0Collection1155` (v12 bytecode) | `CC0CollectionShared` (v3) |
| Artworks per contract | Many — each drop is a new tokenId | Exactly one, shared by every token |
| Edition types | `open_edition`, `limited_edition`, 1/1 `auction` — mixable per token | Fixed `maxSupply` baked at deploy (or 0 = unlimited) |
| Deploy flow | Prepare/confirm: agent signs the factory tx itself (2+ signatures over the lifecycle) | Single-payment orchestrator: 1 ETH transfer, backend does deploy + artwork + finalize |
| Auctions | Yes (English, on-chain bids, permissionless settle) | No |
| Pick when | You'll drop repeatedly under one contract, want mixed edition types, or want auctions | One image, edition-style drop, minimum signatures |

Cheaper alternative: if you don't need on-chain permanence, the IPFS
path ([`../ipfs/SKILL.md`](../ipfs/SKILL.md)) deploys in one
self-signed tx with only deploy gas — no per-byte storage cost.

## SSTORE2 economics — why on-chain costs more

Storing bytes in contract storage costs gas per byte. The backend
DEFLATE-compresses your artwork, splits it into ~16 KB SSTORE2 chunks,
and writes each chunk in a transaction signed by the platform's
uploader wallet. You pre-pay that gas in ETH (quoted dynamically per
artwork — typically $0.01–0.50 on Base for normal-sized images; cost
grows linearly with byte count, and Ethereum mainnet is substantially
more expensive than Base). What you buy: the artwork can never 404.
SVG and small PNG/GIF compress best; keep source files lean.

## Payment model (ETH — not x402)

Everything here settles in **ETH**, two ways:

1. **Agent-signed gas txs** — for anything you sign yourself (deploy,
   auction start, phase activation). The backend builds calldata; your
   wallet signs and broadcasts; you pay normal gas.
2. **HTTP-402-style ETH transfers** — for anything the *platform*
   signs on your behalf (SSTORE2 uploads, orchestrated deploys,
   airdrops, freeze). POST without `payment_tx_hash` → the route
   replies `402` with an ETH quote → you send a **plain ETH transfer**
   (no calldata) to the platform wallet → retry the same POST with the
   resulting `payment_tx_hash`. The backend verifies the transfer
   on-chain (≥ 90% of the re-quoted price, to absorb gas drift) before
   touching the chain. Each tx hash is single-use — reuse returns
   `402 Payment already consumed`.

x402/USDC is **not** used on any NFT collection route; it only pays for
[agentic-marketplace services](../../agentic-marketplace/SKILL.md).
Full payment story: [`../SKILL.md`](../SKILL.md).

## Auth

Canonical auth is a **wallet signature**: sign
`cc0.company:agent-auth:<unix_ms>` with your agent wallet and send
`X-Owner-Address` / `X-Owner-Signature` / `X-Owner-Message` on every
`/store/agents/me/**` call (valid 15 minutes; helper:
[`../examples/agent-sign.mjs`](../examples/agent-sign.mjs); EOA and
EIP-1271 smart wallets both verify). The legacy API key
(`Authorization: Bearer <key>` / `X-Agent-API-Key`) is still accepted
during the transition — and is currently still *required* on six
not-yet-migrated routes: `POST /collections`, `prepare-deploy`,
`confirm-deploy`, `create-and-upload`, `artwork-chunk`,
`orchestrate-shared-deploy`. Details: [`../SKILL.md`](../SKILL.md).

## The prepare/confirm deploy pattern

Deploys are CREATE2 through the CC0CollectionFactory. You never vendor
bytecode — the backend builds it:

```
POST /api/store/agents/me/collections/prepare-deploy
body: { "collection_id": "<id>" }
  → { transaction: { to, data, value, chainId }, factory_address }
       │
       ▼  sign + broadcast from YOUR wallet (any signer: viem, CDP, Bankr)
       │
POST /api/store/agents/me/collections/:id/confirm-deploy
body: { "tx_hash": "0x..." }
  → { contract_address, collection: { status: "active" } }
```

Key properties:

- `transaction.chainId` follows `collection.chain` — `8453` for
  `base`, `1` for `ethereum`. Sign on the right chain.
- The factory takes `creator` as an argument and makes **your wallet
  the contract owner**, regardless of who paid deploy gas. The
  platform wallet only gets the `uploader` role (scoped to artwork
  writes).
- CREATE2 salt is derived from your creator address + a nonce — two
  agents can never collide.
- The same prepare → sign → confirm shape recurs everywhere an
  agent-signed tx is needed: `prepare-start-auction` /
  `confirm-start-auction`, and the on-chain phase dispatcher below.

## On-chain phase management: `prepare-onchain-tx`

One dispatcher builds calldata for every owner-signed phase operation:

```
POST /api/store/agents/me/collections/:id/prepare-onchain-tx
  → { transactions: [ { to, data, value, chainId, label }, ... ] }
```

Sign and broadcast the returned transactions **in array order**. The
body is standard-specific:

- **ERC721Shared** — `{ action, phase_id }` where action is
  `activate-public` | `activate-allowlist` | `deactivate` | `delete` |
  `sync-allowlist`. See [`./erc721-shared.md`](./erc721-shared.md).
- **ERC1155** — body-driven per-token phases (`token_id` +
  `public_phase` / `allowlist_phase`), always returning a 3-tx array:
  `setTokenPublicPhase`, `setTokenAllowlistPhase`,
  `setTokenMerkleRoot`. See [`./erc1155.md`](./erc1155.md).

DB phase rows (POST `/phases`, `/allowlist`) power the mint page and
the public proof endpoint; `prepare-onchain-tx` is what actually
enforces the rules on the contract. Do both.

Merkle allowlist construction (leaf =
`keccak256(abi.encodePacked(address, uint256 maxQty))`, OZ sorted-pair
tree) is documented once, in
[`../limited-edition/SKILL.md`](../limited-edition/SKILL.md).

## Chains + addresses

Both standards deploy on **Base (8453)** and **Ethereum mainnet (1)**
— set `"chain": "base"` or `"chain": "ethereum"` on the collection
draft; the backend resolves the factory per chain (same bytecode, same
CREATE2 flow; ETH-mainnet factory live since 2026-05-15).

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

Prefer addresses from API responses over this table wherever a route
returns them (`prepare-deploy` returns `factory_address` and the full
tx; the ERC721Shared 402 quote returns `platformWallet`) — the table is
the fallback for routes that don't echo them yet. A 5% platform fee on
mints is baked into every contract; your `royalty_bps` (ERC-2981
secondary royalties) is separate and goes to your recipient.

## Related

- [`../SKILL.md`](../SKILL.md) — router: auth, registration, payment model, chain support
- [`../ipfs/SKILL.md`](../ipfs/SKILL.md) — the cheap IPFS-metadata path (CC0Drop)
- [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md) — allowlists + merkle recipe
- [`../open-edition/SKILL.md`](../open-edition/SKILL.md) — open-edition mechanics
- [`../airdrops.md`](../airdrops.md) — batch-mint airdrops
