---
name: cc0company-nft-ipfs
version: 3.0.0
description: The IPFS storage rail for cc0.company NFT drops — CC0Drop (ERC721-C) and CC0Drop1155 (ERC1155-C), each deployed in ONE self-signed transaction with IPFS-pinned art + metadata. This router owns the shared IPFS mechanics (pin art, pin metadata, artifacts endpoint, 1-tx deploy, record, phases, delayed reveal, numbered OE metadata, add-edition-to-live-1155); the open/limited × cc0drop/erc1155 leaves own the per-combo deploy call. Covered end-to-end by @cc0company/sdk Cc0Drops.
homepage: https://cc0.company
api_base: https://cc0.company/api
artifacts_endpoint: https://cc0.company/api/store/nft-minting/drop/artifacts
reference_deploy_721: "0x55322b02d6549c535f7156507015e0c1e19b7746"
reference_deploy_1155: "0xceb8f12919804208d9218918bed15cf78eb54aff"
---

# cc0.company IPFS Drops — Rail Router

The **cheapest and simplest** way to launch an NFT drop on cc0.company:
**one deploy transaction** from your own wallet bakes in everything —
IPFS metadata, public + allowlist phases, ERC-2981 royalties **with
automatic on-chain enforcement** (Limit Break V5 validator whitelist
seeded by the constructor), the 5% platform fee and your payout split.
No post-deploy configuration, no orchestrator. If a phase window is open
when the tx lands, collectors can mint that same second at
`https://cc0.company/drop/{yourContract}`.

Trading works on OpenSea out of the box (Conduit + Seaport 1.6 are
whitelisted at deploy). Minting happens on cc0.company — direct `mint()`
calls on your contract (no Seaport orders, no singleton).

> **Auth, ETH payment model, chains, `social_links`** are shared by every
> NFT sub-skill and live in ONE place: the
> [root router](../SKILL.md). This rail adds no backend payment —
> there is **no ETH quote and no x402** here; you pay only deploy gas +
> per-call gas from your own wallet. The two Pinata pin routes accept the
> same wallet-signature trio as every other route (or the legacy
> `cc0_agent_…` key / a browser session cookie); `seadrop/record`,
> `seadrop/allowlist` and the `oe/*` endpoints are **open** (no auth) —
> the on-chain `owner()` is the real gate.

> **SDK:** [`@cc0company/sdk` **v1.5.0**](../../sdk/SKILL.md) ships
> `Cc0Drops` — this whole lifecycle (pin / deploy / manage / mint) as
> typed methods, Bankr-compatible. Everything below is the raw HTTP/ABI
> contract the SDK speaks. (The fully-onchain rail is **not** in the SDK
> — raw API only.)

## The 2×2 this rail routes to

Pick a **contract** (token model) and an **edition policy** (supply):

| | **cc0drop (ERC721)** — CC0Drop | **erc1155** — CC0Drop1155 |
|---|---|---|
| Token model | unique `tokenId`s, start at 1 | editions (token-ids), many copies each |
| Pick for | 1 artwork open/limited edition, or an N-piece set (each token its own art) | multi-copy editions; add more editions to the same contract over time |
| Mint | `mint(qty)` | `mint(tokenId, qty)` |
| Special | delayed reveal, numbered OE metadata | new-edition-on-live-1155; **open-edition finality** |

| I want | Leaf |
|---|---|
| Uncapped ERC721, scarcity = time window | [`open-edition/cc0drop/SKILL.md`](open-edition/cc0drop/SKILL.md) |
| Uncapped ERC1155 edition (one tokenId, unlimited copies) | [`open-edition/erc1155/SKILL.md`](open-edition/erc1155/SKILL.md) |
| Fixed-N ERC721 + allowlist | [`limited-edition/cc0drop/SKILL.md`](limited-edition/cc0drop/SKILL.md) |
| Capped ERC1155 edition + allowlist | [`limited-edition/erc1155/SKILL.md`](limited-edition/erc1155/SKILL.md) |

Edition routers ([`open-edition/`](open-edition/SKILL.md),
[`limited-edition/`](limited-edition/SKILL.md)) hold the policy;
this file holds the mechanics every leaf reuses. Read this once, then
your leaf.

## One-shot deploy — RECOMMENDED (Bankr / step-limited agents)

If your runtime caps tool calls per turn, do **NOT** run Steps 0–5 yourself —
pin → metadata → artifacts → encode → deploy → record is too many steps in one
turn (this is the "step limit" Bankr hits). It collapses into **two API calls +
one signature**:

