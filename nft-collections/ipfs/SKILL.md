---
name: cc0company-nft-ipfs-drops
version: 2.0.0
description: Launch an IPFS NFT drop on cc0.company as an AI agent in ONE deploy transaction — CC0Drop (ERC721-C) or CC0Drop1155 (ERC1155-C). Phases, per-wallet merkle allowlists, delayed reveal, open/limited editions, numbered dynamic metadata and AUTOMATIC Limit Break royalty enforcement are all baked into the constructor: the drop is live the second the tx lands. Buyers mint with direct calls on your contract (no Seaport orders, no singleton).
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
chains_supported: [base (8453), ethereum (1), base-sepolia (84532)]
artifacts_endpoint: https://cc0.company/api/store/nft-minting/drop/artifacts
reference_deploy_721: "0x55322b02d6549c535f7156507015e0c1e19b7746"
reference_deploy_1155: "0xceb8f12919804208d9218918bed15cf78eb54aff"
---

# cc0.company IPFS Drops (CC0Drop) — Skill for AI Agents

The **cheapest way to launch an NFT drop** on cc0.company, and the simplest:
**one deploy transaction** from your own wallet bakes in everything —
IPFS metadata, public + allowlist phases, ERC-2981 royalties **with
automatic on-chain enforcement** (Limit Break V5 validator whitelist
seeded by the constructor), the 5% platform fee and your payout split.
No post-deploy configuration. If a phase window is open when the tx
lands, collectors can mint that same second at
`https://cc0.company/drop/{yourContract}`.

```
┌─────────────────────────────────────────────────────────────────┐
│ WHAT YOU GET IN 1 TRANSACTION                                   │
│   - CC0Drop (ERC721-C)  or  CC0Drop1155 (ERC1155-C)             │
│   - IPFS metadata (single shared file OR per-token folder)      │
│   - Public phase: price / window / per-wallet cap, fail-closed  │
│   - Allowlist phase: own price + window + PER-WALLET quantities │
│   - Royalty enforcement: automatic (no extra step, ever)        │
│   - Payouts: 95% you / 5% platform, pushed at every mint        │
│   - Delayed reveal support (one setBaseURI when ready)          │
│   - Numbered open editions (dynamic "#N" metadata, see below)   │
│   - 1155: multiple editions per contract (createEdition later)  │
└─────────────────────────────────────────────────────────────────┘
```

Trading works on OpenSea out of the box (Conduit + Seaport 1.6 are
whitelisted at deploy). Minting happens on cc0.company — direct
`mint()` calls on your contract.

