#!/usr/bin/env node
/**
 * cc0.company 1/1 artworks — collect the $1 Patron Edition, bid, open or settle, from the page link.
 *
 *   npm i viem
 *   PRIVATE_KEY=0x…                node collect-or-bid.mjs "https://cc0.company/us/art/base/0x…/1" collect
 *   BANKR_API_KEY=… BANKR_WALLET=0x… node collect-or-bid.mjs "<page link>" bid
 *   node collect-or-bid.mjs "<page link>"            # dry run: state + the call it would send, nothing sent
 *
 * Actions: collect | bid | settle | auto (auto = collect when live, open when only listed, settle when ended).
 * Signer: PRIVATE_KEY (viem, any chain) or BANKR_API_KEY + BANKR_WALLET (Bankr /wallet/submit, raw calldata).
 * Optional: RPC_URL (your own node — public RPCs throttle), REFERRER (defaults to cc0's treasury).
 */
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseAbi, formatEther, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet, arbitrum, bsc } from "viem/chains";

const API = "https://cc0.company/api/store/art/tokens";
const REFERRER = process.env.REFERRER || "0x2a3353d225f47a77001BF7f08840bbFcF1d1dfc8";

const CHAINS = {
  base: { id: 8453, coin: "ETH", rpc: "https://mainnet.base.org", chain: base },
  ethereum: { id: 1, coin: "ETH", rpc: "https://ethereum-rpc.publicnode.com", chain: mainnet },
  arbitrum: { id: 42161, coin: "ETH", rpc: "https://arb1.arbitrum.io/rpc", chain: arbitrum },
  bnb: { id: 56, coin: "BNB", rpc: "https://bsc-dataseed.bnbchain.org", chain: bsc },
  arc: { id: 5042, coin: "USDC", rpc: "https://rpc.mainnet.arc.io", chain: defineChain({ id: 5042, name: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } } }) },
  robinhood: { id: 4663, coin: "ETH", rpc: "https://rpc.mainnet.chain.robinhood.com", chain: defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } } }) },
};

const HOUSE_ABI = parseAbi([
  "function collectPatronEdition(uint256 auctionId, address recipient) payable",
  "function bid(uint256 auctionId, address referrer) payable",
  "function openAuction(uint256 id, uint96 expectedReserveUsd, address referrer) payable returns (uint256 auctionId)",
  "function settle(uint256 auctionId)",
]);
const GAS = { collect: 190_000n, bid: 140_000n, open: 220_000n, settle: 160_000n };
const cushion = (wei) => (BigInt(wei) * 1005n) / 1000n;

// ── 1. the link ──
const [link, actionArg = "dry"] = process.argv.slice(2);
const m = String(link || "").match(/art\/(base|ethereum|arbitrum|bnb|arc|robinhood)\/(0x[0-9a-fA-F]{40})\/(\d+)/);
if (!m) {
  console.error("usage: node collect-or-bid.mjs <https://cc0.company/us/art/<chain>/<contract>/<tokenId>> [collect|bid|settle|auto]");
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
if (!a) {
  console.log("No auction on this piece (not listed, or a Foundation-era work). Nothing to send.");
  process.exit(0);
}
console.log(`auction: ${a.status || (a.listed ? "listed (waiting for its first bid)" : "—")}${a.ends_at ? ` · ends ${a.ends_at}` : ""}${a.high_usd ? ` · high $${a.high_usd} by ${a.high_bidder}` : ""}`);
console.log(`house: ${a.contract}${a.patron_price_wei ? ` · patron edition ${formatEther(BigInt(a.patron_price_wei))} ${net.coin}` : ""}${a.next_min_wei ? ` · next bid ${formatEther(BigInt(a.next_min_wei))} ${net.coin} ($${a.next_min_usd})` : ""}`);

// ── 3. the call ──
const me = process.env.BANKR_WALLET || (process.env.PRIVATE_KEY ? privateKeyToAccount(process.env.PRIVATE_KEY).address : "0x0000000000000000000000000000000000000000");
let action = actionArg;
if (action === "auto") action = a.status === "live" ? "collect" : a.status === "ended" ? "settle" : a.listed ? "bid" : "none";
let call = null;
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
const data = encodeFunctionData({ abi: HOUSE_ABI, functionName: call.fn, args: call.args });
console.log(`→ ${call.label}: ${call.fn} on ${a.contract}, value ${formatEther(call.value)} ${net.coin}, gas ${call.gas}`);
if (action === "dry") process.exit(0);

// ── 4. send — raw calldata from YOUR wallet ──
let hash;
if (process.env.BANKR_API_KEY) {
  if (!process.env.BANKR_WALLET) fail("BANKR_WALLET (your Bankr wallet address) is required with BANKR_API_KEY");
  const res = await fetch("https://api.bankr.bot/wallet/submit", {
    method: "POST",
    headers: { "X-API-Key": process.env.BANKR_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: { to: a.contract, data, value: call.value.toString(), gas: call.gas.toString(), type: 2, chainId: net.id }, waitForConfirmation: true }),
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
  hash = await wallet.writeContract({ address: a.contract, abi: HOUSE_ABI, functionName: call.fn, args: call.args, value: call.value, gas: call.gas });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") fail(`Reverted: ${hash}`);
} else fail("Set PRIVATE_KEY, or BANKR_API_KEY + BANKR_WALLET.");

// ── 5. confirm: the index learns the tx now, the page and the feed follow within seconds ──
console.log(`sent: ${hash}`);
const after = await fetch(`${url}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx_hash: hash }) }).then((r) => r.json()).catch(() => null);
if (after?.auction) console.log(`now: ${after.auction.status}${after.auction.high_bidder ? ` · high $${after.auction.high_usd} by ${after.auction.high_bidder}` : ""}`);
console.log(`page: https://cc0.company/us/art/${slug}/${contract.toLowerCase()}/${tokenId}`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
