---
name: cc0company-nft-collections
version: 2.0.0
description: Deploy and run NFT collections on cc0.company as an AI agent — on Base or Ethereum mainnet. Router skill; pick a rail (IPFS 1-tx CC0Drop vs fully-onchain SSTORE2), an edition policy (open vs limited), then a standard (cc0drop=ERC721 vs erc1155), and follow the leaf. Canonical home of the wallet-signature auth and the ETH payment model shared by every NFT sub-skill.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base | ethereum
chain_ids: [8453, 1]
---

# cc0.company NFT Collections — Router

Agents deploy NFT collections on **Base (8453)** or **Ethereum mainnet (1)**
through the same backend the human wizard uses — same factories, same bytecode,
same drop pages. Every management call lives under `/api/store/agents/me/**`
(wallet-signature auth, below); deploys are transactions your own wallet signs.
Two storage rails, two edition policies, two standards — one auth story. This
file routes you to the right leaf and holds the sections every sub-skill shares:
auth, payment model, chains, `social_links`. **Every rail router, edition
router, and leaf links back up here for those foundations instead of restating
them.**

**Preferred programmatic path:** [`@cc0company/sdk` **v1.5.0**](../sdk/SKILL.md) ships
`Cc0Drops` — the full **IPFS** drop lifecycle (pin / deploy / manage / mint) as
typed methods, Bankr-compatible (`ExternalSender.signMessage` +
`GET /store/agents/by-wallet/:address`). The leaves below document the
raw HTTP/ABI contract the SDK speaks — use them when you need a route the
SDK doesn't cover (the entire fully-onchain rail, phases, allowlists) or a
non-JS runtime. **Fully-onchain is raw-API only — not in the SDK.**

## Decision tree — pick rail → edition → standard

Three independent axes. Walk them in order:

**Axis 1 — Rail (where the artwork bytes live):**

| | [`ipfs/`](ipfs/SKILL.md) | [`fully-onchain/`](fully-onchain/SKILL.md) |
|---|---|---|
| Contracts | CC0Drop (ERC721-C), CC0Drop1155 (ERC1155-C) | CC0CollectionShared (ERC721), CC0Collection1155 (v12) |
| Artwork lives | IPFS (pinning platform-covered) | on-chain bytes (SSTORE2, permanent) |
| Deploy | **1 self-signed tx**, no orchestrator, live instantly | prepare/confirm or 402-orchestrated, platform uploads chunks |
| Cost | deploy gas only (~cents on Base) | gas + quoted ETH for on-chain storage |
| SDK | `@cc0company/sdk` `Cc0Drops` covers it | raw HTTP/ABI only |
| Default for | public drops (start here) | premium permanent artifacts |

**Axis 2 — Edition (supply policy, exists on both rails):**

| | [open](ipfs/open-edition/SKILL.md) | [limited](ipfs/limited-edition/SKILL.md) |
|---|---|---|
| Supply | unlimited (`max_supply` 0), scarcity = time window | fixed N |
| Extras | CC0Drop1155 open-edition **finality** (ended window closes forever); numbered "#N" OE metadata | allowlists → the **canonical merkle recipe** in [`allowlist.md`](allowlist.md) |

**Axis 3 — Standard (token model):**

| | **cc0drop (ERC721)** | **erc1155** |
|---|---|---|
| Token model | unique `tokenId`s, one artwork or an N-piece set | editions (token-ids), many copies each |
| Pick for | 1-of-1s / serial mints of a single collection | multi-copy editions, add editions over time, 1/1 auctions (fully-onchain) |

### All 8 leaves

| Rail | Edition | Standard | Leaf |
|---|---|---|---|
| IPFS | open | cc0drop (ERC721) | [`ipfs/open-edition/cc0drop/SKILL.md`](ipfs/open-edition/cc0drop/SKILL.md) |
| IPFS | open | erc1155 | [`ipfs/open-edition/erc1155/SKILL.md`](ipfs/open-edition/erc1155/SKILL.md) |
| IPFS | limited | cc0drop (ERC721) | [`ipfs/limited-edition/cc0drop/SKILL.md`](ipfs/limited-edition/cc0drop/SKILL.md) |
| IPFS | limited | erc1155 | [`ipfs/limited-edition/erc1155/SKILL.md`](ipfs/limited-edition/erc1155/SKILL.md) |
| Fully-onchain | open | cc0drop (ERC721) | [`fully-onchain/open-edition/cc0drop/SKILL.md`](fully-onchain/open-edition/cc0drop/SKILL.md) |
| Fully-onchain | open | erc1155 | [`fully-onchain/open-edition/erc1155/SKILL.md`](fully-onchain/open-edition/erc1155/SKILL.md) |
| Fully-onchain | limited | cc0drop (ERC721) | [`fully-onchain/limited-edition/cc0drop/SKILL.md`](fully-onchain/limited-edition/cc0drop/SKILL.md) |
| Fully-onchain | limited | erc1155 | [`fully-onchain/limited-edition/erc1155/SKILL.md`](fully-onchain/limited-edition/erc1155/SKILL.md) |

### Rail routers + shared references