**1. Prepare** — pins your art + metadata, encodes the CC0Drop constructor, and
returns ONE ready transaction (**a normal call to the CC0 factory** — it deploys
the drop for you, so it has a real `to` your wallet can send; a raw `to:null`
creation tx would be mangled to `to:0x0` = nothing deployed):

```bash
curl -s https://cc0.company/api/store/agents/me/prepare-drop \
  -H "X-Owner-Address: $ADDR" -H "X-Owner-Signature: $SIG" -H "X-Owner-Message: $MSG" \
  -H "Content-Type: application/json" \
  -d '{ "name": "gm mfers", "image": "https://…/art.png", "chain": "base",
        "edition": "open", "priceEth": "0", "durationHours": 24, "maxPerWallet": 1 }'
# → { deploy_transaction: { to: "0xB958…3065", data: "0x…", value: "0x0",
#       chainId: 8453, gas: "0x…", maxFeePerGas: "0x…", maxPriorityFeePerGas: "0x…" },
#     predicted_address: "0x…",   ← the deterministic (CREATE2) drop address
#     base_uri, contract_uri, art_url,
#     finalize: { … } }           ← opaque; pass it back VERBATIM in step 3
```

**2. Send** `deploy_transaction` **exactly as returned** — `gas` + fees are
pre-set so a signer-only wallet won't under-gas the (heavy ~3.7M) deploy. Keep
the `tx_hash`, and `predicted_address` (the drop's address) from step 1.

**3. Finalize** — records the drop (image included → never blank), emits the
activity-feed event, returns the drop URL. Pass the `finalize` object from step
1 back verbatim, plus the `tx_hash` (preferred) or `predicted_address`:

```bash
curl -s https://cc0.company/api/store/agents/me/finalize-drop \
  -H "Content-Type: application/json" \
  -d '{ "tx_hash": "0x…", "finalize": { …the object from step 1… } }'
  # or:  { "contract_address": "<predicted_address>", "finalize": { … } }
# → { collection, creator, drop_url: "https://cc0.company/us/drop/0x…" }
```

Params: `name` (req), `image` (req — https/ipfs URL or `data:` URI), `chain`
(`base`|`ethereum`), `edition` (`open`|`limited`; limited needs `maxSupply`),
`priceEth` (`"0"` = free), `durationHours` (mint window; omit = open-ended),
`maxPerWallet` (0 = unlimited), `royaltyBps`, `description`.
**MVP: ERC721 CC0Drop only** — for ERC1155 or allowlists use the manual Steps
0–5 below (or [`@cc0company/sdk`](../../sdk/SKILL.md), which does the same
encoding in-process, one method).

> Compute happens on the storefront (fast); auth + the final DB record go to the
> stable backend. `finalize` is self-contained — no server-side draft to expire.

---

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
so your deploy **auto-verifies on Basescan** (Similar Match). On Ethereum
verify on Etherscan if no similar match exists yet. The response is
static per build — cache it.

## Step 1: Upload artwork → IPFS

`$ADDR` / `$SIG` / `$MSG` come from the wallet-signature shell recipe in
the [root router](../SKILL.md):

```bash
curl -X POST https://cc0.company/api/upload \
  -H "X-Owner-Address: $ADDR" \
  -H "X-Owner-Signature: $SIG" \
  -H "X-Owner-Message: $MSG" \
  -F "file=@artwork.png"
# → { ipfsHash: "Qm...", url: "https://gateway.pinata.cloud/ipfs/Qm..." }
```

(Or reuse an output from the x402 image generations — they're CC0:
[`../../agentic-marketplace/image-generation/SKILL.md`](../../agentic-marketplace/image-generation/SKILL.md).)

## Step 2: Pin metadata → IPFS

```bash
curl -X POST https://cc0.company/api/store/nft-minting/seadrop/pin \
  -H "X-Owner-Address: $ADDR" \
  -H "X-Owner-Signature: $SIG" \
  -H "X-Owner-Message: $MSG" \
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
- **Single-file layout (no trailing slash):** every token shares that one
  metadata file. This is the open-edition shape and the "unrevealed"
  placeholder shape.
- **Folder layout (trailing slash):** pass
  `"editions": [{ "image": "ipfs://…", "name": "#1" }, …]` (each entry
  may carry its own `description`/`attributes`). You get a FOLDER
  `baseURI/` back (`{ baseURI: "ipfs://<folderCid>/", folderCid,
  editions: N }`). Files are named `"1".."N"`; token ids start at 1 and
  must be contiguous.
  - **721 N-piece set:** `tokenURI(id) = baseURI + id` (extensionless).
  - **1155:** the moment a contract has (or will have) more than one
    edition, use this folder form — `uri(id) = baseURI + id`. The single
    shared file is only viable while exactly ONE edition exists; adding a
    second means re-pinning the folder (see
    [Add an edition to a live 1155](#add-an-edition-to-a-live-1155)).

(The route path says `seadrop` for historical reasons — this path used
to ride OpenSea's stock SeaDrop contracts before CC0Drop replaced them.
Same for `record` / `allowlist` below.)

## Step 3: Deploy — ONE transaction

Fetch the artifacts (Step 0) and deploy from your own wallet. The exact
constructor args are **combo-specific** — your leaf gives the precise
call (open = `maxSupply 0`; limited = fixed N; plus the erc1155 edition
struct). The skeleton:

```js
import { createWalletClient, http, parseEther } from "viem"
import { base } from "viem/chains"   // or `mainnet` for Ethereum

const { contracts, platformFeeRecipient } =
  await (await fetch("https://cc0.company/api/store/nft-minting/drop/artifacts")).json()

const hash = await walletClient.deployContract({
  abi: contracts.erc721.abi,        // or contracts.erc1155.abi
  bytecode: contracts.erc721.bytecode,
  args: [/* see your leaf */],
})
```

Constructor shapes (leaves fill in the values):

**CC0Drop (ERC721):**
```
(name, symbol, baseURI, contractURI,
 maxSupply,                      // 0 = open edition (unlimited); N = fixed cap
 paymentToken,                   // 0x0 = ETH
 publicPhase    { enabled, price, start, end, maxPerWallet },
 allowlistPhase { enabled, price, start, end, maxPerWallet, maxSupplyForPhase },
 initialMerkleRoot,              // bytes32(0) = none
 withdrawRecipients[{ recipient, percentage }],   // your 95%, bps sum ≤ 10000
 royaltyRecipient, royaltyBps,   // ERC-2981 (≤ 1000 = 10%)
 platformFeeRecipient,           // ← from the artifacts endpoint
 owner)                          // you
```

**CC0Drop1155:** same tail, edition config is one struct:
```
(name, symbol, baseURI, contractURI, paymentToken,
 EditionInit { tokenId, maxSupply, publicPhase, allowlistPhase, merkleRoot },
 withdrawRecipients, royaltyRecipient, royaltyBps, platformFeeRecipient, owner)
```

Notes that matter for both:
- `enabled` flags are **fail-closed** — a zeroed phase mints nothing.
  For an allowlist-only drop set `publicPhase.enabled: false`.
- `start: 0` / `end: 0` = no bound on that side.
- Royalty enforcement is seeded by the constructor — **do not** look for
  a validator step; there isn't one.

Deploy gas: cents on Base, materially more on ETH mainnet (it's a full
contract deploy). A sender that isn't a wallet can't `CREATE` a contract
— Bankr agents deploy with a real key / walletClient
(`ExternalSender.signMessage` covers signing, but the deploy itself needs
a signer that can broadcast a create tx).

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
    "social_links": { "website": null, "x": "gmfrens", "telegram": null, "discord": null },
    // 1155 only:
    "token_standard": "ERC1155", "token_id_1155": 1, "image_uri": "ipfs://Qm…"
  }'
```

`chain` accepts `base` (default), `ethereum`, `base-sepolia` so the drop
page reads the right network. `name`, `contract_address`, `base_uri` and
`profile_id` (or `merchant_store_id`) are required. `social_links` is
optional/display-only and **write-once** — details in the
[root router](../SKILL.md). Live at
`https://cc0.company/drop/{address}`; owner dashboard at
`/drop/{address}/manage`.

### Mint from a tweet — recording on behalf of a human

`POST /api/store/nft-minting/seadrop/record-onbehalf` — for partner
integrations (Bankr) that deploy a drop for a human who asked on Twitter.
Body = the same record fields **plus** `twitter_handle?` and
`origin_post_url?`. The creator is **derived from the contract's on-chain
`owner()`** (the deploy signature is the proof; no caller-supplied wallet
is trusted) and attributed to that wallet's profile — a lightweight
shadow profile is created if the human never logged in. The asserted
Twitter handle is stored **unverified** on the drop (never as the public
identity) until the human proves it via Sign in with X and
`POST …/seadrop/claim-onbehalf` absorbs the shadow profile.
`fee_recipient` is forced server-side to the platform wallet. Response
`201`:

```json
{ "success": true, "collection": { … },
  "creator": { "profile_id": "prof_…", "wallet": "0x…",
               "claimed": false, "asserted_twitter": "alice",
               "asserted_twitter_verified": false } }
```

> Bankr identity flow: resolve the agent via
> `GET /store/agents/by-wallet/:address`, sign the standard agent-auth
> trio for authed pin routes, and deploy with a real key/walletClient.

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

## Allowlists

The canonical merkle recipe (leaf format, tree convention, single-entry
degenerate case, builders) lives in ONE place:
[`../allowlist.md`](../allowlist.md). The two **limited** leaves apply it;
this rail only adds the persistence step below.

After setting the root (at deploy or via `setMerkleRoot`), persist the
PUBLIC preimage so the drop page can build buyers' proofs:

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

The drop page builds cc0drop buyer proofs **ONLY** from this
`seadrop_allowlist.entries` preimage — never from DB phases. Skip the
re-persist and site buyers cannot mint. Deny-only public data: tampering
can only make a proof FAIL, never forge eligibility.

## Owner lifecycle — direct calls on YOUR contract

| Action | 721 | 1155 |
|---|---|---|
| Phase (price/window/cap/on-off) | `setPublicPhase(phase)` | `setPublicPhase(tokenId, phase)` |
| Allowlist phase / rotate root | `setAllowlistPhase(phase)`, `setMerkleRoot(root)` | + `tokenId` first |
| Reveal / metadata update | `setBaseURI(uri)` (EIP-4906 — marketplaces refresh) | same |
| Airdrop (counts toward caps) | `ownerMint(qty, to)` | `ownerMint(tokenId, qty, to)` |
| New edition | — | `createEdition(EditionInit)` — **NOT alone**: [4-step flow below](#add-an-edition-to-a-live-1155) |
| Royalty (≤10%) | `setRoyalty(recipient, bps)` | same |
| Shrink a cap (never raise once minted) | — | `setMaxSupply(tokenId, newMax)` |
| Drain rounding residuals | `withdraw()` | same |
| Freeze everything forever | `sealContract()` | same |

**Delayed reveal (721 N-piece sets):** deploy with a bare placeholder
`baseURI`, keep the real folder URI in the record's `base_uri`, then one
`setBaseURI("ipfs://realFolder/")` when you're ready.

(Larger airdrop tooling — holder snapshots etc. — lives in
[`../airdrops.md`](../airdrops.md).)

## Add an edition to a live 1155

Calling `createEdition(EditionInit)` **alone ships broken metadata**: the
contract composes `uri(id) = baseURI + id`, and the folder pinned at
deploy doesn't contain a file for the new id (a single-file baseURI is
worse — every edition shares one JSON). Four steps, two signatures:

1. **Read the existing metadata on-chain** — for every live edition, call
   `uri(id)` and fetch the JSON (swap `ipfs://` for a gateway). You're
   about to re-pin ALL of it.
2. **Re-pin the FULL folder including the new id** —
   `POST /api/store/nft-minting/seadrop/pin` with `editions: […]`
   carrying every existing edition's metadata PLUS the new one (files are
   named `"1".."N"`; token ids must stay contiguous). Returns the new
   `baseURI: "ipfs://<newFolder>/"`.
