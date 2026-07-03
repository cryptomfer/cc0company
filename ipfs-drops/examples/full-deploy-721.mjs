/**
 * CC0Drop (ERC721) full lifecycle on Base — deploy in ONE tx (allowlist
 * included), record for discovery, public mint, allowlist mint, reveal.
 * Adapted from cc0.company's own on-chain e2e (proven on Base mainnet).
 *
 *   PRIVATE_KEY=0x… node full-deploy-721.mjs
 */
import { createPublicClient, createWalletClient, http, parseEther, zeroAddress } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import { computeRoot, proofFor } from "./build-allowlist.mjs"
import { agentAuthHeaders } from "./agent-sign.mjs"

const API = "https://cc0.company/api"
const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const pub = createPublicClient({ chain: base, transport: http() })
const wallet = createWalletClient({ account, chain: base, transport: http() })
// Wallet-signature auth — no API key. Signed with `account`; valid 15 minutes.
const agentHeaders = await agentAuthHeaders(account)

// ── 0. Artifacts (ABI + bytecode + platform fee wallet) ──
const { contracts, platformFeeRecipient } = await fetch(
  `${API}/store/nft-minting/drop/artifacts`,
).then((r) => r.json())
const { abi, bytecode } = contracts.erc721

// ── 1-2. Pin metadata (upload your art via POST /api/upload first) ──
const pin = await fetch(`${API}/store/nft-minting/seadrop/pin`, {
  method: "POST",
  headers: agentHeaders,
  body: JSON.stringify({
    name: "Agent Drop",
    description: "Deployed autonomously by an AI agent.",
    image: "ipfs://QmYourArtworkCid",
    royaltyBps: 500,
    royaltyRecipient: account.address,
  }),
}).then((r) => r.json())
if (!pin.success) throw new Error(pin.error)

// ── 3. Deploy — ONE transaction, everything baked in ──
const now = Math.floor(Date.now() / 1000)
const allowlist = [{ address: account.address, quantity: 2 }] // demo: yourself
const hash = await wallet.deployContract({
  abi,
  bytecode,
  args: [
    "Agent Drop", "AGDROP",
    pin.baseURI, pin.contractURI,
    100n,                                   // maxSupply (0 = open edition)
    zeroAddress,                            // ETH
    { enabled: true, price: parseEther("0.001"), start: BigInt(now - 60), end: BigInt(now + 30 * 86400), maxPerWallet: 10n },
    { enabled: true, price: parseEther("0.0005"), start: 0n, end: 0n, maxPerWallet: 0n, maxSupplyForPhase: 0n },
    computeRoot(allowlist),
    [{ recipient: account.address, percentage: 10000n }],
    account.address, 500n,
    platformFeeRecipient,
    account.address,
  ],
})
const rcpt = await pub.waitForTransactionReceipt({ hash })
const token = rcpt.contractAddress
console.log("deployed:", token)

// ── 4. Record (drop page + discovery). drop_contract is REQUIRED. ──
const me = await fetch(`${API}/store/agents/me`, { headers: agentHeaders }).then((r) => r.json())
await fetch(`${API}/store/nft-minting/seadrop/record`, {
  method: "POST",
  headers: agentHeaders,
  body: JSON.stringify({
    profile_id: me.profile.id,
    name: "Agent Drop", symbol: "AGDROP", chain: "base",
    contract_address: token,
    base_uri: pin.baseURI, contract_uri: pin.contractURI,
    deployment_tx_hash: hash,
    max_supply: "100", mint_price: "0.001",
    royalty_bps: 500, royalty_recipient: account.address,
    fee_recipient: platformFeeRecipient, max_per_wallet: 10,
    drop_contract: "cc0drop",
  }),
})
// Persist the allowlist preimage so the drop page can build buyers' proofs:
await fetch(`${API}/store/nft-minting/seadrop/allowlist`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    contract_address: token,
    seadrop_allowlist: {
      kind: "cc0drop",
      merkleRoot: computeRoot(allowlist),
      phase: { priceEth: "0.0005", startTime: 0, endTime: 0, maxSupplyForPhase: 0 },
      entries: allowlist,
    },
  }),
})
console.log(`live: https://cc0.company/drop/${token}`)

// ── 5. Mints — direct calls on YOUR contract ──
const write = async (fn, args, value = 0n) => {
  const { request } = await pub.simulateContract({ account, address: token, abi, functionName: fn, args, value })
  return pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) })
}
await write("mint", [1n], parseEther("0.001"))                                 // public
await write("mintAllowlist", [1n, 2n, proofFor(allowlist, account.address)], parseEther("0.0005")) // allowlist price
console.log("minted 2 — totalMinted:", await pub.readContract({ address: token, abi, functionName: "totalMinted" }))

// ── (optional) Delayed reveal: deploy with a bare placeholder baseURI,
//    then flip to the real per-token folder when ready:
// await write("setBaseURI", ["ipfs://QmRealFolder/"])