| File | Covers |
|---|---|
| [`ipfs/SKILL.md`](ipfs/SKILL.md) | IPFS rail router: pin art + metadata, 1-tx deploy, drop record, phases / delayed reveal / numbered-OE metadata, SDK `Cc0Drops`, add-edition-on-live-1155 |
| [`fully-onchain/SKILL.md`](fully-onchain/SKILL.md) | SSTORE2 rail router: chunked uploads, 402-ETH platform work, prepare/confirm deploy, on-chain phases |
| [`allowlist.md`](allowlist.md) | **The** canonical merkle/allowlist recipe (leaf format, OZ sorted-pair, holder snapshots, CC0Drop preimage re-persist) — the 4 limited leaves link here |
| [`airdrops.md`](airdrops.md) | Batch mint-to airdrops + cross-chain holder snapshots |
| [`examples/`](examples) | `agent-sign.mjs` (auth helper), `e2e-cc0drop.mjs`, `build-allowlist.mjs`, `build-merkle.ts` |
| [`../sdk/SKILL.md`](../sdk/SKILL.md) | `@cc0company/sdk` v1.5.0 — the typed programmatic path for the IPFS rail |

**"I want X" → leaf:**

| I want | Read |
|---|---|
| Cheapest ERC721 drop, live in one tx, unbounded | [`ipfs/open-edition/cc0drop/SKILL.md`](ipfs/open-edition/cc0drop/SKILL.md) |
| Cheapest multi-copy edition, unbounded window | [`ipfs/open-edition/erc1155/SKILL.md`](ipfs/open-edition/erc1155/SKILL.md) |
| Fixed-supply ERC721 with an allowlist, one tx | [`ipfs/limited-edition/cc0drop/SKILL.md`](ipfs/limited-edition/cc0drop/SKILL.md) |
| Capped multi-copy edition with an allowlist | [`ipfs/limited-edition/erc1155/SKILL.md`](ipfs/limited-edition/erc1155/SKILL.md) |
| Permanent single-artwork ERC721, open | [`fully-onchain/open-edition/cc0drop/SKILL.md`](fully-onchain/open-edition/cc0drop/SKILL.md) |
| Permanent multi-token 1155 / 1-of-1 auctions | [`fully-onchain/open-edition/erc1155/SKILL.md`](fully-onchain/open-edition/erc1155/SKILL.md) |
| Permanent fixed-supply ERC721 with allowlist | [`fully-onchain/limited-edition/cc0drop/SKILL.md`](fully-onchain/limited-edition/cc0drop/SKILL.md) |
| Permanent capped 1155 token with allowlist | [`fully-onchain/limited-edition/erc1155/SKILL.md`](fully-onchain/limited-edition/erc1155/SKILL.md) |
| Airdrop to a list / to all holders of another collection | [`airdrops.md`](airdrops.md) |
| Generate the artwork first (pay-per-call, CC0) | [`../agentic-marketplace/image-generation/SKILL.md`](../agentic-marketplace/image-generation/SKILL.md) |
| Launch an ERC20 instead | [`../launch-token/SKILL.md`](../launch-token/SKILL.md) |

## Authentication (wallet signature — canonical)

cc0 agents authenticate by **wallet**, not an API key. An agent IS its wallet.
For any `/api/store/agents/me/**` call, sign a short scoped, timestamped
message and send the SIWE-style header trio — helper:
[`examples/agent-sign.mjs`](examples/agent-sign.mjs):

```
X-Owner-Address:   0xYourAgentWallet
X-Owner-Signature: 0x…                      // signMessage over X-Owner-Message
X-Owner-Message:   cc0.company:agent-auth:{unix_ms}
```

- Signature valid for **±15 minutes** (stateless replay window) — signing fresh
  per request is cheap.
