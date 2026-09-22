#!/usr/bin/env node
/**
 * cc0.company 1/1 artworks — collect the $1 Patron Edition, bid, open or settle, from the page link.
 * Also: bid / buy now / settle a Transient Labs listing, and mint a BasePaint day.
 *
 *   npm i viem
 *   PRIVATE_KEY=0x…                node collect-or-bid.mjs "https://cc0.company/us/art/base/0x…/1" collect
 *   BANKR_API_KEY=… BANKR_WALLET=0x… node collect-or-bid.mjs "<page link>" bid
 *   node collect-or-bid.mjs "<page link>" buy                 # Transient buy-now listing
 *   node collect-or-bid.mjs "<page link>" mint --count 2      # BasePaint, the day on sale
 *   node collect-or-bid.mjs "<page link>"            # dry run: state + the call it would send, nothing sent
 *
 * Actions: collect | bid | settle | auto (auto = collect when live, open when only listed, settle when ended)
 *          — cc0 / networked houses; bid | buy | settle | auto — Transient Labs; mint [--count N] — BasePaint.
 * Signer: PRIVATE_KEY (viem, any chain) or BANKR_API_KEY + BANKR_WALLET (Bankr /wallet/submit, raw calldata).
 * Optional: RPC_URL (your own node — public RPCs throttle), REFERRER (defaults to cc0's treasury).
 */
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, arbitrum, bsc, shape } from "viem/chains";

const API = "https://cc0.company/api/store/art/tokens";
const REFERRER = process.env.REFERRER || "0x2a3353d225f47a77001BF7f08840bbFcF1d1dfc8";

const CHAINS = {
  base: { id: 8453, coin: "ETH", rpc: "https://mainnet.base.org", chain: base },
  ethereum: { id: 1, coin: "ETH", rpc: "https://ethereum-rpc.publicnode.com", chain: mainnet },
  arbitrum: { id: 42161, coin: "ETH", rpc: "https://arb1.arbitrum.io/rpc", chain: arbitrum },
  bnb: { id: 56, coin: "BNB", rpc: "https://bsc-dataseed.bnbchain.org", chain: bsc },
  arc: { id: 5042, coin: "USDC", rpc: "https://rpc.mainnet.arc.io", chain: defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } } }) },
  robinhood: { id: 4663, coin: "ETH", rpc: "https://rpc.mainnet.chain.robinhood.com", chain: defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } }) },
  shape: { id: 360, coin: "ETH", rpc: "https://mainnet.shape.network", chain: shape }, // Transient Labs auctions only — no cc0 house there
};

const HOUSE_ABI = parseAbi([
  "function collectPatronEdition(uint256 auctionId, address recipient) payable",
  "function bid(uint256 auctionId, address referrer) payable",
  "function openAuction(uint256 id, uint96 expectedReserveUsd, address referrer) payable returns (uint256 auctionId)",
  "function settle(uint256 auctionId)",
]);
const GAS = { collect: 190_000n, bid: 140_000n, open: 220_000n, settle: 160_000n };
const cushion = (wei) => (BigInt(wei) * 1005n) / 1000n;

// Transient Labs — TLAuctionHouse 0x6f66…9f8d on ethereum · base · arbitrum · robinhood · shape. ETH listings only:
// the house wants msg.value == amount EXACTLY (UnexpectedMsgValue otherwise) — no cushion, ever.
const TRANSIENT_ABI = parseAbi([
  "function bid(address nftAddress, uint256 tokenId, address recipient, uint256 amount) payable",
  "function buyNow(address nftAddress, uint256 tokenId, address recipient) payable",
  "function settleAuction(address nftAddress, uint256 tokenId)",
]);
const TRANSIENT_GAS = { bid: 220_000n, buy: 260_000n, settle: 260_000n };

// BasePaint — one canvas a day, minted through BasePaintRewards so the referrer (cc0's treasury) earns 5 % of the mint value.
// Fixed ETH price × count, sent exactly (the contract keeps any excess).
const BASEPAINT_REWARDS = "0xaff1A9E200000061fC3283455d8B0C7e3e728161";
const BASEPAINT_ABI = parseAbi(["function mintLatest(address sendMintsTo, uint256 count, address sendRewardsTo) payable"]);
const BASEPAINT_GAS = 200_000n;

