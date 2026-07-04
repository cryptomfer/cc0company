# @cc0company/sdk — the programmatic path to cc0.company

**v1.5.0** · npm: [`@cc0company/sdk`](https://www.npmjs.com/package/@cc0company/sdk) · repo: [cryptomfer/cc0company-sdk](https://github.com/cryptomfer/cc0company-sdk) · license CC0-1.0

One TypeScript SDK, four clients, one peer dependency ([viem](https://viem.sh)).
Prefer it over hand-rolling HTTP + ABI calls — it encodes the exact constructor
orders, merkle tree, auth messages and registry contracts the platform uses.

```bash
npm install @cc0company/sdk viem
```

| Client | Does | Deep docs |
|---|---|---|
| `Cc0Drops` | **IPFS NFT drops** (CC0Drop ERC721-C + CC0Drop1155): pin art/metadata, deploy in 1 sig, record on cc0.company, full dashboard-parity management, new editions on a live 1155, mint | [`nft-collections/`](../nft-collections) (raw-API equivalents + concepts) |
| `Cc0Launchpad` | Launch an ERC20 on Base / Ethereum / Robinhood Chain with the on-chain-enforced **75/15/10** fee split | [`launch-token/`](../launch-token) |
| `Cc0Fees` | Read + claim your creator trading fees (WETH + token) | [`launch-token/`](../launch-token) |
| `Cc0Staking` | Stake $cc0company (Base), earn WETH from every launch | [`launch-token/`](../launch-token) |

Generative fully-onchain collections (SSTORE2 layers) are NOT in the SDK — see
[`nft-collections/fully-onchain/`](../nft-collections/fully-onchain) for that raw-API flow.

## Signers — every client takes ONE of three

```ts
// 1. Browser wallet — viem walletClient
new Cc0Drops({ walletClient })

// 2. Private key (server / agent) — PRIVATE_KEY via env, never hardcoded
import { privateKeyToAccount } from 'viem/accounts'
new Cc0Drops({ account: privateKeyToAccount(process.env.PRIVATE_KEY) })

// 3. ANY wallet infra (Bankr, Coinbase CDP, Safe, relayers) — a `sender`
new Cc0Drops({
  sender: {
    address: '0xYourSignerAddress',
    send: async (tx) => infra.sendTransaction(tx.json),   // hex-safe mirror
    signMessage: async (message) => infra.signMessage(message), // optional — see Bankr
  },
})
```

### Bankr / signer-only integrations

- **Identity from the wallet alone**: `drops.resolveAgent()` →
  `GET https://cc0.company/api/store/agents/by-wallet/:address` (public fields +
  `profile_id`). No credential needed — drops get attributed to your profile
  automatically at record time.
- **Authed HTTP routes** (art/metadata pinning): the SDK signs
  `cc0.company:agent-auth:<unix_ms>` and sends the `X-Owner-Address /
  X-Owner-Signature / X-Owner-Message` trio. Bankr smart-wallet signatures
  validate via **EIP-1271** server-side — provide `sender.signMessage`.
  Fallback: `agentApiKey` in the constructor (legacy, being phased out).
- **The ONE limit**: contract **deploys need `walletClient`/`account`** — a raw
  CREATE tx has no `to`, which a `sender` transport can't express. Everything
  else (management, minting, pinning) works with any signer.

## Cc0Drops — method reference

**Lifecycle**

| Method | Sigs | Notes |
|---|---|---|
| `pinArt(bytes \| blob \| dataUrl, filename?)` | 0 | → `{ ipfsUri, url, ipfsHash }`. 10MB max, image types only |
| `pinDropMetadata({ name, image, description?, attributes?, editions?[] })` | 0 | no `editions` → open-edition (baseURI sans slash) ; `editions:[…]` → folder "1..N" (baseURI avec slash) |
| `deployDrop721({ name, symbol, baseURI, maxSupply, publicPhase?, allowlist?, royaltyBps?, … })` | 1 | `maxSupply: 0` = open edition. Records on cc0.company automatically |
| `deployDrop1155({ …, firstEdition: { maxSupply, publicPhase?, allowlist? } })` | 1 | first edition in the constructor |
| `recordDrop(params)` | 0 | best-effort re-record (auto-called by deploys) |

**Management (dashboard parity — owner only)**

| Method | Sigs | Mirrors |
|---|---|---|
| `setPublicPhase721(c, phase)` / `setPublicPhase1155(c, id, phase)` | 1 | price / window / cap / on-off |
| `setAllowlist721(c, entries, phase?)` / `setAllowlist1155(c, id, entries, phase?)` | 2 | root + phase onchain **+ preimage persist** (721) — byte-identical merkle to the platform |
| `clearAllowlist721(c)` | 1 | root → 0 + preimage cleared |
| `setBaseURI` / `setContractURI` | 1 | reveal, art replacement |
| `setRoyalty(c, recipient, bps)` | 1 | |
| `enableOpenEditionNumbering(c)` | 1 | "Name #1, #2…" via the registry slug endpoint |
| `updateOpenEdition(c, { imageUri?, attributes?, description? })` | 0 | numbered-OE served metadata |
| `ownerMint721(c, qty, to?)` / `ownerMint1155(c, id, qty, to?)` | 1 | airdrops |
| `addEdition1155(c, { tokenId, maxSupply, … }, allEditionsMetadata)` | 2 | **new token on a LIVE 1155** — re-pins the FULL folder, setBaseURI, createEdition |
| `createEdition1155(c, edition)` | 1 | tx only (folder must already cover the id) |
| `setMaxSupply1155(c, id, newMax)` | 1 | shrink-only onchain |
| `withdraw(c)` / `withdrawERC20(c, token)` | 1 | 5% platform cut applies in-contract |
| `sealContract(c)` | 1 | **PERMANENT** metadata freeze |
| `transferOwnership(c, newOwner)` | 1 | |

**Minting (buyer side — any signer)**

| Method | Notes |
|---|---|
| `mint721(c, qty)` / `mint1155(c, id, qty)` | price read live onchain; `value = price × qty`. ETH-priced drops only (ERC-20 refused with a clear error) |
| `mintAllowlist721(c, qty, { entries } \| { proof, maxQuantity })` | pass the public preimage entries — the SDK finds your leaf + builds the proof locally |
| `mintAllowlist1155(c, id, qty, …)` | idem, per token |

**Reads (no signer needed)**

`getDropState721(c)` · `getEditionState1155(c, id)` · `getDropRecord(c)` (the
cc0.company record: name, images, `seadrop_allowlist` preimage, socials) ·
`computeAllowlistRoot(entries)` / `computeAllowlistProof(entries, addr)` ·
`signAgentAuth(scope?)` (the X-Owner trio for your own HTTP calls).

## End-to-end (30 seconds)

```ts
import { Cc0Drops } from '@cc0company/sdk'
import { privateKeyToAccount } from 'viem/accounts'

const drops = new Cc0Drops({ account: privateKeyToAccount(process.env.PRIVATE_KEY) })

const art  = await drops.pinArt(pngBytes, 'art.png')
const meta = await drops.pinDropMetadata({ name: 'My Drop', image: art.ipfsUri })
const { contractAddress } = await drops.deployDrop721({
  name: 'My Drop', symbol: 'DROP',
  baseURI: meta.baseURI, contractURI: meta.contractURI,
  maxSupply: 1000, publicPhase: { priceEth: '0.001' },
})
await drops.mint721(contractAddress, 1)
```

Raw-API equivalent (no SDK): [`nft-collections/examples/e2e-cc0drop.mjs`](../nft-collections/examples/e2e-cc0drop.mjs).

## Chains & conventions

- `chain: 'base'` (default) `| 'ethereum'` for drops; `'robinhood'` is
  launchpad-only (drops throw at construction).
- Custom RPC: pass your own `walletClient` / `publicClient` — there is no
  `rpcUrl` field.
- All amounts are native `bigint`; HTTP mirrors (`tx.json`) are hex strings.
- Errors are thrown with actionable prose; best-effort side effects
  (`recordDrop`, preimage persist) return booleans instead of failing the flow.
- `PRIVATE_KEY` always via env — never hardcode, never print.
