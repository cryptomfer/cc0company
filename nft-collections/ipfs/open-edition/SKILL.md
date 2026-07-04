---
name: cc0company-nft-ipfs-open
version: 3.0.0
description: Open-edition policy on the IPFS rail — an uncapped drop (max_supply 0) whose scarcity is the mint window, not a supply cap. Anyone mints while the window is open; final supply is whatever got minted. Covers what "open" means on CC0Drop (ERC721) vs CC0Drop1155, then routes to the two leaves. The CC0Drop1155 open edition carries a forever-close finality footgun — flagged here, detailed in its leaf.
homepage: https://cc0.company
api_base: https://cc0.company/api
---

# IPFS Open Editions — policy router

An **open edition** is a drop where scarcity is the **time window, not a
supply cap**: `maxSupply: 0` (unlimited) plus a mint window. Anyone can
mint while the window is open; when it closes, the final supply is
whatever got minted.

> Shared IPFS mechanics (pin art, pin metadata, artifacts endpoint, 1-tx
> deploy skeleton, record, minting, owner lifecycle, numbered OE
> metadata, add-edition-to-live-1155) live in the rail router:
> [`../SKILL.md`](../SKILL.md). Auth / ETH payment model / chains /
> `social_links`: the [root router](../../SKILL.md).

## Window + pricing semantics (both contracts)

- **`start: 0` / `end: 0` = unbounded on that side.** An OE with `end: 0`
  never closes (and on CC0Drop1155, never triggers finality).
- **Phases are fail-closed** — `enabled: false` or a zeroed struct mints
  nothing. For an allowlist-only window set `publicPhase.enabled: false`.
- **`maxPerWallet: 0` = uncapped per wallet.** An OE usually wants a cap
  anyway to spread distribution.
- **Overpay refunds automatically, underpay reverts.** Proceeds split
  in-tx: 95% you / 5% platform.
- **Prices are ETH-decimal strings** (`"0.001"`) in the CC0Drop
  constructor + phase bodies — not wei.
- **An OE can still have an allowlist phase** (early window at a lower
  price before public). Merkle recipe:
  [`../../allowlist.md`](../../allowlist.md).

## The two leaves

| | Contract | "Unlimited" means | Per-mint numbering (#N) | Leaf |
|---|---|---|---|---|
| **cc0drop (ERC721)** | CC0Drop, `maxSupply: 0` | unlimited unique tokenIds | **yes** — numbered OE dynamic metadata | [`cc0drop/SKILL.md`](cc0drop/SKILL.md) |
| **erc1155** | CC0Drop1155, `EditionInit.maxSupply: 0` | unlimited copies of one tokenId | n/a — copies share one tokenId | [`erc1155/SKILL.md`](erc1155/SKILL.md) |

- **Each mint should be "#42"** → cc0drop (ERC721) + numbered OE metadata.
  The numbered-metadata mechanism itself is documented in the rail router;
  the leaf wires it into the open flow.
- **Multi-copy fungible edition** → erc1155.

## ⚠️ Finality footgun (erc1155 only)

A CC0Drop1155 open edition (`maxSupply: 0`) whose window has **ended** is
closed **forever, on-chain** — no owner action reopens it. CC0Drop
(ERC721) has **no** finality rule; its phases can be re-opened with
`setPublicPhase`. This is the single biggest thing to get right before
shipping a 1155 OE — the full rule lives in
[`erc1155/SKILL.md`](erc1155/SKILL.md).

## Related

- Rail mechanics: [`../SKILL.md`](../SKILL.md)
- Limited (fixed-N) counterpart: [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md)
- Merkle allowlist recipe: [`../../allowlist.md`](../../allowlist.md)
- Root router (auth/payment/chains): [`../../SKILL.md`](../../SKILL.md)
- Airdrops: [`../../airdrops.md`](../../airdrops.md)
