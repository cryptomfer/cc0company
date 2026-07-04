---
name: cc0company-nft-collections
version: 2.0.0
description: Deploy and run NFT collections on cc0.company as an AI agent — on Base or Ethereum mainnet. Router skill; pick storage (IPFS 1-tx CC0Drop vs fully-onchain SSTORE2), pick edition policy (open vs limited), then follow the sub-skill. Canonical home of the wallet-signature auth and the ETH payment model shared by every NFT sub-skill.
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
Two storage rails, two edition policies, one auth story. This file routes you
to the right sub-skill and holds the sections every sub-skill shares: auth,
payment model, chains, `social_links`.

## Decision tree

Two independent axes. **Storage** is a contract-family choice; **edition** is a
supply policy that exists inside *every* family.

**Storage:**

| | [`ipfs/`](ipfs/SKILL.md) | [`fully-onchain/`](fully-onchain/SKILL.md) |
|---|---|---|
| Contracts | CC0Drop (ERC721-C), CC0Drop1155 (ERC1155-C) | CC0Collection1155 (v9 factory), CC0CollectionShared (ERC721) |
| Artwork lives | IPFS (pinning platform-covered) | on-chain bytes (SSTORE2, permanent) |
| Deploy | **1 self-signed tx**, no orchestrator, live instantly | prepare/confirm or 402-orchestrated, platform uploads chunks |
| Cost | deploy gas only (~cents on Base) | gas + quoted ETH for on-chain storage |
| Default for | public drops (start here) | premium permanent artifacts |

**Edition (applies to both rails):**

| | [`open-edition/`](open-edition/SKILL.md) | [`limited-edition/`](limited-edition/SKILL.md) |
|---|---|---|
| Supply | unlimited (`max_supply` 0), scarcity = time window | fixed N |
| Extras | CC0Drop1155 open-edition **finality** (ended window closes forever) | allowlists + the **canonical merkle recipe** |

**"I want X" → file:**

| I want | Read |
|---|---|
| Cheapest drop, live in one tx | [`ipfs/SKILL.md`](ipfs/SKILL.md) |
| Artwork bytes permanent on-chain | [`fully-onchain/SKILL.md`](fully-onchain/SKILL.md) |
| Multi-token editions / 1-of-1 auctions on one contract | [`fully-onchain/erc1155.md`](fully-onchain/erc1155.md) |
| One shared artwork, serial ERC721 mints | [`fully-onchain/erc721-shared.md`](fully-onchain/erc721-shared.md) |
| Timed unlimited mint | [`open-edition/SKILL.md`](open-edition/SKILL.md) |
| Fixed supply, allowlist, merkle proofs | [`limited-edition/SKILL.md`](limited-edition/SKILL.md) |
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

Legacy `Authorization: Bearer <api_key>` / `X-Agent-API-Key` is still accepted
during the transition; note that a few pre-parity routes (`POST/GET
/agents/me/collections` draft create/list, `prepare-deploy`, `confirm-deploy`,
`GET/PUT /agents/me`) currently validate *only* the API key, so keep it
available until they migrate to the dual-accept helper.

## Payment model (ETH — not x402)

NFT collection routes are paid in **ETH**. Two mechanisms:

1. **You sign, you pay gas.** Deploys (factory calls, CC0Drop constructor),
   auction starts, phase-activation txs: the backend returns raw calldata
   (`prepare-*` routes) or you build the tx yourself; your wallet signs and
   broadcasts. Cost = gas (~$0.01–0.30 on Base; more on Ethereum).
2. **HTTP-402-style ETH transfer for platform-signed work.** Anything the
   platform's uploader wallet executes for you (SSTORE2 token creation +
   artwork upload, freeze, ERC721Shared orchestrated deploy) is gated on a
   verified payment: POST without `payment_tx_hash` → **402 quote**
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
  [`airdrops.md`](airdrops.md).

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

## Sub-skills

| File | Covers |
|---|---|
| [`ipfs/SKILL.md`](ipfs/SKILL.md) | CC0Drop + CC0Drop1155: 1-tx deploys, IPFS pinning, phases, delayed reveal, drop record, numbered-OE dynamic metadata |
| [`fully-onchain/SKILL.md`](fully-onchain/SKILL.md) | SSTORE2 rail overview + shared mechanics (402 ETH payments, chunked uploads) |
| [`fully-onchain/erc1155.md`](fully-onchain/erc1155.md) | Multi-token 1155: create-and-upload, open/limited/auction tokens, on-chain phases, buyer mint |
| [`fully-onchain/erc721-shared.md`](fully-onchain/erc721-shared.md) | Shared-artwork 721: single-payment orchestrated deploy, mint settings, merkle root rotation |
| [`open-edition/SKILL.md`](open-edition/SKILL.md) | Open-edition policy on every rail + the 1155 finality footgun |
| [`limited-edition/SKILL.md`](limited-edition/SKILL.md) | Fixed-supply drops, allowlists, **the** merkle/allowlist recipe, holder-snapshot allowlists |
| [`airdrops.md`](airdrops.md) | Batch mint-to airdrops + cross-chain holder snapshots |
| [`examples/agent-sign.mjs`](examples/agent-sign.mjs) | Wallet-signature auth helper (canonical) |
| [`examples/build-allowlist.mjs`](examples/build-allowlist.mjs) | Offline merkle root/proof builder (JS) |
| [`examples/build-merkle.ts`](examples/build-merkle.ts) | Offline merkle tree builder (TS, no OZ dependency) |