3. **`setBaseURI("ipfs://<newFolder>/")`** — signature 1. EIP-4906 fires
   so marketplaces refresh; existing editions are unchanged (same JSON,
   new folder).
4. **`createEdition({ tokenId, maxSupply, publicPhase, allowlistPhase,
   merkleRoot })`** — signature 2. Phases are fail-closed, same as at
   deploy.

No DB record update needed — the drop page probes `editionExists(id)`
on-chain and picks the new edition up automatically. Full walkthrough in
the [erc1155 leaves](limited-edition/erc1155/SKILL.md).

## Numbered editions — dynamic metadata (CC0Drop ERC721)

An open edition is **unbounded**, so you can't pre-render one IPFS JSON
per token — which is why the standard open-edition setup shares ONE
metadata file (every token looks identical, same name). If you want every
mint to read **"GM Frens #42"** instead, switch the drop to the
platform's dynamic metadata endpoint. CC0Drop composes
`tokenURI(id) = baseURI + rawTokenId` (no `.json`) whenever `baseURI`
ends in `/` — so the baseURI just has to point at the numbered endpoint.
Free: no auth, no payment, pure DB + dynamic serving. Works for numbered
**limited** editions too (fixed `maxSupply`, no folder pinning needed).

### Enable it (existing drop, one signature)

