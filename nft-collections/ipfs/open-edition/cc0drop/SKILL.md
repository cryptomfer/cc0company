---
name: cc0company-nft-ipfs-open-cc0drop
version: 3.0.0
description: Launch an uncapped ERC721 open edition on the IPFS rail — CC0Drop deployed with maxSupply 0 so scarcity is the mint window, not a cap. Unique tokenIds start at 1; each mint can read "#42" via numbered dynamic metadata. This leaf gives the exact open-edition constructor call, the open-specific manage + mint, and links up for everything shared.
homepage: https://cc0.company
api_base: https://cc0.company/api
---

# CC0Drop (ERC721) — Open Edition

The cheapest per-mint-unique open edition: one CC0Drop deploy with
`maxSupply: 0`. Unlimited unique tokenIds (start at 1), scarcity = the
public window, art + metadata on IPFS. Each mint can carry a distinct
**"#42"** identity via numbered dynamic metadata.

> **Read first — shared IPFS mechanics** (pin art via `POST /api/upload`,
> pin metadata via `POST …/seadrop/pin`, get artifacts, record the drop,
> owner lifecycle, the full numbered-OE metadata mechanism): the rail
> router [`../../SKILL.md`](../../SKILL.md).
> **Auth / ETH payment / chains / `social_links`:** the
> [root router](../../../SKILL.md).
> **SDK:** [`@cc0company/sdk` `Cc0Drops`](../../../../sdk/SKILL.md) covers
> this whole flow as typed methods.

## The deploy call (open-specific)

### ★ Do this — ONE SDK call (any signer, incl. Bankr/CDP)

`@cc0company/sdk` ≥ 1.7.0. This pins art + metadata, deploys, and records — the
whole leaf in one method. **Prefer this always.** Do NOT hand-roll pin/encode or
call a wallet `deployContract` helper (it breaks on this contract).

```js
import { Cc0Drops } from "@cc0company/sdk"
await new Cc0Drops({ sender }).launchDrop721({   // or { walletClient } / { account }
  name: "GM Frens", symbol: "GMFREN",
  image: pngBytes,               // bytes | Blob | dataURL | https URL — pinned for you
  maxSupply: 0,                  // 0 = OPEN EDITION
  publicPhase: { priceEth: "0.005", maxPerWallet: 10, end: 1783900000 }, // end:0 = never closes
})  // → deploys via the CC0 factory (raw calldata) + records → live on cc0.company
```

That's the whole deploy — it's live at `https://cc0.company/drop/{addr}`,
recorded automatically. Any signer works (walletClient / CDP / Bankr `sender`).

Open-edition specifics (passed to `launchDrop721`):
- **`maxSupply: 0`** is what makes it open. There is no setter — the drop
  is open for its whole life.
- Scarcity is the window: set `publicPhase.end` to close it, or `end: 0`
  to never close.
- **`start: 0` / `end: 0` = unbounded** on that side; `maxPerWallet: 0` =
  uncapped per wallet (usually set a cap to spread distribution).
- Allowlist-only early window? Pass an `allowlist` with `enabled: false` public
  phase (recipe: [`../../../allowlist.md`](../../../allowlist.md); `launchDrop721`
  builds + persists the merkle preimage for you).

## Numbered "#N" identity (the open-edition win)

An unbounded OE can't pre-render one IPFS JSON per token, so the plain
setup shares ONE file and every token looks identical. To make each mint
read **"GM Frens #42"**, point the drop at the platform's numbered
dynamic-metadata endpoint:

1. Deploy + record (above).
2. `POST /api/store/nft-minting/oe/enable-numbering { contract_address }`
   → `{ slug, base_uri }` (trailing slash).
3. `setBaseURI(base_uri)` on your contract (owner; EIP-4906 renumbers
   already-minted tokens).
4. Later art/attribute edits: `POST …/oe/update` — no on-chain tx.

Every token reuses one shared image + attribute set; only the `name` is
numbered. Full endpoint semantics (what it serves, update rules, 5-min
cache) are in the rail router
[Numbered editions](../../SKILL.md#numbered-editions--dynamic-metadata-cc0drop-erc721).
For per-token **different** art, pin a folder with `editions: […]`
instead (rail router Step 2) — that's an N-piece set, not a shared OE.

## Manage + mint (open-specific)

- **Reopen / extend the window:** `setPublicPhase(phase)` — CC0Drop
  (ERC721) has **no finality rule**, so you can re-open a closed public
  phase any time (unlike the 1155 OE, which closes forever).
- **Airdrop:** `ownerMint(qty, to)` — always allowed on an open 721
  (no cap to respect).
- **Mint (anyone):** `mint(qty)` payable, `value = price × qty`. Gift via
  `mintTo(qty, to)`. Overpay refunds, underpay reverts; 95/5 split in-tx.

Everything else (record fields, reveal, royalties, stats reads) is in the
rail router.

## Related

- Rail mechanics (pin/deploy/record/manage, numbered metadata):
  [`../../SKILL.md`](../../SKILL.md)
- Open-edition policy: [`../SKILL.md`](../SKILL.md)
- Root router (auth/payment/chains/social_links): [`../../../SKILL.md`](../../../SKILL.md)
- SDK `Cc0Drops`: [`../../../../sdk/SKILL.md`](../../../../sdk/SKILL.md)
- Add an allowlist window: [`../../../allowlist.md`](../../../allowlist.md)
- Fixed-cap counterpart: [`../../limited-edition/cc0drop/SKILL.md`](../../limited-edition/cc0drop/SKILL.md)