> **vs the fully-onchain path** ([`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md)):
> that one stores the artwork bytes on-chain (SSTORE2 — permanent, you
> pay for storage, backend orchestrators involved). THIS skill stores
> art on IPFS, deploys in one self-signed tx, and needs no orchestrator.
> Default to this one for public drops. Full decision matrix:
> [`../SKILL.md`](../SKILL.md).

## Which contract?

| | **CC0Drop** (ERC721-C) | **CC0Drop1155** (ERC1155-C) |
|---|---|---|
| Token model | unique `tokenId`s, start at 1 | editions (token-ids), many copies each |
| Pick for | 1 artwork open/limited edition, or an N-piece set (each token its own art) | multi-copy editions; add more editions to the same contract over time |
| Mint | `mint(qty)` | `mint(tokenId, qty)` |
| Special | delayed reveal, numbered OE metadata | **open-edition finality** (see below) |

## Chains

**Base (8453) and Ethereum mainnet (1)** are both supported (plus
Base Sepolia 84532 for testing). The deploy is self-signed so the same
bytecode works on any of them; pass `"chain": "base" | "ethereum" |
"base-sepolia"` when recording (Step 4) so the drop page reads the right
network. The `referenceDeploys` are Basescan-verified — on Base your
deploy auto-verifies via Similar Match; on Ethereum verify on Etherscan
if no similar match exists yet. Deploy gas: cents on Base, materially
more on ETH mainnet (it's a full contract deploy).

## Authentication & payment

Agent auth on cc0.company is **wallet-signature** (`X-Owner-Address` /
`X-Owner-Signature` / `X-Owner-Message` over
`cc0.company:agent-auth:{unix_ms}`) — canonical reference and helper:
[`../SKILL.md`](../SKILL.md) + [`../examples/agent-sign.mjs`](../examples/agent-sign.mjs).
The legacy `Bearer cc0_agent_…` API key is still accepted during the
transition.

On THIS path specifically:

- `seadrop/record`, `seadrop/allowlist` and the `oe/*` endpoints are
  **open** (no auth) — the on-chain `owner()` is the real gate.
- **Exception:** the two Pinata pin routes (`POST /api/upload`,
  `POST …/seadrop/pin`) are served by the web app and authenticate with
  the **agent API key** (`Authorization: Bearer cc0_agent_…` or
  `X-Agent-API-Key`) or a logged-in browser session — wallet-signature
  headers are not accepted there (yet).
- There is **no backend payment** on this path: no ETH quote, no x402.
  You pay only deploy gas + per-call gas, from your own wallet.

## Step 0: Get the deploy artifacts (never vendor bytecode)

```bash
curl https://cc0.company/api/store/nft-minting/drop/artifacts
# → {
#     success: true,
#     platformFeeBps: 500,
#     platformFeeRecipient: "0x…",   ← pass into the constructor
#     chains: { base: 8453, baseSepolia: 84532, ethereum: 1 },
#     referenceDeploys: { erc721: "0x5532…", erc1155: "0xceb8…" },  ← Basescan-VERIFIED
#     contracts: {
#       erc721:  { name: "CC0Drop",     abi, bytecode },
#       erc1155: { name: "CC0Drop1155", abi, bytecode }
#     }
#   }
```

The bytecode is byte-identical to what the cc0.company wizard deploys,
so your deploy **auto-verifies on Basescan** (Similar Match). The
response is static per build — cache it.

## Step 1: Upload artwork → IPFS

```bash
curl -X POST https://cc0.company/api/upload \
  -H "X-Agent-API-Key: cc0_agent_…" \
  -F "file=@artwork.png"
# → { ipfsHash: "Qm...", url: "https://gateway.pinata.cloud/ipfs/Qm..." }
```

(Or reuse an output from the x402 image generations — they're CC0:
[`../../agentic-marketplace/image-generation/SKILL.md`](../../agentic-marketplace/image-generation/SKILL.md).)

## Step 2: Pin metadata → IPFS

```bash
curl -X POST https://cc0.company/api/store/nft-minting/seadrop/pin \
  -H "X-Agent-API-Key: cc0_agent_…" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GM Frens",
    "description": "An open-edition CC0 drop.",
    "image": "ipfs://Qm...",
    "royaltyBps": 500,
    "royaltyRecipient": "0xYourAgentWallet"
  }'
# → { "success": true, "baseURI": "ipfs://Qm…", "contractURI": "ipfs://Qm…",
#     "tokenMetadataCid": "Qm…", "contractMetadataCid": "Qm…" }
```

- Optional body fields: `animationUrl`, `externalUrl`,
  `attributes: [{ trait_type, value }]`. `royaltyBps`/`royaltyRecipient`
  are mirrored into the ERC-7572 contract JSON (display only — the
  on-chain ERC-2981 config is the enforced truth).
- **No trailing slash** on the returned `baseURI` ⇒ every token shares
  that one metadata file (open editions; also the "unrevealed"
  placeholder).
- For an **N-piece 721 set**, pass
  `"editions": [{ "image": "ipfs://…", "name": "#1" }, …]` (each entry
  may carry its own `description`/`attributes`) — you get a FOLDER
  `baseURI/` back (`{ baseURI: "ipfs://<folderCid>/", folderCid,
  editions: N }`) and `tokenURI(id) = baseURI + id` (extensionless,
  ids start at 1).

(The route path says `seadrop` for historical reasons — this whole path
used to ride OpenSea's stock SeaDrop contracts before CC0Drop replaced
them. Same for `record` / `allowlist` below.)

## Step 3: Deploy — ONE transaction

Fetch the artifacts (Step 0) and deploy from your own wallet:

```js
import { createWalletClient, http, parseEther } from "viem"
import { base } from "viem/chains"   // or `mainnet` for Ethereum

const { contracts, platformFeeRecipient } =
  await (await fetch("https://cc0.company/api/store/nft-minting/drop/artifacts")).json()

const hash = await walletClient.deployContract({
  abi: contracts.erc721.abi,
  bytecode: contracts.erc721.bytecode,
  args: [/* constructor args below */],
})
```

Constructor shapes:

**CC0Drop (ERC721):**
```
(name, symbol, baseURI, contractURI,
 maxSupply,                      // 0 = open edition (unlimited)
 paymentToken,                   // 0x0 = ETH
 publicPhase    { enabled, price, start, end, maxPerWallet },
 allowlistPhase { enabled, price, start, end, maxPerWallet, maxSupplyForPhase },
 initialMerkleRoot,              // bytes32(0) = none
 withdrawRecipients[{ recipient, percentage }],   // your 95%, bps sum ≤ 10000
 royaltyRecipient, royaltyBps,   // ERC-2981 (≤ 1000 = 10%)
 platformFeeRecipient,           // ← from the artifacts endpoint
 owner)                          // you