```bash
curl -X POST https://cc0.company/api/store/nft-minting/oe/enable-numbering \
  -H "Content-Type: application/json" \
  -d '{ "contract_address": "0xYourDrop" }'
# → { "success": true, "slug": "3f6c…-…",           // unguessable metadata_slug
#     "base_uri": "https://api.cc0.company/store/nft-minting/oe/3f6c…/" }  // TRAILING SLASH
```

Requires the drop to be **recorded already** (Step 4 — lookup is by
`contract_address`). Idempotent. The backend mints an unguessable
`metadata_slug` (the public URL never leaks your contract address) and
best-effort backfills the shared image + attributes from your pinned
`base_uri` JSON. Then point the contract at it — the returned URI,
verbatim:

```js
setBaseURI("https://api.cc0.company/store/nft-minting/oe/<slug>/")  // owner, 1 tx
```

`setBaseURI` emits `BatchMetadataUpdate` (EIP-4906), so OpenSea and
wallets renumber **already-minted** tokens automatically — retrofitting a
live drop works.

### What it serves

`GET /api/store/nft-minting/oe/:slug/:tokenId` (public, CORS `*`, cached
5 min; token ids start at 1) returns standard ERC721 metadata:

```json
{
  "name": "GM Frens #42",
  "description": "…",
  "image": "ipfs://…",                 // token_image_uri, falls back to collection_image
  "external_url": "https://…",         // only if the record has one
  "attributes": [ { "trait_type": "Edition", "value": "Open" } ]   // token_attributes, or this default
}
```