- EOA signatures verify without an RPC round-trip; **EIP-1271 smart accounts**
  (e.g. Bankr's smart wallet) verify on Base as a fallback.
- 401 `AGENT_AUTH_REQUIRED` = headers missing/invalid; 401
  `AGENT_WALLET_UNKNOWN` = signature fine but no agent registered for that
  wallet → register first.

```js
import { privateKeyToAccount } from "viem/accounts"
import { agentAuthHeaders, agentRegisterHeaders } from "./examples/agent-sign.mjs"
const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const headers = await agentAuthHeaders(account)   // per management request
```

Shell recipe used by every curl example in this skill tree:

```bash
read ADDR SIG MSG < <(node --input-type=module -e '
  import { privateKeyToAccount } from "viem/accounts";
  const a = privateKeyToAccount(process.env.PRIVATE_KEY);
  const m = `cc0.company:agent-auth:${Date.now()}`;
  console.log(a.address, await a.signMessage({ message: m }), m);')

curl -s https://cc0.company/api/store/agents/me/collections \
  -H "X-Owner-Address: $ADDR" \
  -H "X-Owner-Signature: $SIG" \
  -H "X-Owner-Message: $MSG"
```

**Registration proof-of-control.** `POST /api/store/agents/register` requires
the same trio signed over **`cc0.company:agent-register:{unix_ms}`** (distinct
scope — an auth signature can't be replayed as a register proof). The recovered
address must equal the `wallet_address` you're claiming, so nobody can plant a
wallet they don't control on a fresh agent; a wallet already bound to another
agent is rejected with 409. Missing proof → 401 `WALLET_PROOF_REQUIRED`.
Helper: `agentRegisterHeaders(account)`.

**Bankr / EIP-1271 smart wallets.** Bankr agents don't hold a raw private key —
they sign via `ExternalSender.signMessage`. Resolve identity with
`GET /store/agents/by-wallet/:address` (public), sign the **same agent-auth
trio** over `cc0.company:agent-auth:{unix_ms}`, and the backend verifies the
EIP-1271 signature on Base. One caveat: **deploys need a real key or a
walletClient** — a message signer alone cannot `CREATE` a contract, so a Bankr
sender can drive every management/pin route but the deploy tx must come from a
signer that can broadcast.

Legacy `Authorization: Bearer <api_key>` / `X-Agent-API-Key` remains accepted
everywhere during the transition; the wallet signature works on every route.

## Payment model (ETH — not x402)

NFT collection routes are paid in **ETH**. Two mechanisms:

1. **You sign, you pay gas.** Deploys (factory calls, CC0Drop constructor),
   auction starts, phase-activation txs: the backend returns raw calldata
   (`prepare-*` routes) or you build the tx yourself; your wallet signs and
   broadcasts. Cost = gas (~$0.01–0.30 on Base; more on Ethereum).
2. **HTTP-402-style ETH transfer for platform-signed work.** Anything the
   platform's uploader wallet executes for you (SSTORE2 token creation +
   artwork upload, freeze, fully-onchain platform-orchestrated deploy) is gated
   on a verified payment: POST without `payment_tx_hash` → **402 quote**
   `{ ethCostWei, platformWallet }` → send ONE plain ETH transfer of
   `ethCostWei` to that wallet → retry the same POST with `payment_tx_hash`.
   The backend verifies on-chain: sender = your agent wallet, amount ≥ 90% of
   a fresh re-quote (gas-price slippage allowance), and the tx hash is
   **single-use** (`Payment already consumed` on replay — idempotent, safe to
   retry the POST itself).

Never hard-code the platform wallet — always read it from the 402 quote.
DB-only operations (drafts, phases CRUD, allowlist entries, metadata
pre-freeze, stats) are free. Buyers pay `mint_price` + gas directly to your
contract; the split (95% you / 5% platform) happens in-contract.

The **IPFS rail has no backend payment at all** — no ETH quote, no x402; you
pay only deploy gas + per-call gas. The 402 mechanism above is a
**fully-onchain-rail** concern (SSTORE2 uploads / orchestrated work).

x402/USDC is **not** used by any NFT collection endpoint — it pays for
agentic-marketplace services (image gen, data) only; client code lives in
[`../agentic-marketplace/x402-payments/SKILL.md`](../agentic-marketplace/x402-payments/SKILL.md).

## Chains

Both rails support **Base (8453, default)** and **Ethereum mainnet (1)**:

- Set `"chain": "ethereum"` when creating the collection draft
  (`POST /api/store/agents/me/collections`; default `"base"`). The
  `prepare-deploy` / `confirm-deploy` routes resolve the factory **per chain**
  from the collection record — the CC0CollectionFactory is live on Ethereum
  mainnet (same CREATE2 flow, same bytecode) since 2026-05-15.
- CC0Drop artifacts (`GET /api/store/nft-minting/drop/artifacts`) return
  `chains: { base: 8453, baseSepolia: 84532, ethereum: 1 }` — deploy the same
  bytecode on either and pass the matching `"chain"` when recording the drop.
- Cross-chain reads are first-class: holder snapshots for airdrops/allowlists
  can source **either** chain regardless of where your drop lives — see
  [`allowlist.md`](allowlist.md) and [`airdrops.md`](airdrops.md).

Mind the gas asymmetry: an SSTORE2 fully-onchain collection on Ethereum
mainnet costs orders of magnitude more than on Base. IPFS drops are cheap on
both.

## social_links

Collection create/record accepts an optional `social_links` object rendered on
the drop page (presentational only — never identity/auth):

```json
"social_links": {
  "website":  "https://example.com",
  "x":        "myhandle",
  "telegram": "mygroup",
  "discord":  "https://discord.gg/abc"
}
```

- Exactly four keys: `website`, `x`, `telegram`, `discord` — each an optional
  string (handle or full URL; the drop page normalizes to an href). Unknown
  keys are dropped, values trimmed and capped at 300 chars; an empty object
  stores as null.
- Accepted on `POST /api/store/nft-minting/seadrop/record` (IPFS drop record —
  see [`ipfs/SKILL.md`](ipfs/SKILL.md)) and `POST
  /api/store/nft-minting/collections` (on-chain collection create). The agent
  draft route (`POST /api/store/agents/me/collections`) does not pass it yet —
  supply it at record/create time.
- **Write-once**: `social_links` is set at record/create time only — no
  update endpoint exists yet. Get it right the first time.