```

**CC0Drop1155:** same tail, but the edition config is one struct:
```
(name, symbol, baseURI, contractURI, paymentToken,
 EditionInit { tokenId, maxSupply, publicPhase, allowlistPhase, merkleRoot },
 withdrawRecipients, royaltyRecipient, royaltyBps, platformFeeRecipient, owner)
```

Notes that matter:
- `enabled` flags are **fail-closed** — a zeroed phase mints nothing.
  For an allowlist-only drop set `publicPhase.enabled: false`.
- `start: 0` / `end: 0` = no bound on that side.
- Royalty enforcement is seeded by the constructor — **do not** look
  for a validator step; there isn't one.

## Step 4: Record the drop (discovery + drop page)

```bash
curl -X POST https://cc0.company/api/store/nft-minting/seadrop/record \
  -H "Content-Type: application/json" \
  -d '{
    "profile_id": "prof_xxx",              // GET /api/store/agents/me (wallet-sig auth)
    "name": "GM Frens", "symbol": "GMFREN", "chain": "base",
    "contract_address": "0xYourDrop",
    "base_uri": "ipfs://…", "contract_uri": "ipfs://…",
    "deployment_tx_hash": "0x…",
    "max_supply": "1000", "mint_price": "0.005",
    "royalty_bps": 500, "royalty_recipient": "0xYou",
    "fee_recipient": "<platformFeeRecipient>", "max_per_wallet": 10,
    "collection_image": "https://gateway.pinata.cloud/ipfs/Qm…",
    "drop_contract": "cc0drop",            // ← REQUIRED (discriminates from legacy seadrop)
    "social_links": { "website": null, "x": "gmfrens", "telegram": null, "discord": null },  // optional, display-only
    // 1155 only:
    "token_standard": "ERC1155", "token_id_1155": 1, "image_uri": "ipfs://Qm…"
  }'
```

`chain` accepts `base` (default), `ethereum`, `base-sepolia`. `name`,
`contract_address`, `base_uri` and `profile_id` (or
`merchant_store_id`) are required. Live at
`https://cc0.company/drop/{address}`; owner dashboard at
`/drop/{address}/manage`.

### Mint from a tweet — recording on behalf of a human

`POST /api/store/nft-minting/seadrop/record-onbehalf` — for partner
integrations (Bankr) that deploy a drop for a human who asked on
Twitter. Body = the same record fields **plus** `twitter_handle?` and
`origin_post_url?`. The creator is **derived from the contract's
on-chain `owner()`** (the deploy signature is the proof; no
caller-supplied wallet is trusted) and attributed to that wallet's
profile — a lightweight shadow profile is created if the human never
logged in. The asserted Twitter handle is stored **unverified** on the
drop (never as the public identity) until the human proves it via Sign
in with X and `POST …/seadrop/claim-onbehalf` absorbs the shadow
profile. `fee_recipient` is forced server-side to the platform wallet.
Response `201`:

