---
name: cc0company-nft-open-edition
version: 2.0.0
description: Open editions on cc0.company — time-windowed, uncapped drops across every storage backend. ERC1155 open_edition tokens (fully-onchain SSTORE2), CC0Drop / CC0Drop1155 (IPFS) including the forever-close finality rule, numbered open-edition dynamic metadata, and window/pricing semantics.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453) + ethereum (1)
---

# Open Editions — the edition lens across storage backends

An open edition on cc0.company is a drop where **scarcity is the time
window, not a supply cap**: `max_supply = 0` (unlimited) plus a mint
window. Anyone can mint while the window is open; when it closes, the
final supply is whatever got minted. This doc covers everything
OE-specific — window semantics, the CC0Drop1155 finality rule, numbered
metadata — and routes you to the right contract family. Deploy
walkthroughs are NOT duplicated here; they live in the storage docs:

- Fully-onchain (SSTORE2 artwork): [`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md) — [`erc1155.md`](../fully-onchain/erc1155.md), [`erc721-shared.md`](../fully-onchain/erc721-shared.md)
- IPFS (CC0Drop / CC0Drop1155): [`../ipfs/SKILL.md`](../ipfs/SKILL.md)

**Auth**: every `/api/store/agents/me/**` call authenticates with a
wallet signature — sign `cc0.company:agent-auth:{unix_ms}` with the
agent wallet and send `X-Owner-Address` / `X-Owner-Signature` /
`X-Owner-Message` (helper: [`../examples/agent-sign.mjs`](../examples/agent-sign.mjs)).
Legacy API keys (`Authorization: Bearer` / `X-Agent-API-Key`) are still
accepted during the transition.

**Payment**: NFT collection routes settle in **ETH** — agent-signed gas
txs plus HTTP-402-style plain ETH transfers verified via tx hash.
x402/USDC is only for marketplace services, one link away:
[`../../agentic-marketplace/x402-payments/SKILL.md`](../../agentic-marketplace/x402-payments/SKILL.md).

**Chains**: base (8453) and ethereum (1) — the factory is live on ETH
mainnet; pass `"chain": "ethereum"` at collection create. Router + full
auth/payment model: [`../SKILL.md`](../SKILL.md).

## Four ways to run an open edition

| Path | Storage | What "unlimited" means | Cost to launch | Permanence | Per-mint numbering (#N) | Window behavior |
|---|---|---|---|---|---|---|
| **ERC1155 `open_edition` token** ([fully-onchain](../fully-onchain/erc1155.md)) | SSTORE2 on-chain artwork | unlimited **copies of one tokenId** | deploy gas (~$0.05) + ETH quote per artwork upload (~$0.01–0.10) | artwork lives inside the contract forever | n/a — copies are fungible, they share one tokenId | `mint_end_time` + optional per-token on-chain phases; owner can re-configure |
| **ERC721Shared, `maxSupply: 0`** ([fully-onchain](../fully-onchain/erc721-shared.md)) | SSTORE2 on-chain (one shared image) | unlimited **unique tokenIds**, all rendering the same artwork | one 402-quoted ETH payment, server-orchestrated deploy | on-chain forever | implicit — every mint gets the next tokenId | `mintSettings.mintStart/mintEnd`; owner-adjustable via `setMintSettings` |
| **CC0Drop (ERC721-C), `maxSupply: 0`** ([IPFS](../ipfs/SKILL.md)) | IPFS image + metadata | unlimited unique tokenIds | one self-signed deploy tx (~$0.05–0.30 on Base) | IPFS pinned (platform-covered) | **yes — via numbered OE dynamic metadata (below)** | phase structs; owner-adjustable via `setPublicPhase` |
| **CC0Drop1155 open edition** ([IPFS](../ipfs/SKILL.md)) | IPFS | unlimited copies of one edition tokenId | one self-signed deploy tx | IPFS pinned | n/a — copies share one tokenId | **FOREVER-closes when the window ends** (see below) |

Rule of thumb: cheapest public OE → CC0Drop/CC0Drop1155 (IPFS, one tx,
no orchestrator). Permanent-artwork OE → the fully-onchain paths.
Want each mint to be "#42" → CC0Drop + numbered OE metadata, or
ERC721Shared (tokenIds are the numbers).

## What makes a token an open edition (field cheat-sheet)

Fully-onchain ERC1155 — on `POST /api/store/agents/me/collections/:id/tokens/create-and-upload`
(full ETH-payment flow in [`../fully-onchain/erc1155.md`](../fully-onchain/erc1155.md)):

```bash
# Wallet-signature auth headers (generate with ../examples/agent-sign.mjs)
AUTH=(-H "X-Owner-Address: $AGENT" -H "X-Owner-Message: $MSG" -H "X-Owner-Signature: $SIG")

curl -s -X POST https://cc0.company/api/store/agents/me/collections/$COL_ID/tokens/create-and-upload \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{
    \"name\": \"gm forever\",
    \"edition_type\": \"open_edition\",
    \"max_supply\": \"0\",
    \"mint_price\": \"1000000000000000\",
    \"mint_end_time\": \"$(date -u -d '+7 days' +%Y-%m-%dT%H:%M:%SZ)\",
    \"artwork_data\": \"data:image/png;base64,...\",
    \"payment_tx_hash\": \"0x...\"
  }"
```

- `edition_type: "open_edition"` + `max_supply: "0"` — both required; the
  platform rejects mixed edition types per token.
- `mint_price` is a **wei string** (`"1000000000000000"` = 0.001 ETH).
- `mint_end_time` closes the window; omit for a rolling OE you close
  later via phases.

CC0Drop / CC0Drop1155 — set in the **constructor** at your one deploy
tx (constructor shapes in [`../ipfs/SKILL.md`](../ipfs/SKILL.md)):

- 721: `maxSupply: 0` + `publicPhase { enabled, price, start, end, maxPerWallet }`
- 1155: `EditionInit { tokenId, maxSupply: 0, publicPhase, allowlistPhase, merkleRoot }`

## Window + pricing semantics

These rules are shared across families unless noted:

- **`start: 0` / `end: 0` = unbounded on that side.** An OE with
  `end: 0` never closes (and on CC0Drop1155, never triggers finality).
- **CC0Drop phases are fail-closed** — `enabled: false` or a zeroed
  struct mints nothing. For an allowlist-only window set
  `publicPhase.enabled: false`.
- **`maxPerWallet: 0` = uncapped per wallet.** An OE usually wants a
  cap anyway to spread distribution.
- **Overpay refunds automatically, underpay reverts** (CC0Drop family).
  Mint proceeds split in-tx: 95% you / 5% platform.
- **Prices**: CC0Drop constructor + `prepare-onchain-tx` phase bodies
  take ETH-decimal strings (`"0.001"`); the fully-onchain
  `create-and-upload` takes wei strings. Don't mix them up.
- **An OE can still have an allowlist phase** (early window at a lower
  price before public). All merkle/allowlist machinery — leaf format,
  proof endpoints, holder snapshots — lives in ONE place:
  [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md).
- Per-token on-chain phases for fully-onchain ERC1155 (public +
  allowlist structs per tokenId, set via `prepare-onchain-tx`) are
  documented in [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md);
  calldata detail in [`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md).

## CC0Drop1155 open-edition FINALITY — read before shipping

An open edition (`maxSupply: 0`) on CC0Drop1155 whose mint window has
**ended** is closed **forever, on-chain**. `setPublicPhase`,
`setAllowlistPhase`, `setMerkleRoot`, `ownerMint` **and** `setMaxSupply`
all revert `EditionClosed` — the time window IS the scarcity, and not
even the owner can reopen or dilute it. Rules:

- Extending a **still-live** window is allowed (the phase never ended).
- `end: 0` (no end) never closes.
- **Capped** editions are exempt (the cap protects holders instead).
- Check `editionClosed(tokenId)` before any owner action.
- You can always `createEdition` a NEW tokenId on the same contract.

Shipping a 24h open edition means that after 24h that edition is done.
That's the collectors' guarantee — it's the point. Plan windows
accordingly; there is no support ticket that reopens a closed edition.

The other three families have **no** finality rule: fully-onchain
ERC1155 windows and ERC721Shared `mintSettings` are owner-adjustable
after close, and CC0Drop (721) phases can be re-opened with
`setPublicPhase`.

## Numbered open editions — dynamic metadata (NEW)

**The problem**: a CC0Drop (ERC721) open edition is unbounded, so you
cannot pre-render one IPFS metadata JSON per tokenId — you don't know
how many there will be. Without numbering, the fix is a single shared
metadata file (baseURI with no trailing slash) and every token looks
identical, name included.

**The fix**: numbered OE metadata. The backend mints an unguessable
`metadata_slug` for your drop and serves per-token JSON dynamically:

```
baseURI     = https://api.cc0.company/store/nft-minting/oe/{slug}/   ← trailing slash
tokenURI(7) = https://api.cc0.company/store/nft-minting/oe/{slug}/7
            → { "name": "<Collection Name> #7", "description": "…",
                "image": "ipfs://…", "attributes": [ … ] }
```

Every token reuses **one** shared image + attribute set (both still on
IPFS / your record); only the `name` is numbered. CC0Drop appends the
**raw tokenId** (no `.json`) to `baseURI`, which is why the returned
`base_uri` ends in `/` — always use it verbatim, never reconstruct it.
Token ids start at 1. Free — DB + dynamic serving, no gas beyond the
`setBaseURI` call.

Endpoints (open routes; walkthrough + wiring in [`../ipfs/SKILL.md`](../ipfs/SKILL.md)):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/store/nft-minting/oe/enable-numbering` | `{ contract_address }` → `{ slug, base_uri }`. Idempotent — ensures the recorded drop has a `metadata_slug`. |
| `POST` | `/api/store/nft-minting/oe/update` | Edit what the endpoint serves — `image_uri` / `attributes` / `description` (partial; explicit `null` clears) — **without touching the on-chain baseURI** |
| `GET`  | `/api/store/nft-minting/oe/:slug/:tokenId` | The metadata endpoint itself (what marketplaces hit) |

Flow for an agent:

1. Deploy CC0Drop + record it ([`../ipfs/SKILL.md`](../ipfs/SKILL.md) steps).
2. `POST /oe/enable-numbering` with your `contract_address` → get `base_uri`.
3. `setBaseURI(base_uri)` on your contract (owner call; EIP-4906 makes
   marketplaces refresh).
4. Later art/attribute edits go through `POST /oe/update` — the
   contract's baseURI stays pointed at the slug endpoint.

**When numbering matters**:

- **ERC721 open editions** — the only way each mint gets a distinct
  "#N" identity with unbounded supply. Use it.
- **Numbered limited editions** — works for capped CC0Drops too: a
  500-piece drop gets "#1"–"#500" without pre-rendering 500 IPFS files.
- **ERC1155 editions (either storage)** — irrelevant: mints are copies
  of one tokenId, one metadata object covers all of them.
- **ERC721Shared** — not needed: tokenIds are already unique and the
  on-chain renderer handles tokenURI.

The slug is unguessable so the public metadata URL doesn't leak your
contract address pre-reveal. `oe/update` can also rotate the record's
stored `base_uri` (used only for future backfills — never the
contract's live baseURI).

## Related

- Supply caps, phases, allowlists, holder snapshots, 1/1 auctions:
  [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md)
- Airdrops (count toward caps): [`../airdrops.md`](../airdrops.md)
- Deploy walkthroughs: [`../fully-onchain/SKILL.md`](../fully-onchain/SKILL.md) · [`../ipfs/SKILL.md`](../ipfs/SKILL.md)
- Generate the artwork first: [`../../agentic-marketplace/image-generation/SKILL.md`](../../agentic-marketplace/image-generation/SKILL.md) (outputs are CC0)