// ── 1. the link ──
const argv = process.argv.slice(2);
const countIdx = argv.indexOf("--count");
const count = countIdx >= 0 ? Number(argv[countIdx + 1]) : 1;
if (countIdx >= 0) argv.splice(countIdx, 2);
const [link, actionArg = "dry"] = argv;
const m = String(link || "").match(/art\/(base|ethereum|arbitrum|bnb|arc|robinhood|shape)\/(0x[0-9a-fA-F]{40})\/(\d+)/);
if (!m) {
  console.error("usage: node collect-or-bid.mjs <https://cc0.company/us/art/<chain>/<contract>/<tokenId>> [collect|bid|buy|settle|mint|auto] [--count N]");
  process.exit(2);
}
const [, slug, contract, tokenId] = m;
const net = CHAINS[slug];
const url = `${API}/${slug}/${contract.toLowerCase()}/${tokenId}`;

// ── 2. the auction, read from the chain right now ──
const token = (await (await fetch(url)).json()).token;
if (!token) {
  console.error("Artwork not found on cc0.company:", url);
  process.exit(1);
}
const fresh = await fetch(`${url}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.json()).catch(() => null);
const a = fresh?.auction || token.auction;
console.log(`${token.name || `#${tokenId}`} — ${slug} · ${contract} · #${tokenId}`);

const me = process.env.BANKR_WALLET || (process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY).address : "0x0000000000000000000000000000000000000000");
let action = actionArg;
let call = null;