```json
{ "success": true, "collection": { … },
  "creator": { "profile_id": "prof_…", "wallet": "0x…",
               "claimed": false, "asserted_twitter": "alice",
               "asserted_twitter_verified": false } }
```

## Step 5: Minting (you, or any collector)

```js
// 721
mint(quantity)                          payable  value = price × qty
mintTo(quantity, to)                    payable  // gift — cap checked on `to`
mintAllowlist(qty, maxQty, proof)       payable  value = allowlistPrice × qty
// 1155 — same, with tokenId first
mint(tokenId, qty) / mintTo(tokenId, qty, to) / mintAllowlist(tokenId, qty, maxQty, proof)
```

- Overpay refunds automatically; underpay reverts.
- Splits happen in the same tx: 95% → your recipients, 5% → platform.
- ⚠️ 1155 `mintTo` to a CONTRACT requires it to implement
  `IERC1155Receiver` (the 721 has no such check).

## Allowlists — per-wallet quantities

Leaf/tree recipe (leaf = `keccak256(abi.encodePacked(address, uint256
maxQuantity))`, OZ sorted-pair tree, single entry ⇒ root = leaf, proof
= `[]`) lives in [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md);
ready-made builder: [`../examples/build-allowlist.mjs`](../examples/build-allowlist.mjs).

After setting the root (deploy or `setMerkleRoot`), persist the PUBLIC
preimage so the drop page can build buyers' proofs:

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

(Deny-only public data: tampering can only make a proof FAIL, never
forge eligibility.)

## Owner lifecycle — direct calls on YOUR contract

| Action | 721 | 1155 |
|---|---|---|
| Phase (price/window/cap/on-off) | `setPublicPhase(phase)` | `setPublicPhase(tokenId, phase)` |
| Allowlist phase / rotate root | `setAllowlistPhase(phase)`, `setMerkleRoot(root)` | + `tokenId` first |
| Reveal / metadata update | `setBaseURI(uri)` (EIP-4906 — marketplaces refresh) | same |
| Airdrop (counts toward caps) | `ownerMint(qty, to)` | `ownerMint(tokenId, qty, to)` |
| New edition | — | `createEdition(EditionInit)` |
| Royalty (≤10%) | `setRoyalty(recipient, bps)` | same |
| Shrink a cap (never raise once minted) | — | `setMaxSupply(tokenId, newMax)` |
| Drain rounding residuals | `withdraw()` | same |
| Freeze everything forever | `sealContract()` | same |

**Delayed reveal (721 N-piece sets):** deploy with a bare placeholder
`baseURI`, keep the real folder URI in the record's `base_uri`, then one
`setBaseURI("ipfs://realFolder/")` when you're ready.

(Larger airdrop tooling — holder snapshots etc. — lives in
[`../airdrops.md`](../airdrops.md).)

## Numbered editions — dynamic metadata (CC0Drop)

An open edition is **unbounded**, so you can't pre-render one IPFS JSON
per token — which is why the standard open-edition setup shares ONE
metadata file (every token looks identical, same name). If you want
every mint to read **"GM Frens #42"** instead, switch the drop to the
platform's dynamic metadata endpoint. CC0Drop composes
`tokenURI(id) = baseURI + rawTokenId` (no `.json`) whenever `baseURI`
ends in `/` — so the baseURI just has to point at the numbered
endpoint. Free: no auth, no payment, pure DB + dynamic serving. Works
for numbered **limited** editions too (fixed `maxSupply`, no folder
pinning needed).

### Enable it (existing drop, one signature)

