---
name: cc0company-nft-ipfs-open-erc1155
version: 3.0.0
description: Launch an uncapped ERC1155 open edition on the IPFS rail — CC0Drop1155 deployed with EditionInit.maxSupply 0 so one tokenId takes unlimited fungible copies while the window is open. This leaf gives the exact open-edition deploy call, the add-edition-to-live-1155 flow, and the CRITICAL forever-close finality footgun. Links up for everything shared.
homepage: https://cc0.company
api_base: https://cc0.company/api
---

# CC0Drop1155 — Open Edition

One tokenId, **unlimited fungible copies** while the window is open. Art
+ metadata on IPFS, deployed in one self-signed tx. Copies share one
tokenId, so there is no per-mint "#N" numbering (irrelevant for
fungible editions).

> **Read first — shared IPFS mechanics** (pin art, pin metadata, get
> artifacts, record, owner lifecycle, minting): the rail router
> [`../../SKILL.md`](../../SKILL.md).
> **Auth / ETH payment / chains / `social_links`:** the
> [root router](../../../SKILL.md).
> **SDK:** [`@cc0company/sdk` `Cc0Drops`](../../../../sdk/SKILL.md) covers
> this flow as typed methods.

## The deploy call (open-specific)

### ★ Do this — ONE SDK call (any signer, incl. Bankr/CDP)

`@cc0company/sdk` ≥ 1.7.0 pins art + metadata, deploys, and records in one method.
**Prefer this always** — do NOT hand-roll or call a wallet `deployContract` helper
(it breaks on a `sender`).

```js
import { Cc0Drops } from "@cc0company/sdk"
await new Cc0Drops({ sender }).launchDrop1155({   // or { walletClient } / { account }
  name: "GM Editions", symbol: "GMED",
  image: pngBytes,               // bytes | Blob | dataURL | https — pinned for you
  firstEdition: { maxSupply: 0,  // 0 = OPEN EDITION (unlimited copies of tokenId 1)
    publicPhase: { priceEth: "0.001", maxPerWallet: 0, end: 1783900000 } },
})  // → deploys via the CC0 factory (raw calldata) + records → live on cc0.company
```

That's the whole deploy — live + recorded automatically. Any signer works
(walletClient / CDP / Bankr `sender`).

- **`firstEdition.maxSupply: 0`** = open edition on this tokenId.
- `end: 0` = never closes; a set `end` closes the window (and triggers
  finality — see below).
- Phases fail-closed; allowlist-only window → `publicPhase.enabled: false`
  + an allowlist phase (recipe: [`../../../allowlist.md`](../../../allowlist.md)).

Record with `token_standard: "ERC1155"`, `token_id_1155: 1`,
`max_supply: "0"`, `drop_contract: "cc0drop"` (rail router Step 4).

## ⚠️ Open-edition FINALITY — read before shipping

An open edition (`maxSupply: 0`) whose mint window has **ended** is closed
**forever, on-chain**. `setPublicPhase`, `setAllowlistPhase`,
`setMerkleRoot`, `ownerMint` **and** `setMaxSupply` all revert
`EditionClosed` — its scarcity IS the time window and not even the owner
can reopen or dilute it. Rules:

- Extending a **still-live** window is allowed (the phase never ended).
- `end: 0` (no end) never closes.
- **Capped** editions are exempt (the cap protects holders) — that's the
  [limited erc1155 leaf](../../limited-edition/erc1155/SKILL.md).
- Check `editionClosed(tokenId)` before any owner action.
- You can always `createEdition` a NEW tokenId on the same contract (see
  below).

Shipping a 24h open edition means that after 24h that edition is done.
That's the collectors' guarantee — it's the point. There is no support
ticket that reopens a closed edition. (CC0Drop ERC721 has no such rule.)

## Add a new edition to this live 1155

`createEdition(EditionInit)` **alone ships broken metadata** — the
contract composes `uri(id) = baseURI + id` and the pinned folder has no
file for the new id. Four steps, two signatures:

1. **Read** every live edition's on-chain `uri(id)` and fetch the JSON.
2. **Re-pin the FULL folder** including the new id — `POST …/seadrop/pin`
   with `editions: […]` carrying every existing edition PLUS the new one
   (files `"1".."N"`, contiguous ids). → new `baseURI: "ipfs://<folder>/"`.
3. **`setBaseURI("ipfs://<newFolder>/")`** — sig 1 (EIP-4906 refresh;
   existing editions unchanged).
4. **`createEdition({ tokenId, maxSupply, publicPhase, allowlistPhase,
   merkleRoot })`** — sig 2 (phases fail-closed).

No DB record update needed — the drop page probes `editionExists(id)` and
picks it up. (Full version: rail router
[Add an edition to a live 1155](../../SKILL.md#add-an-edition-to-a-live-1155).)
A NEW edition is a clean slate — it is NOT affected by another edition's
finality, so this is the escape hatch after a window closes.

## Manage + mint (open-specific)

- **Extend a still-live window:** `setPublicPhase(tokenId, phase)` — only
  works while the window hasn't ended (finality).
- **Airdrop:** `ownerMint(tokenId, qty, to)` — reverts once the OE window
  has ended. ⚠️ to a CONTRACT, `to` must implement `IERC1155Receiver`.
- **Mint (anyone):** `mint(tokenId, qty)` payable, `value = price × qty`.
  Overpay refunds, underpay reverts; 95/5 split in-tx.

## Related

- Rail mechanics (pin/deploy/record/manage): [`../../SKILL.md`](../../SKILL.md)
- Open-edition policy + finality summary: [`../SKILL.md`](../SKILL.md)
- Root router (auth/payment/chains/social_links): [`../../../SKILL.md`](../../../SKILL.md)
- SDK `Cc0Drops`: [`../../../../sdk/SKILL.md`](../../../../sdk/SKILL.md)
- Capped counterpart (exempt from finality): [`../../limited-edition/erc1155/SKILL.md`](../../limited-edition/erc1155/SKILL.md)
- Add an allowlist window: [`../../../allowlist.md`](../../../allowlist.md)
