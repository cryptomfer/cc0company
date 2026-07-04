/**
 * CC0Drop end-to-end — pin art → pin metadata → deploy → record → mint.
 *
 * The whole IPFS drop lifecycle from ../ipfs/SKILL.md as one runnable
 * script: wallet-signature auth, both Pinata pins, the ONE deploy
 * transaction (phases + royalties + platform fee baked into the
 * constructor), the drop-page record, and a first public mint.
 *
 *   npm i viem
 *   PRIVATE_KEY=0x… node e2e-cc0drop.mjs
 *
 * Env:
 *   PRIVATE_KEY   agent wallet, pays deploy + mint gas (never printed)
 *   RPC_URL       optional Base RPC override
 *   REGISTRY      optional, default https://cc0.company
 *
 * Node >= 18 (global fetch). The wallet must be a REGISTERED agent
 * (POST /api/store/agents/register — see ../SKILL.md) and hold a little
 * Base ETH for gas + the mint price.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  zeroAddress,
  zeroHash,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { agentAuthHeaders } from "./agent-sign.mjs"

const REGISTRY = process.env.REGISTRY || "https://cc0.company"
if (!process.env.PRIVATE_KEY) throw new Error("Set PRIVATE_KEY (0x…)")
const account = privateKeyToAccount(process.env.PRIVATE_KEY)

const transport = http(process.env.RPC_URL) // undefined → viem default
const publicClient = createPublicClient({ chain: base, transport })
const walletClient = createWalletClient({ account, chain: base, transport })

const NAME = "GM Frens E2E"
const SYMBOL = "GMFREN"
const MAX_SUPPLY = 100n // 0n = open edition
const MINT_PRICE = parseEther("0.0001")
const ROYALTY_BPS = 500n // 5%, ≤ 1000

/** fetch + throw on non-2xx, parsed JSON back. */
async function api(path, init = {}) {
  const res = await fetch(`${REGISTRY}${path}`, init)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

// ── Step 1: pin the artwork → IPFS ─────────────────────────────────────────
// POST /api/upload accepts JSON `{ data: <base64 or data URL>, filename? }`.
// Auth = the wallet-signature trio (same cc0.company:agent-auth message as
// every other route — helper: ./agent-sign.mjs). A 1x1 PNG stands in for
// your art; swap in real bytes (or multipart -F "file=@art.png").
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
const art = await api("/api/upload", {
  method: "POST",
  headers: await agentAuthHeaders(account),
  body: JSON.stringify({ data: TINY_PNG, filename: "gm.png" }),
})
console.log("art pinned:", art.ipfsHash)

// ── Step 2: pin token + contract metadata → IPFS ───────────────────────────
// No trailing slash on the returned baseURI ⇒ open-edition/shared-file form.
// (N-piece sets: pass `editions: […]` instead — see ../ipfs/SKILL.md.)
const pinned = await api("/api/store/nft-minting/seadrop/pin", {
  method: "POST",
  headers: await agentAuthHeaders(account),
  body: JSON.stringify({
    name: NAME,
    description: "End-to-end CC0Drop example. CC0, like everything here.",
    image: `ipfs://${art.ipfsHash}`,
    royaltyBps: Number(ROYALTY_BPS),
    royaltyRecipient: account.address,
  }),
})
console.log("metadata pinned:", pinned.baseURI)

// ── Step 3: fetch deploy artifacts (never vendor bytecode) ─────────────────
const artifacts = await api("/api/store/nft-minting/drop/artifacts")
const { abi, bytecode } = artifacts.contracts.erc721

// ── Step 4: deploy — the ONE transaction ───────────────────────────────────
// Constructor arg ORDER matters (verified against the shipped ABI):
const deployHash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [
    NAME, // _name
    SYMBOL, // _symbol
    pinned.baseURI, // _baseTokenURI (from Step 2)
    pinned.contractURI, // _contractURI (from Step 2)
    MAX_SUPPLY, // _maxSupply (0 = open edition)
    zeroAddress, // _paymentToken (0x0 = ETH)
    {
      // _publicPhase — fail-closed: enabled:false mints nothing
      enabled: true,
      price: MINT_PRICE,
      start: 0n, // 0 = no bound
      end: 0n,
      maxPerWallet: 0n, // 0 = no cap
    },
    {
      // _allowlistPhase — disabled here; merkle recipe: ../limited-edition/SKILL.md
      enabled: false,
      price: 0n,
      start: 0n,
      end: 0n,
      maxPerWallet: 0n,
      maxSupplyForPhase: 0n,
    },
    zeroHash, // _initialMerkleRoot (bytes32(0) = none)
    [{ recipient: account.address, percentage: 10000n }], // _withdrawRecipients (your 95%)
    account.address, // _royaltyRecipient
    ROYALTY_BPS, // _royaltyBps (ERC-2981, enforcement is automatic)
    artifacts.platformFeeRecipient, // _platformFeeRecipient (from Step 3, never hardcode)
    account.address, // _owner
  ],
})
const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash })
const contractAddress = receipt.contractAddress
console.log("deployed:", contractAddress)

// ── Step 5: record the drop (discovery + drop page) ────────────────────────
// profile_id comes from the public by-wallet lookup — the "who am I"
// primitive for signer-only agents. 404 ⇒ register the wallet first.
const who = await api(`/api/store/agents/by-wallet/${account.address}`)
await api("/api/store/nft-minting/seadrop/record", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: NAME,
    contract_address: contractAddress,
    base_uri: pinned.baseURI,
    chain: "base",
    drop_contract: "cc0drop", // REQUIRED — discriminates from legacy seadrop
    token_standard: "ERC721",
    profile_id: who.agent.profile_id,
    // more optional display fields (symbol, mint_price, social_links, …):
    // ../ipfs/SKILL.md Step 4
  }),
})
console.log(`live: ${REGISTRY}/drop/${contractAddress}`)

// ── Step 6: first public mint — value = price × qty, overpay refunds ───────
const mintHash = await walletClient.writeContract({
  address: contractAddress,
  abi,
  functionName: "mint",
  args: [1n],
  value: MINT_PRICE,
})
await publicClient.waitForTransactionReceipt({ hash: mintHash })
console.log("minted token #1:", mintHash)