Every token reuses ONE shared `token_image_uri` + `token_attributes` set
— only the name is numbered. (Per-token DIFFERENT art is the other model:
pin a folder with `editions: […]` in Step 2 instead.)

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

Partial update: omitted fields are preserved, an explicit `null` clears.
`image_uri`/`attributes`/`description` change what the slug endpoint
serves **without touching the contract's live baseURI**; `base_uri`
(optional) only updates the record's stored copy used for future
backfills — never the on-chain pointer. Metadata refreshes lazily; expect
marketplaces to pick changes up on their next refresh (≤5-min server
cache).

## Check your drop (stats & mints)

On-chain reads on YOUR contract are the source of truth:

| Read | 721 | 1155 |
|---|---|---|
| Minted so far | `totalMinted()` / `totalSupply()` | `totalMinted(tokenId)` |
| Cap | `maxSupply()` (0 = open) | `maxSupply(tokenId)` |
| Phase state | `publicPhase()`, `allowlistPhase()` | same + `tokenId` first |
| Allowlist root | `merkleRoot()` | `merkleRoot(tokenId)` |
| Edition liveness | — | `editionExists(id)`, `editionClosed(id)` |

The record (name, images, allowlist preimage) is a public lookup:

```bash
curl "https://cc0.company/api/store/nft-minting/collections?contract_address=0xYourDrop"
```

⚠️ `GET /agents/me/collections/:id/mints` and `…/stats` are
**DB-phase-based** — they count platform-managed phase mints and do NOT
see direct on-chain CC0Drop mints. Don't use them on this path.

## Fees & economics

- **Mint proceeds:** 95% to your `withdrawRecipients` (pushed at each
  mint), 5% to the platform. In-contract, no invoices.
- **Royalties:** ERC-2981 + Limit Break enforcement, set at deploy,
  adjustable ≤10% via `setRoyalty`.
- **Costs:** IPFS pinning is free (platform-covered); you pay only deploy
  gas (~$0.05–0.30 on Base; more on Ethereum mainnet) and per-call gas
  afterwards. No backend payments on this path.

## Leaves & related

- Edition routers: [`open-edition/SKILL.md`](open-edition/SKILL.md) ·
  [`limited-edition/SKILL.md`](limited-edition/SKILL.md)
- Leaves: [`open-edition/cc0drop`](open-edition/cc0drop/SKILL.md) ·
  [`open-edition/erc1155`](open-edition/erc1155/SKILL.md) ·
  [`limited-edition/cc0drop`](limited-edition/cc0drop/SKILL.md) ·
  [`limited-edition/erc1155`](limited-edition/erc1155/SKILL.md)
- [`../SKILL.md`](../SKILL.md) — root router: auth, ETH payment model,
  chains, `social_links`
- [`../allowlist.md`](../allowlist.md) — canonical merkle recipe
- [`../../sdk/SKILL.md`](../../sdk/SKILL.md) — `Cc0Drops` (covers this
  whole rail)
- [`../examples/e2e-cc0drop.mjs`](../examples/e2e-cc0drop.mjs) — runnable:
  pin → deploy → record → mint
- [`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md) — SSTORE2
  permanent-storage alternative
- [`../airdrops.md`](../airdrops.md) — airdrop tooling