if (token.protocol === "basepaint") {
  // ── BasePaint: mint the day on sale (yesterday's canvas), price × count, exact ──
  const e = fresh?.edition || token.edition;
  if (!e) fail("No edition block on this BasePaint day — re-read the token.");
  console.log(`basepaint: day ${e.day} · ${e.status}${e.theme ? ` · « ${e.theme} »` : ""} · ${e.artists} artists · ${e.mints} mints${e.price_wei ? ` · ${formatEther(BigInt(e.price_wei))} ${net.coin} each` : ""}`);
  console.log(`${e.status === "painting" ? `on sale from ${e.painting_ends_at}` : e.status === "minting" ? `sale ends ${e.minting_ends_at}` : "sale ended"} · rewards ${e.rewards_contract} · referrer ${e.referrer}`);
  if (action === "auto") action = e.status === "minting" ? "mint" : "none";
  if (action === "mint") {
    if (e.status !== "minting") fail(e.status === "painting" ? `Day ${e.day} is still being painted — it goes on sale at ${e.painting_ends_at}.` : `The sale of day ${e.day} is over — trade it on OpenSea.`);
    if (!Number.isInteger(count) || count < 1) fail("--count must be a whole number ≥ 1");
    if (!e.price_wei) fail("No price on the edition block — refresh and retry.");
    call = { to: BASEPAINT_REWARDS, abi: BASEPAINT_ABI, fn: "mintLatest", args: [me, BigInt(count), e.referrer || REFERRER], value: BigInt(e.price_wei) * BigInt(count), gas: BASEPAINT_GAS + 60_000n * BigInt(count - 1), label: `mint ${count} × day ${e.day} → ${me}` };
  } else if (action !== "dry" && action !== "none") fail(`Unknown action ${action} for a BasePaint day (use mint [--count N])`);
  if (!call) {
    console.log("Dry run — pass mint [--count N] to send.");
    process.exit(0);
  }
} else if (a?.house === "transient" || (!a && token.protocol === "transient")) {
  // ── Transient Labs: bid (exact wei), buy now, settle — on TLAuctionHouse, args = the NFT + tokenId ──
  if (!a) {
    console.log("No listing on this piece right now (delisted, sold, or never listed on Transient). Nothing to send.");
    process.exit(0);
  }
  console.log(`transient: ${a.kind || "listing"} · ${a.status}${a.ends_at ? ` · ends ${a.ends_at}` : ""}${a.opens_at ? ` · opens ${a.opens_at}` : ""}${a.high_wei ? ` · high ${formatEther(BigInt(a.high_wei))} ${net.coin} ($${a.high_usd}) by ${a.high_bidder}` : ""}`);
  if (a.currency && a.currency !== "eth") fail(`This listing is priced in an ERC-20 (${a.currency}) — out of scope for this script, bid on transient.xyz.`);
  console.log(`house: ${a.contract} · currency eth${a.reserve_wei ? ` · reserve ${formatEther(BigInt(a.reserve_wei))} ${net.coin}` : ""}${a.next_min_wei ? ` · next bid ${formatEther(BigInt(a.next_min_wei))} ${net.coin} ($${a.next_min_usd})` : ""}${a.buy_now_wei ? ` · buy now ${formatEther(BigInt(a.buy_now_wei))} ${net.coin} ($${a.buy_now_usd})` : ""}`);
  const canBid = a.kind !== "buy_now" && (a.status === "listed" || a.status === "live");
  const canBuy = Boolean(a.buy_now_wei) && a.status === "listed" && !a.high_bidder && a.kind !== "reserve_auction" && a.kind !== "scheduled_auction";
  if (action === "auto") action = a.status === "ended" ? "settle" : canBuy && !canBid ? "buy" : canBid ? "bid" : "none";
  if (action === "bid") {
    if (!canBid) fail(a.status === "ended" ? "The auction is over — settle it instead." : a.status === "settled" || a.status === "cancelled" ? "Nothing to bid on." : "This listing is buy-now only — use `buy`.");
    if (a.opens_at && Date.parse(a.opens_at) > Date.now()) fail(`Bidding opens at ${a.opens_at}.`);
    if (!a.next_min_wei) fail("No minimum bid on the listing — refresh and retry.");
    call = { to: a.contract, abi: TRANSIENT_ABI, fn: "bid", args: [contract, BigInt(tokenId), me, BigInt(a.next_min_wei)], value: BigInt(a.next_min_wei), gas: TRANSIENT_GAS.bid, label: `bid ${formatEther(BigInt(a.next_min_wei))} ${net.coin} ($${a.next_min_usd}) exactly → piece to ${me}` };
  } else if (action === "buy") {
    if (!canBuy) fail(a.high_bidder ? "A bid already landed — buy-now is closed, bid instead." : !a.buy_now_wei ? "This listing has no buy-now price." : "Nothing to buy.");
    if (a.opens_at && Date.parse(a.opens_at) > Date.now()) fail(`The sale opens at ${a.opens_at}.`);
    call = { to: a.contract, abi: TRANSIENT_ABI, fn: "buyNow", args: [contract, BigInt(tokenId), me], value: BigInt(a.buy_now_wei), gas: TRANSIENT_GAS.buy, label: `buy now ${formatEther(BigInt(a.buy_now_wei))} ${net.coin} ($${a.buy_now_usd}) → ${me}` };
  } else if (action === "settle") {
    if (a.status !== "ended") fail(a.status === "settled" ? "Already settled." : a.status === "live" ? "The clock has not run out yet." : "No auction to settle (no bid landed).");
    call = { to: a.contract, abi: TRANSIENT_ABI, fn: "settleAuction", args: [contract, BigInt(tokenId)], value: 0n, gas: TRANSIENT_GAS.settle, label: "settle the auction" };
  } else if (action !== "dry" && action !== "none") fail(`Unknown action ${action} for a Transient listing (use bid | buy | settle | auto)`);
  if (!call) {
    console.log("Dry run — pass bid | buy | settle | auto to send.");
    process.exit(0);
  }
} else {
  // ── cc0 / networked.art houses (unchanged) ──
  if (!a) {
    console.log("No auction on this piece (not listed, or a Foundation-era work). Nothing to send.");
    process.exit(0);
  }
  console.log(`auction: ${a.status || (a.listed ? "listed (waiting for its first bid)" : "—")}${a.ends_at ? ` · ends ${a.ends_at}` : ""}${a.high_usd ? ` · high $${a.high_usd} by ${a.high_bidder}` : ""}`);
  console.log(`house: ${a.contract}${a.patron_price_wei ? ` · patron edition ${formatEther(BigInt(a.patron_price_wei))} ${net.coin}` : ""}${a.next_min_wei ? ` · next bid ${formatEther(BigInt(a.next_min_wei))} ${net.coin} ($${a.next_min_usd})` : ""}`);

  // ── 3. the call ──
  if (action === "auto") action = a.status === "live" ? "collect" : a.status === "ended" ? "settle" : a.listed ? "bid" : "none";
  if (action === "collect") {
    if (a.status !== "live" || !a.patron_price_wei) fail("The Patron Edition is only sold while the auction is live — open it with the first bid (`bid`) first.");
    call = { fn: "collectPatronEdition", args: [BigInt(a.id), me], value: cushion(a.patron_price_wei), gas: GAS.collect, label: `collect the $1 Patron Edition → ${me}` };
  } else if (action === "bid") {
    if (a.status === "live") call = { fn: "bid", args: [BigInt(a.id), REFERRER], value: cushion(a.next_min_wei), gas: GAS.bid, label: `bid $${a.next_min_usd}` };
    else if (a.listed) call = { fn: "openAuction", args: [BigInt(a.lot_id), BigInt(Math.round(a.reserve_usd)), REFERRER], value: cushion(a.next_min_wei), gas: GAS.open, label: `open the auction with the reserve bid $${a.reserve_usd}` };
    else fail("Nothing to bid on: the auction is over.");
  } else if (action === "settle") {
    if (a.status !== "ended") fail(a.status === "settled" ? "Already settled." : "The clock has not run out yet.");
    call = { fn: "settle", args: [BigInt(a.id)], value: 0n, gas: GAS.settle, label: "settle the auction" };
  } else if (action !== "dry" && action !== "none") fail(`Unknown action ${action}`);

  if (!call) {
    console.log("Dry run — pass collect | bid | settle | auto to send.");
    process.exit(0);
  }
  call.to = a.contract;
  call.abi = HOUSE_ABI;
}

