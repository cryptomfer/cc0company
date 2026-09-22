---
name: cc0company-artworks
version: 1.1.0
description: Collect a $1 Patron Edition, place a bid, open or settle a 1/1 artwork auction on cc0.company from a wallet you control — Bankr, CDP, viem or a private key — given only the artwork's page link (https://cc0.company/art/<chain>/<contract>/<tokenId>). Covers the six launch chains (Base, Ethereum, Arbitrum One, BNB Chain, Arc, Robinhood Chain) plus Shape, four houses (cc0's own, networked.art's on Ethereum, Transient Labs' TLAuctionHouse — bid with the exact wei, buy now, settle — and BasePaint's daily open edition minted through BasePaintRewards with cc0 as referrer), the API that quotes the exact amount in wei, the raw calls, and how to confirm.
homepage: https://cc0.company
api_base: https://cc0.company/api
page_pattern: https://cc0.company/{us/}art/<chain>/<contract>/<tokenId>
houses: cc0 Auctions (per chain, see /api/store/artifacts/config) · NetworkedAuctions 0xaB48082d28049873ce54F672541D29779a3392Ef (Ethereum) · TLAuctionHouse 0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d (Ethereum, Base, Arbitrum, Robinhood, Shape) · BasePaintRewards 0xaff1A9E200000061fC3283455d8B0C7e3e728161 (Base)
referrer: 0x2a3353d225f47a77001BF7f08840bbFcF1d1dfc8
---

# cc0.company 1/1 Artworks — collect a Patron Edition or bid, from a page link

Every 1/1 on cc0.company sits in a **24-hour USD auction** and, while it runs,
sells a **$1 soulbound Patron Edition** (an ERC-1155, one per wallet — a
receipt that you backed the piece). Both are plain contract calls you send
from **your own wallet**, in the chain's gas coin; nothing goes through cc0's
servers except the read that tells you the exact price.

Given a link like `https://cc0.company/us/art/base/0xe8e0…1d1d/1`, an agent
can, in one pass: read the auction, pick the right call, send it, confirm.
That is what this skill (and [`examples/collect-or-bid.mjs`](./examples/collect-or-bid.mjs))
does.

Two more houses ride the same page link and the same read (§ 6 and § 7):
**Transient Labs** pieces (`token.auction.house === "transient"` — bid with
the exact wei, buy now, settle on `TLAuctionHouse`) and **BasePaint** days
(`token.protocol === "basepaint"` — mint yesterday's canvas while it is on
sale). Sections 2–5 describe cc0's and networked.art's houses; the other two
say only what differs.

> **Money rule.** You spend real funds. Read the price from the API **right
> before** sending (it moves with the ETH/USD oracle and with other bids),
> send the exact wei plus a 0.5 % cushion, never more — **except on
> Transient and BasePaint, where the amount is exact** (§ 6, § 7). Every
> call below reverts cleanly when the state changed under you (outbid,
> auction over, edition already held) — nothing is lost on a revert but gas.

## 1. Parse the link

```
https://cc0.company/us/art/<chain>/<contract>/<tokenId>
https://cc0.company/art/<chain>/<contract>/<tokenId>      (same page — the /us is added by the site)
```

| `chain` slug | chainId | gas coin you pay in | public RPC |
|---|---|---|---|
| `base` | 8453 | ETH | `https://mainnet.base.org` |
| `ethereum` | 1 | ETH | `https://ethereum-rpc.publicnode.com` |
| `arbitrum` | 42161 | ETH | `https://arb1.arbitrum.io/rpc` |
| `bnb` | 56 | BNB | `https://bsc-dataseed.bnbchain.org` |
| `arc` | 5042 | **USDC** (Arc's native coin, 18 decimals) | `https://rpc.mainnet.arc.io` |
| `robinhood` | 4663 | ETH | `https://rpc.mainnet.chain.robinhood.com` |
| `shape` | 360 | ETH | `https://mainnet.shape.network` (Transient Labs pieces only — no cc0 house there) |

`contract` is the artwork's ERC-721 (the artist's collection), `tokenId` the
piece. Regex: `/art\/(base|ethereum|arbitrum|bnb|arc|robinhood|shape)\/(0x[0-9a-fA-F]{40})\/(\d+)/`.

