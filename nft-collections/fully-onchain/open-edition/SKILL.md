---
name: cc0company-nft-fully-onchain-open
version: 3.0.0
description: Open editions on the fully-onchain rail — time-windowed, uncapped drops with artwork stored on-chain via SSTORE2. Scarcity is the mint window, not a supply cap (max_supply 0). Pick contract family (cc0drop ERC721 single-artwork, or erc1155 multi-token). Base + Ethereum mainnet.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base (8453), ethereum (1)
---

# Fully on-chain — open editions

An open edition is a drop where **scarcity is the time window, not a supply
cap**: `max_supply` / `maxSupply` = `0` (unlimited) plus a mint window. Anyone
mints while the window is open; when it closes, the final supply is whatever
got minted. On this rail the artwork lives on-chain (SSTORE2) forever.

**Auth, ETH payment model, chains, and `social_links` live in the
[root router](../../SKILL.md).** Rail mechanics (SSTORE2 economics, the 402
upload flow, deploy patterns, phase dispatcher) live one level up in the
[rail router](../SKILL.md). This router just states the open-edition policy on
this rail and points at the two leaves.

## Pick your contract

| | **cc0drop (ERC721)** | **erc1155** |
|---|---|---|
| Leaf | [`cc0drop/SKILL.md`](cc0drop/SKILL.md) | [`erc1155/SKILL.md`](erc1155/SKILL.md) |
| Contract | `CC0CollectionShared` (v3) | `CC0Collection1155` (v12) |
| What "unlimited" means | unlimited **unique tokenIds**, all rendering the same on-chain image | unlimited **copies of one tokenId** |
| Per-mint numbering (#N) | implicit — every mint gets the next tokenId | n/a — copies are fungible under one tokenId |
| Deploy | one 402-quoted ETH payment, server-orchestrated | agent signs factory tx, then 402 per token |
| Window control | `mintSettings.mintStart/mintEnd`, owner-adjustable via `setMintSettings` | `mint_end_time` + optional per-token on-chain phases, owner-reconfigurable |

Want each mint to read "#42"? cc0drop (ERC721) gives it for free — tokenIds
are the numbers, and the on-chain renderer produces per-token `tokenURI`. On
erc1155 an open token is fungible copies of one id, so no per-copy number.

## What makes it an open edition

- **cc0drop (ERC721):** `max_supply: 0` in the deploy draft / `maxSupply: "0"`
  in `deploy_params`. Every mint gets the next unique tokenId; all share one
  on-chain image.
- **erc1155:** `edition_type: "open_edition"` + `max_supply: "0"` on
  `create-and-upload` (both required — the platform rejects mixed edition
  types per token). `mint_end_time` closes the window; omit for a rolling OE
  you close later via phases.

## Window + pricing semantics (both leaves)

- **`start: 0` / `end: 0` = unbounded on that side.** An OE with `end: 0`
  never closes.
- **`maxPerAddress` / `max_per_wallet` = 0 = uncapped per wallet.** An OE
  usually wants a cap anyway to spread distribution.
- **Prices:** erc1155 `create-and-upload` `mint_price` is a **wei string**
  (`"1000000000000000"` = 0.001 ETH); `prepare-onchain-tx` phase bodies and
  cc0drop DB-phase prices are **ETH-decimal strings** (`"0.001"`). Don't mix
  them up — it encodes an astronomically wrong on-chain price.
- **Overpay refunds, underpay reverts.** Mint proceeds split in-tx: 95% you /
  5% platform.
- **An OE can still gate an early window with an allowlist phase** (lower
  price before public). All merkle/allowlist machinery lives in
  [`../../allowlist.md`](../../allowlist.md).

**No finality footgun on this rail.** Unlike CC0Drop1155 (IPFS), where an
ended open-edition window closes *forever* on-chain, fully-onchain windows are
owner-adjustable after close: erc1155 phases can be re-configured and
`CC0CollectionShared` `mintSettings` can be re-opened with `setMintSettings`.

## Related

- [`cc0drop/SKILL.md`](cc0drop/SKILL.md) — single-artwork ERC721, open
- [`erc1155/SKILL.md`](erc1155/SKILL.md) — multi-token, open token
- [`../SKILL.md`](../SKILL.md) — rail router: SSTORE2, 402 uploads, deploy patterns
- [`../../SKILL.md`](../../SKILL.md) — root: auth, ETH payment, chains, `social_links`
- [`../limited-edition/SKILL.md`](../limited-edition/SKILL.md) — the capped counterpart
- [`../../airdrops.md`](../../airdrops.md) — airdrops (count toward supply)