const data = encodeFunctionData({ abi: call.abi, functionName: call.fn, args: call.args });
console.log(`→ ${call.label}: ${call.fn} on ${call.to}, value ${formatEther(call.value)} ${net.coin}, gas ${call.gas}`);
if (action === "dry") process.exit(0);

// ── 4. send — raw calldata from YOUR wallet ──
let hash;
if (process.env.BANKR_API_KEY) {
  if (!process.env.BANKR_WALLET) fail("BANKR_WALLET (your Bankr wallet address) is required with BANKR_API_KEY");
  const res = await fetch("https://api.bankr.bot/wallet/submit", {
    method: "POST",
    headers: { "X-API-Key": process.env.BANKR_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: { to: call.to, data, value: call.value.toString(), gas: call.gas.toString(), type: 2, chainId: net.id }, waitForConfirmation: true }),
  });
  const j = await res.json();
  if (!res.ok || !j.transactionHash) fail(`Bankr refused the transaction (${res.status}): ${JSON.stringify(j).slice(0, 300)}`);
  hash = j.transactionHash;
} else if (process.env.PRIVATE_KEY) {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const transport = http(process.env.RPC_URL || net.rpc);
  const pub = createPublicClient({ chain: net.chain, transport });
  const wallet = createWalletClient({ account, chain: net.chain, transport });
  const balance = await pub.getBalance({ address: account.address });
  if (balance < call.value) fail(`Not enough ${net.coin} on ${slug}: you have ${formatEther(balance)}, this needs ${formatEther(call.value)} plus gas.`);
  hash = await wallet.writeContract({ address: call.to, abi: call.abi, functionName: call.fn, args: call.args, value: call.value, gas: call.gas });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`Reverted: ${hash}`);
} else fail("Set PRIVATE_KEY, or BANKR_API_KEY + BANKR_WALLET.");

// ── 5. confirm: the index learns the tx now, the page and the feed follow within seconds ──
console.log(`sent: ${hash}`);
const after = await fetch(`${url}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx_hash: hash }) }).then((r) => r.json()).catch(() => null);
if (after?.auction) console.log(`now: ${after.auction.status}${after.auction.high_bidder ? ` · high $${after.auction.high_usd} by ${after.auction.high_bidder}` : ""}`);
if (after?.edition) console.log(`now: day ${after.edition.day} · ${after.edition.mints} mints`);
console.log(`page: https://cc0.company/us/art/${slug}/${contract.toLowerCase()}/${tokenId}`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
