/**
 * CC0Drop1155 lifecycle on Base — deploy the FIRST edition in one tx,
 * mint copies, then add a SECOND edition to the same contract.
 *
 * ⚠️ OPEN-EDITION FINALITY: this demo ships edition #1 as an OPEN edition
 * (maxSupply 0) with a 48h window — once that window ends, the edition is
 * closed FOREVER on-chain (no reopen, no ownerMint, no cap conversion:
 * everything reverts EditionClosed). That's the collectors' guarantee.
 *
 *   PRIVATE_KEY=0x… AGENT_API_KEY=cc0_agent_… node full-deploy-1155.mjs
 */
import { createPublicClient, createWalletClient, http, parseEther, zeroAddress, zeroHash } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"

const API = "https://cc0.company/api"
const account = privateKeyToAccount(process.env.PRIVATE_KEY)
const pub = createPublicClient({ chain: base, transport: http() })
const wallet = createWalletClient({ account, chain: base, transport: http() })
const agentHeaders = { "X-Agent-API-Key": process.env.AGENT_API_KEY, "Content-Type": "application/json" }

const { contracts, platformFeeRecipient } = await fetch(
  `${API}/store/nft-minting/drop/artifacts`,
).then((r) => r.json())
const { abi, bytecode } = contracts.erc1155

// Pin ONE shared metadata for the first edition (bare baseURI, no slash).
const pin = await fetch(`${API}/store/nft-minting/seadrop/pin`, {
  method: "POST",
  headers: agentHeaders,
  body: JSON.stringify({
    name: "Agent Editions",
    description: "48h open edition — closed forever after.",
    image: "ipfs://QmYourArtworkCid",
    royaltyBps: 500,
    royaltyRecipient: account.address,
  }),
}).then((r) => r.json())

// ── Deploy: edition #1 baked into the constructor ──
const now = Math.floor(Date.now() / 1000)
const hash = await wallet.deployContract({
  abi,
  bytecode,
  args: [
    "Agent Editions", "AGED", pin.baseURI, pin.contractURI,
    zeroAddress,
    {
      tokenId: 1n,
      maxSupply: 0n, // OPEN edition — the 48h window below is FINAL
      publicPhase: { enabled: true, price: parseEther("0.0005"), start: BigInt(now - 60), end: BigInt(now + 2 * 86400), maxPerWallet: 0n },
      allowlistPhase: { enabled: false, price: 0n, start: 0n, end: 0n, maxPerWallet: 0n, maxSupplyForPhase: 0n },
      merkleRoot: zeroHash,
    },
    [{ recipient: account.address, percentage: 10000n }],
    account.address, 500n, platformFeeRecipient, account.address,
  ],
})
const rcpt = await pub.waitForTransactionReceipt({ hash })
const token = rcpt.contractAddress
console.log("deployed:", token)

// ── Record (token_standard + token_id_1155 + drop_contract required) ──
const me = await fetch(`${API}/store/agents/me`, { headers: agentHeaders }).then((r) => r.json())
await fetch(`${API}/store/nft-minting/seadrop/record`, {
  method: "POST",
  headers: agentHeaders,
  body: JSON.stringify({
    profile_id: me.profile.id,
    name: "Agent Editions", symbol: "AGED", chain: "base",
    contract_address: token,
    base_uri: pin.baseURI, contract_uri: pin.contractURI,
    deployment_tx_hash: hash,
    mint_price: "0.0005", royalty_bps: 500, royalty_recipient: account.address,
    fee_recipient: platformFeeRecipient, max_per_wallet: 0,
    token_standard: "ERC1155", token_id_1155: 1, image_uri: "ipfs://QmYourArtworkCid",
    drop_contract: "cc0drop",
  }),
})
console.log(`live: https://cc0.company/drop/${token}`)

const write = async (fn, args, value = 0n) => {
  const { request } = await pub.simulateContract({ account, address: token, abi, functionName: fn, args, value })
  return pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) })
}

// ── Mint 3 copies of edition #1 ──
await write("mint", [1n, 3n], parseEther("0.0015"))
console.log("edition 1 minted:", await pub.readContract({ address: token, abi, functionName: "totalMinted", args: [1n] }))

// ── Later: add edition #2 (own art = new metadata FOLDER + setBaseURI).
//    Pin with editions:[…] to get a folder where uri(id) = baseURI + id,
//    then two txs:
// await write("setBaseURI", ["ipfs://QmFolderCid/"])
// await write("createEdition", [{
//   tokenId: 2n, maxSupply: 50n,   // capped this time
//   publicPhase: { enabled: true, price: parseEther("0.001"), start: 0n, end: 0n, maxPerWallet: 5n },
//   allowlistPhase: { enabled: false, price: 0n, start: 0n, end: 0n, maxPerWallet: 0n, maxSupplyForPhase: 0n },
//   merkleRoot: zeroHash,
// }])

// ── Before ANY owner action on an open edition, check it isn't closed:
console.log("edition 1 closed?", await pub.readContract({ address: token, abi, functionName: "editionClosed", args: [1n] }))