## 2. Read the auction (one GET, no auth)

```bash
curl https://cc0.company/api/store/art/tokens/base/0xe8e0a9f6e5ce5433912fa9d1cc8e4408111b1d1d/1
```

`token.auction` is everything you need (`null` when the piece has no auction
— e.g. a Foundation-era piece or one that is not listed):

```json
{
  "id": "1",                       // auctionId — the argument of bid / collect / settle
  "status": "live",                // "live" | "ended" | "settled"; absent while only listed
  "listed": false,                 // true = a lot waiting for its FIRST bid (openAuction)
  "lot_id": "1",                   // the lot id for openAuction
  "ends_at": "2026-09-22T01:08:13.000Z",
  "high_usd": 25, "high_bidder": "0xa4f9…f663",
  "reserve_usd": 25,               // whole dollars — openAuction's expectedReserveUsd
  "next_min_usd": 26,
  "next_min_wei": "9639799260820193",     // what a bid must send NOW (gas-coin wei)
  "patron_price_wei": "370761510031546",  // what the $1 Patron Edition costs NOW
  "patron_edition": "0x6a21…75eb",        // the soulbound ERC-1155 you receive
  "contract": "0x487a3aabe4f852b18b1b46c6b3cd273757ba8f97"   // THE HOUSE to call
}
```

**Always call `auction.contract`** — it is cc0's house on that chain, or
networked.art's `0xaB48082d28049873ce54F672541D29779a3392Ef` for pieces that
live there (Ethereum). Both speak the same ABI. The suites per chain are also
published at `GET /api/store/artifacts/config` (`suites.<chainId>.auctions`).

For the **freshest wei** (a bid may have landed a second ago), refresh right
before sending — public, once per 5 s per piece:

```bash
curl -X POST https://cc0.company/api/store/art/tokens/base/0xe8e0…1d1d/1/refresh -H 'content-type: application/json' -d '{}'
# → { "success": true, "auction": { …same block, read from the chain now… } }
```

## 3. Pick the call from the state

First read **which house the piece is in** — the branch decides everything:

| The token says | House | Go to |
|---|---|---|
| `protocol: "basepaint"` (with an `edition` block) | BasePaint, on Base | § 7 — `mintLatest`, exact price × count |
| `auction.house: "transient"` (or `protocol: "transient"`) | Transient Labs' `TLAuctionHouse` | § 6 — `bid` (exact), `buyNow`, `settleAuction` |
| anything else with an `auction` | cc0's house, or networked.art's on Ethereum | the table below |
| no `auction`, no `edition` | — | nothing to send on-chain |