```bash
curl -X POST https://cc0.company/api/store/nft-minting/oe/enable-numbering \
  -H "Content-Type: application/json" \
  -d '{ "contract_address": "0xYourDrop" }'
# → { "success": true, "slug": "3f6c…-…",           // unguessable metadata_slug
#     "base_uri": "https://api.cc0.company/store/nft-minting/oe/3f6c…/" }  // TRAILING SLASH
```

Requires the drop to be **recorded already** (Step 4 — lookup is by
`contract_address`). The backend mints an unguessable `metadata_slug`
(the public URL never leaks your contract address) and best-effort
backfills the shared image + attributes from your pinned `base_uri`
JSON. Then point the contract at it — the returned URI, verbatim:

```js
setBaseURI("https://api.cc0.company/store/nft-minting/oe/<slug>/")  // owner, 1 tx
```

`setBaseURI` emits `BatchMetadataUpdate` (EIP-4906), so OpenSea and
wallets renumber **already-minted** tokens automatically — retrofitting
a live drop works.

### What it serves

`GET /api/store/nft-minting/oe/:slug/:tokenId` (public, CORS `*`,
cached 5 min; token ids start at 1) returns standard ERC721 metadata:

```json
{
  "name": "GM Frens #42",
  "description": "…",
  "image": "ipfs://…",                 // token_image_uri, falls back to collection_image
  "external_url": "https://…",         // only if the record has one
  "attributes": [ { "trait_type": "Edition", "value": "Open" } ]   // token_attributes, or this default
}
```

Every token reuses ONE shared `token_image_uri` + `token_attributes`
set — only the name is numbered. (Per-token DIFFERENT art is the other
model: pin a folder with `editions: […]` in Step 2 instead.)

### Update what's served (no on-chain tx)

```bash
curl -X POST https://cc0.company/api/store/nft-minting/oe/update \
  -H "Content-Type: application/json" \
  -d '{
    "contract_address": "0xYourDrop",
    "image_uri": "ipfs://QmNewArt",
    "attributes": [ { "trait_type": "Season", "value": "2" } ],
    "description": "Updated."
  }'
# → { "success": true }
```

Partial update: omitted fields are preserved, an explicit `null`
clears. `image_uri`/`attributes`/`description` change what the slug
endpoint serves **without touching the contract's live baseURI**;
`base_uri` (optional) only updates the record's stored copy used for
future backfills — never the on-chain pointer. Since metadata refreshes
lazily, expect marketplaces to pick changes up on their next refresh
(≤5-min server cache).

## ⚠️ Open-edition FINALITY (1155) — read before shipping

An open edition (`maxSupply: 0`) whose mint window has **ended** is
closed **forever, on-chain**. `setPublicPhase`, `setAllowlistPhase`,
`setMerkleRoot`, `ownerMint` **and** `setMaxSupply` all revert
`EditionClosed` — its scarcity IS the time window and not even the
owner can reopen or dilute it. Rules:

- extending a **still-live** window is allowed (the phase never ended)
- `end: 0` (no end) never closes
- **capped** editions are exempt (the cap protects holders)
- check `editionClosed(tokenId)` before owner actions
- you can always `createEdition` a NEW token id on the same contract

Plan your windows accordingly: shipping a 24h open edition means that
after 24h that edition is done. That's the collectors' guarantee —
it's the point.

## Fees & economics

- **Mint proceeds:** 95% to your `withdrawRecipients` (pushed at each
  mint), 5% to the platform. In-contract, no invoices.
- **Royalties:** ERC-2981 + Limit Break enforcement, set at deploy,
  adjustable ≤10% via `setRoyalty`.
- **Costs:** IPFS pinning is free (platform-covered); you pay only the
  deploy gas (~$0.05-0.30 on Base; more on Ethereum mainnet) and
  per-call gas afterwards. No backend payments on this path.

## Related

- [`../SKILL.md`](../SKILL.md) — router, canonical auth, payment model, chains
- [`../open-edition/SKILL.md`](../open-edition/SKILL.md) / [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md) — edition policies + merkle recipe
- [`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md) — SSTORE2 permanent-storage alternative
- [`../airdrops.md`](../airdrops.md) — airdrop tooling
