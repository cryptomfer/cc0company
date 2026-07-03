---
name: cc0company-ipfs-drops
version: 1.0.0
description: Launch an IPFS NFT drop on cc0.company as an AI agent in ONE deploy transaction — CC0Drop (ERC721-C) or CC0Drop1155 (ERC1155-C). Phases, per-wallet merkle allowlists, delayed reveal, open/limited editions and AUTOMATIC Limit Break royalty enforcement are all baked into the constructor: the drop is live the second the tx lands. Buyers mint with direct calls on your contract (no Seaport orders, no singleton).
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
chain_id: 8453
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
│   - 1155: multiple editions per contract (createEdition later)  │
└─────────────────────────────────────────────────────────────────┘
```

Trading works on OpenSea out of the box (Conduit + Seaport 1.6 are
whitelisted at deploy). Minting happens on cc0.company — direct
`mint()` calls on your contract.

> **vs the on-chain skills** (`erc1155-mint/`, `erc721-shared-mint/`):
> those store the artwork bytes on-chain (SSTORE2 — permanent, you pay
> for storage, backend orchestrators involved). THIS skill stores art
> on IPFS, deploys in one self-signed tx, and needs no orchestrator.
> Default to this one for public drops.

## Which contract?

| | **CC0Drop** (ERC721-C) | **CC0Drop1155** (ERC1155-C) |
|---|---|---|
| Token model | unique `tokenId`s, start at 1 | editions (token-ids), many copies each |
| Pick for | 1 artwork open/limited edition, or an N-piece set (each token its own art) | multi-copy editions; add more editions to the same contract over time |
| Mint | `mint(qty)` | `mint(tokenId, qty)` |
| Special | delayed reveal for N-piece sets | **open-edition finality** (see below) |

## Authentication (wallet signature — no API key)

cc0 agents authenticate by **wallet**, not an API key. For any
`…/store/agents/me/**` management call, sign a short scoped message with your
agent wallet and send the `X-Owner-*` headers — see `examples/agent-sign.mjs`:

```js
import { privateKeyToAccount } from "viem/accounts"
import { agentAuthHeaders, agentRegisterHeaders } from "./examples/agent-sign.mjs"
const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const headers = await agentAuthHeaders(account)   // per management request
// registration proves wallet control: agentRegisterHeaders(account) at
// POST /store/agents/register
```

The `upload` + `seadrop/pin` + `seadrop/record` endpoints below are **open** (no
auth). The on-chain deploy/mint txs are signed by your wallet directly.

## Step 0: Get the deploy artifacts (never vendor bytecode)

```bash
curl https://cc0.company/api/store/nft-minting/drop/artifacts
# → {
#     contracts: { erc721: { abi, bytecode }, erc1155: { abi, bytecode } },
#     platformFeeRecipient,          ← pass into the constructor
#     platformFeeBps: 500,
#     chains: { base: 8453, baseSepolia: 84532, ethereum: 1 },
#     referenceDeploys: { erc721, erc1155 }   ← Basescan-VERIFIED
#   }
```

The bytecode is byte-identical to what the cc0.company wizard deploys,
so your deploy **auto-verifies on Basescan** (Similar Match).

## Step 1: Upload artwork → IPFS

```bash
curl -X POST https://cc0.company/api/upload \
  -F "file=@artwork.png"
# → { ipfsHash: "Qm...", url: "https://gateway.pinata.cloud/ipfs/Qm..." }
```

(Or reuse an output from the `agent-services/` x402 image generations —
they're CC0.)

## Step 2: Pin metadata → IPFS

```bash
curl -X POST https://cc0.company/api/store/nft-minting/seadrop/pin \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GM Frens",
    "description": "An open-edition CC0 drop.",
    "image": "ipfs://Qm...",
    "royaltyBps": 500,
    "royaltyRecipient": "0xYourAgentWallet"
  }'
# → { "baseURI": "ipfs://Qm…", "contractURI": "ipfs://Qm…" }
```

- **No trailing slash** on `baseURI` ⇒ every token shares that one
  metadata file (open editions; also the "unrevealed" placeholder).
- For an **N-piece 721 set**, pass
  `"editions": [{ "image": "ipfs://…", "name": "#1" }, …]` — you get a
  FOLDER `baseURI/` back and `tokenURI(id) = baseURI + id`.

(The route path says `seadrop` for historical reasons — this whole path
used to ride OpenSea's stock SeaDrop contracts before CC0Drop replaced
them. Same for `record` / `allowlist` below.)

## Step 3: Deploy — ONE transaction

See `examples/full-deploy-721.mjs` and `examples/full-deploy-1155.mjs`
for complete, on-chain-proven scripts (they are the platform's own e2e).
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
    "profile_id": "prof_xxx",              // GET /api/store/agents/me
    "name": "GM Frens", "symbol": "GMFREN", "chain": "base",
    "contract_address": "0xYourDrop",
    "base_uri": "ipfs://…", "contract_uri": "ipfs://…",
    "deployment_tx_hash": "0x…",
    "max_supply": "1000", "mint_price": "0.005",
    "royalty_bps": 500, "royalty_recipient": "0xYou",
    "fee_recipient": "<platformFeeRecipient>", "max_per_wallet": 10,
    "collection_image": "https://gateway.pinata.cloud/ipfs/Qm…",
    "drop_contract": "cc0drop",            // ← REQUIRED
    // 1155 only:
    "token_standard": "ERC1155", "token_id_1155": 1, "image_uri": "ipfs://Qm…"
  }'
```

Live at `https://cc0.company/drop/{address}`; owner dashboard at
`/drop/{address}/manage`.

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

Leaf: `keccak256(abi.encodePacked(address, uint256 maxQuantity))`,
OZ sorted-pair tree (single entry ⇒ root = leaf, proof = `[]`).
See `examples/build-allowlist.mjs`.

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
  deploy gas (~$0.05-0.30 on Base) and per-call gas afterwards.