| `auction` says | Call | `value` (wei) | Notes |
|---|---|---|---|
| `status: "live"` and you want the $1 edition | `collectPatronEdition(uint256 auctionId, address recipient)` | `patron_price_wei` × 1.005 | One per wallet — reverts if `recipient` already holds one. Soulbound (no transfer). 95 % to the artist, 5 % house fee. No refund of a surplus (it is the artist's). |
| `status: "live"` and you want the piece | `bid(uint256 auctionId, address referrer)` | ≥ `next_min_wei` (send × 1.005) | +1 % ≥ $1 over the last bid, oracle-priced. A bid in the last 15 min extends the clock 15 min. **Bids are final**; when someone outbids you the house sends your coin straight back (a contract wallet that refuses it is credited: `balances(you)` → `withdraw()`). **A bidder receives the Patron Edition for free with the bid** — do not `collectPatronEdition` after bidding, it reverts (one per wallet). |
| `listed: true`, no `status` | `openAuction(uint256 lotId, uint96 expectedReserveUsd, address referrer)` | ≥ `next_min_wei` (send × 1.005) | The FIRST bid: `lotId` = `lot_id`, `expectedReserveUsd` = `reserve_usd` (whole dollars — the call reverts `ReserveMismatch` if the artist changed it). Opens the 24 h auction; the Patron Edition becomes collectable right after. |
| `status: "ended"` | `settle(uint256 auctionId)` | 0 | Anyone, once the clock ran out: the winner receives the piece, the artist the proceeds. |
| `status: "settled"` / no auction | — | — | Nothing to buy on-chain. |

`referrer` — pass cc0's treasury `0x2a3353d225f47a77001BF7f08840bbFcF1d1dfc8`
(or the zero address); it never changes what you pay.

Gas limits that always suffice: collect 190 000 · bid 140 000 · openAuction
220 000 · settle 160 000.

ABI (human-readable, viem `parseAbi`):

```ts
const HOUSE_ABI = parseAbi([
  "function collectPatronEdition(uint256 auctionId, address recipient) payable",
  "function bid(uint256 auctionId, address referrer) payable",
  "function openAuction(uint256 id, uint96 expectedReserveUsd, address referrer) payable returns (uint256 auctionId)",
  "function settle(uint256 auctionId)",
  "function currentMinBidWei(uint256 auctionId) view returns (uint256)",
  "function balances(address) view returns (uint256)",
  "function withdraw()",
]);
```

## 4. Send it — raw calldata from YOUR wallet

The hard rule of every cc0 skill: **you sign and broadcast the raw
transaction** (`{ to, data, value, gas, chainId }`). No wallet-SDK convenience
helper, no natural-language "buy this NFT" prompt — those guess the call and
fail.

### viem / private key / CDP

```ts
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org") });

const a = (await (await fetch("https://cc0.company/api/store/art/tokens/base/0xe8e0…1d1d/1/refresh", { method: "POST" })).json()).auction;
const value = (BigInt(a.patron_price_wei) * 1005n) / 1000n;

const hash = await wallet.writeContract({
  address: a.contract,                       // the house
  abi: HOUSE_ABI,
  functionName: "collectPatronEdition",
  args: [BigInt(a.id), account.address],     // recipient = you
  value,
  gas: 190_000n,
});
```

For a bid: `functionName: "bid", args: [BigInt(a.id), REFERRER], value: BigInt(a.next_min_wei) * 1005n / 1000n`.
For the first bid on a listed lot: `functionName: "openAuction", args: [BigInt(a.lot_id), BigInt(a.reserve_usd), REFERRER]`, same value.

### Bankr (HTTP-only wallet — `/wallet/submit`, never a prompt)

Encode the same call with viem and hand Bankr the raw transaction. Bankr wants
**decimal strings** for `value` and `gas`:

```ts
import { encodeFunctionData } from "viem";

const data = encodeFunctionData({ abi: HOUSE_ABI, functionName: "collectPatronEdition", args: [BigInt(a.id), BANKR_WALLET] });
const res = await fetch("https://api.bankr.bot/wallet/submit", {
  method: "POST",
  headers: { "X-API-Key": process.env.BANKR_API_KEY!, "Content-Type": "application/json" },
  body: JSON.stringify({
    transaction: {
      to: a.contract, data,
      value: ((BigInt(a.patron_price_wei) * 1005n) / 1000n).toString(),   // DECIMAL wei
      gas: "190000", type: 2,
      chainId: 8453,                       // from the link's chain slug (table in §1)
    },
    waitForConfirmation: true,
  }),
});
const { transactionHash } = await res.json();
```

A `403` from Bankr = the key / wallet blocks raw calldata ("Disable arbitrary
contract calls" must be OFF, `walletApiEnabled` on) — see the Bankr gotchas in
[`../agentic-marketplace/x402-payments/SKILL.md`](../agentic-marketplace/x402-payments/SKILL.md).
Bankr wallets live on Base by default; a piece on another chain needs a Bankr
wallet funded there (the same address, the chain's gas coin).

### One script for all of it

[`examples/collect-or-bid.mjs`](./examples/collect-or-bid.mjs) takes the page
link and an action, reads the auction, picks the call, sends it (private key
or Bankr), refreshes the index with your tx hash and prints the result:

```bash
npm i viem
PRIVATE_KEY=0x… node examples/collect-or-bid.mjs "https://cc0.company/us/art/base/0xe8e0…1d1d/1" collect
BANKR_API_KEY=… BANKR_WALLET=0x… node examples/collect-or-bid.mjs "<page link>" bid
node examples/collect-or-bid.mjs "<page link>" settle      # anyone, after the clock
PRIVATE_KEY=0x… node examples/collect-or-bid.mjs "<transient piece>" buy        # buy-now listing
PRIVATE_KEY=0x… node examples/collect-or-bid.mjs "<basepaint day>" mint --count 2
node examples/collect-or-bid.mjs "<page link>"             # dry run: prints the state and the call it would make
```

It branches on the house by itself: `collect | bid | settle | auto` on cc0's
and networked.art's, `bid | buy | settle | auto` on Transient (exact wei),
`mint [--count N]` on a BasePaint day. The dry run prints the exact call for
every house.

## 5. Confirm

1. Wait for the receipt (`status: "success"`).
2. Tell the index about it so the page and the feed update within seconds
   instead of the next indexer pass:
   `POST …/tokens/<chain>/<contract>/<tokenId>/refresh` with `{ "tx_hash": "0x…" }`.
3. A Patron Edition: `ERC1155(patron_edition).balanceOf(you, tokenId) == 1`
   (the edition's id is the artwork's `tokenId`). A bid: `auction.high_bidder`
   is you. A settle: `auction.status == "settled"`.

## 6. Transient Labs pieces — bid, buy now, settle

Artists who publish with [Transient Labs](https://www.transient.xyz) have
their 1/1s indexed on cc0 too, and the auction runs on **their** house:
`TLAuctionHouse` **`0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d`** — the same
address on **ethereum · base · arbitrum · robinhood · shape** (chain 360,
RPC `https://mainnet.shape.network`). The piece is escrowed by the house
while it is listed. The page link is the usual one, and
`token.auction.house === "transient"` is how you know.

The same read (§ 2) fills the block, with a few extra fields:

```json
{
  "house": "transient",
  "kind": "reserve_auction_plus_buy_now",   // or reserve_auction | scheduled_auction | buy_now | private_sale
  "status": "listed",                        // listed (no bid) | live | ended | settled | cancelled
  "currency": "eth",                         // an ERC-20 address = out of scope, see below
  "reserve_wei": "100000000000000000",
  "next_min_wei": "105000000000000000",      // live getNextBid — SEND EXACTLY THIS
  "buy_now_wei": "500000000000000000",
  "high_wei": "100000000000000000", "high_bidder": "0x2222…",
  "opens_at": null, "ends_at": "2026-09-23T10:00:00.000Z",
  "seller": "0x1111…",
  "contract": "0x6f66b95a0c512f3497fb46660e0bc3b94b989f8d"
}
```

| `auction` says | Call | `value` (wei) | Notes |
|---|---|---|---|
| `status: "listed"` or `"live"`, `kind` ≠ `buy_now` | `bid(address nft, uint256 tokenId, address recipient, uint256 amount)` | **`amount` EXACTLY** = `next_min_wei` | `nft` = the contract from the link, `recipient` = who gets the piece if you win (you). **No cushion**: the house reverts `UnexpectedMsgValue` unless `msg.value == amount`. The first bid ≥ the reserve starts the clock; later bids are +5 % (`BID_INCREASE_BPS = 500`). A bid in the last 5 minutes extends the auction by 5 minutes (`EXTENSION_TIME`). The previous bidder is refunded by the house in the same transaction. |
| `status: "listed"` with a `buy_now_wei` and no bid yet | `buyNow(address nft, uint256 tokenId, address recipient)` | **`buy_now_wei` EXACTLY** | Refused once any bid has landed (`AuctionStarted`), and before `opens_at` (`CannotBuyYet`). |
| `status: "ended"` | `settleAuction(address nft, uint256 tokenId)` | 0 | Anyone, once the clock ran out: the piece goes to the winner's `recipient`, the proceeds to the seller. |
| `currency` ≠ `"eth"` | — | — | The listing is priced in an ERC-20: it is pulled with `transferFrom`, not paid with `msg.value`. Out of scope here — bid on `transient.xyz`. |

Fees and licence, to state plainly to whoever you act for: the **2.5 %
protocol fee (`protocolFeeBps() = 250`) is taken from the seller** on
settlement — you pay your bid, nothing more — plus the piece's ERC-2981
royalty. Transient pieces are **not CC0**: the licence is the artist's
(`© the artist`). The piece also has a page at
`https://www.transient.xyz/nfts/<chain>/<contract>/<tokenId>`.

```ts
const TRANSIENT_ABI = parseAbi([
  "function bid(address nftAddress, uint256 tokenId, address recipient, uint256 amount) payable",
  "function buyNow(address nftAddress, uint256 tokenId, address recipient) payable",
  "function settleAuction(address nftAddress, uint256 tokenId)",
  "function getListing(address nftAddress, uint256 tokenId) view returns ((uint8,bool,address,address,address,uint256,uint256,uint256,uint256,uint256,address,address,uint256,uint256))",
  "function getNextBid(address nftAddress, uint256 tokenId) view returns (uint256)",
]);
// gas that always suffices: bid 220 000 · buyNow 260 000 · settleAuction 260 000
```

Refresh right before sending (`POST …/refresh`) — it re-reads `getListing` /
`getNextBid` from the chain, and `next_min_wei` is what you must send to the
wei.

## 7. BasePaint days — mint the canvas on sale

[BasePaint](https://basepaint.xyz) paints **one canvas a day** on Base, all
of it **CC0**. A day is painted for 24 h, then sells as an open edition for
the next 24 h, then closes for good. cc0 indexes every day as an ERC-1155
token whose `tokenId` **is the day number**; the token carries an `edition`
block instead of an `auction`:

```json
{
  "day": 1139, "status": "minting",            // painting | minting | closed
  "theme": "Base Chain Bootleg Graphic", "palette": ["#11152E", "…"], "size": 256,
  "artists": 59, "pixels": 97427, "mints": 928, "earned_wei": "…", "earned_usd": 0,
  "price_wei": "2600000000000000",             // 0.0026 ETH each, read live (the owner can change it)
  "painting_ends_at": "…", "minting_ends_at": "2026-09-22T16:41:55.000Z",
  "contract": "0xba5e05cb26b78eda3a2f8e3b3814726305dcac83",
  "rewards_contract": "0xaff1a9e200000061fc3283455d8b0c7e3e728161",
  "referrer": "0x2a3353d225f47a77001BF7f08840bbFcF1d1dfc8",
  "live_image": "https://basepaint.xyz/api/art/image?day=1139&scale=4"
}
```

Only **one** day can be minted at a time: the one that finished painting
yesterday — `day == today() - 1`, which is exactly `status: "minting"`. The
day formula, if you want it without the API:
`day = floor((now_seconds - 1691599315) / 86400) + 1` (day 1 = 2023-08-09
16:41:55 UTC).

| `edition.status` | Call | `value` | Notes |
|---|---|---|---|
| `"minting"` | `mintLatest(address sendMintsTo, uint256 count, address sendRewardsTo)` on **`BasePaintRewards 0xaff1A9E200000061fC3283455d8B0C7e3e728161`** (Base) | **`price_wei × count` EXACTLY** | `sendMintsTo` = you, `count` = how many. No cap, open edition. **No cushion**: the price is a fixed ETH amount and a surplus is *not* refunded. Gas ≈ 200 000 + 60 000 per extra copy. |
| `"painting"` | — | — | The canvas is still being drawn; it goes on sale at `painting_ends_at`. |
| `"closed"` | — | — | The sale is over — the day only trades on the secondary market now. |

`sendRewardsTo` is the **referrer**, and cc0's treasury
`0x2a3353d225f47a77001BF7f08840bbFcF1d1dfc8` is what the `edition` block
hands you. Say it plainly: with that referrer **cc0 is credited 5 % of the
mint value** by BasePaint's rewards contract (it does not change your price —
it comes out of BasePaint's own split). Pass another address, or the zero
address, if you prefer; the mint works either way.

Of the mint value, 10 % is BasePaint's protocol fee and 90 % goes to the day's
painters pro rata — that is what you are paying for. **Painting** a canvas
needs a BasePaint Brush and their server's signature: not offered here, go to
`basepaint.xyz`.

```ts
const BASEPAINT_ABI = parseAbi([
  "function mintLatest(address sendMintsTo, uint256 count, address sendRewardsTo) payable",
]);
// images: live https://basepaint.xyz/api/art/image?day=N&scale=4 · final https://basepaint.net/v3/N.png
//         timelapse https://basepaint.net/animations/N.mp4 — render them with image-rendering: pixelated
// the day's page on BasePaint: https://basepaint.xyz/canvas/N
```

## Reverts you may see

### cc0 / networked.art houses

| Revert | Meaning | Do |
|---|---|---|
| `AuctionNotActive` | the clock ran out (or it settled) | `settle` instead, or nothing |
| `AuctionNotComplete` | `settle` before the clock ran out | wait for `ends_at` |
| `PatronEditionNotLive` | the auction is not open yet | open it with the first bid, then collect |
| `InsufficientPayment` | `value` below the oracle price | refresh and resend with the new wei (+0.5 %) |
| `MinimumBidNotMet` | someone bid in between | refresh `next_min_wei`, resend |
| `ReserveMismatch(expected, actual)` | the artist changed the reserve | resend with `actual` |
| `AuctionDoesNotExist` / `LotNotFound` | wrong id or house | re-read the token — use `auction.contract` and `auction.id` / `lot_id` from the same read |
| `OneOfEachPerWallet` (from the edition) | this wallet already holds the edition (a collect, or a bid — bidders get it free) | one per wallet — done |

### Transient Labs (`TLAuctionHouse`, names from its source)

| Revert | Meaning | Do |
|---|---|---|
| `UnexpectedMsgValue()` | `msg.value != amount` on `bid`, or `!= buyNowPrice` on `buyNow` (or any ETH sent to an ERC-20 listing) | send the **exact** wei — no cushion |
| `BidTooLow()` | below the reserve (first bid) or below `getNextBid` (+5 %) | refresh `next_min_wei`, resend |
| `AuctionEnded()` | the clock ran out while you were sending | `settleAuction` instead |
| `AuctionNotEnded()` | `settleAuction` before the end | wait for `ends_at` |
| `AuctionNotStarted()` | `settleAuction` on a listing nobody bid on | nothing to settle |
| `AuctionStarted()` | `buyNow` after a bid landed (or the seller delisting) | bid instead |
| `CannotBidYet()` / `CannotBuyYet()` | before the listing's `openTime` | wait for `opens_at` |
| `InvalidListingType()` | wrong call for this listing (bid on a pure buy-now, buyNow on a pure auction), or the listing is gone | re-read the token, follow `kind` |
| `InvalidRecipient()` | `recipient` is the zero address (or a sanctioned one) | pass your own address |
| `NotTokenOwner()` / `NotSeller()` / `TokenNotTransferred()` | seller-side calls (`list` / `delist`) | not your flow |

### BasePaint

| Revert | Meaning | Do |
|---|---|---|
| `"Minting is closed"` / a bare revert on `mintLatest` | the day rolled over — you are minting a day that is no longer `today() - 1` | re-read the token; only `status: "minting"` is mintable |
| a revert on the value | `msg.value < openEditionPrice() × count` | re-read `price_wei` (the owner can change it) and send `price_wei × count` |

## What this is NOT

- Not an offer system: a bid is a commitment in the gas coin; Seaport offers
  and OpenSea listings on Ethereum 1/1s are a different flow (the site's
  « Offers » panel).
- Not creation: minting your own 1/1 and opening its lot is the **cc0
  Artifacts** flow in [`cc0.company/skill.md` § 1/1 Artworks](https://cc0.company/skill.md)
  (one signature, cc0's wallet stores the piece onchain).
- Never send more than the quoted wei + 0.5 %: on `collectPatronEdition` the
  whole `value` is the purchase (no refund of a surplus). On **Transient** and
  **BasePaint** send the exact wei — the first reverts on a surplus, the
  second keeps it.
- Not painting: a BasePaint canvas is drawn with a Brush NFT and their
  server's signature, on `basepaint.xyz`. This skill mints the finished day.
