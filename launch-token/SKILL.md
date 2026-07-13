---
name: cc0company-launch-token
version: 2.0.0
description: Launch your own token on the cc0.company launchpad (Base · Ethereum · Robinhood Chain, Uniswap V4) as an AI agent — one transaction, instant liquidity, 75% of all trading fees back to you forever, enforced on-chain. Wallet flows for viem / private key / CDP, an HTTP-only sender flow for Bankr-style wallets, and fee claiming. ($cc0company staking is now its own skill — see cc0company-staking.)
homepage: https://cc0.company
api_base: https://cc0.company/api
sdk: "@cc0company/sdk"
chains: base (8453) | ethereum (1) | robinhood (4663)
factory_base: 0xf9007657b627c5421d6eBD5D71F86CDfCdc7dA8D
factory_ethereum: 0x70baFfe8783396142385Ece53f2cDF8D1cf9872C
factory_robinhood: 0x79F331d3d7977062d5c78Ad122851fC57Ee3DC1a
cc0company_token: 0x67c5F00491c09cbCF6359f95690574E6106bb3CF # lives on Base; staking happens there
---

# cc0.company Launch Token — Skill for AI Agents

Launch a token on **Base, Ethereum mainnet, or Robinhood Chain** in ONE
transaction: ERC20 + Uniswap V4 pool + liquidity
locked forever + fee split wired — atomically. The token trades the second the
transaction lands. Your token page on cc0.company (chart, swap, fee-claim
button) goes live automatically.

## The economics — enforced on-chain, not promised

Every trade's LP fee is split:

| Share | Recipient | Asset |
|-------|-----------|-------|
| **75%** | **You, the creator** — splittable across up to 5 wallets | ETH + your own token |
| 15% | $cc0company stakers | ETH |
| 10% | Platform treasury | ETH |

The factory validates this split on every `deployToken` call. A config that
drops, resizes, or re-administers the staking/treasury slices reverts with
`Cc0InvalidProtocolSplit` — there is no way to launch around it, which also
means nobody can rug YOUR 75%. You remain the admin of your own slices:
redirect or re-split them any time.

## Install

```bash
npm install @cc0company/sdk viem
```

Source: [github.com/cryptomfer/cc0company-sdk](https://github.com/cryptomfer/cc0company-sdk) (CC0-1.0).

## Path A — viem-compatible signer (walletClient or private key)

```typescript
import { Cc0Launchpad } from '@cc0company/sdk';
import { privateKeyToAccount } from 'viem/accounts';

// Pick the chain at construction — 'base' (default) | 'ethereum' | 'robinhood'
// (or the ids 8453 | 1 | 4663). Same factory logic, same enforced split on all three.
const launchpad = new Cc0Launchpad({
  account: privateKeyToAccount(process.env.PK),
  chain: 'base',
});
// or { walletClient } for browser wallets (MetaMask, Rabby, …)
```

Then launch:

```typescript
const { tokenAddress, txHash, registered } = await launchpad.launchToken({
  name: 'My Token',
  symbol: 'MTK',
  image: imageBytes, // ANY https URL, data: URL, Blob or Uint8Array — the SDK pins
                     // it to IPFS via cc0.company BEFORE launching (the URI goes
                     // on-chain forever, so permanence is guaranteed; 8MB max,
                     // images only). ipfs:// URIs pass through untouched. If
                     // pinning fails the launch fails — by design. Escape hatch:
                     // imagePolicy: 'as-is'.
  description: 'born to launch',   // stored on-chain
  feeTier: 1,                      // 1 | 2 | 3 % static — or feeMode: 'dynamic'
});
// registered === true → cc0.company/token/{tokenAddress} is live
```

Need the `ipfs://` URI up front (e.g. for Path B)?
`await launchpad.pinImage(bytesOrUrl)` → `{ cid, ipfsUri, gatewayUrl }` —
direct endpoint: `POST https://cc0.company/api/store/launchpad/pin-image`
(multipart `file` or JSON `{ url }`).

Gas: paid in ETH on all three chains — a few cents on Base / Robinhood Chain,
mainnet prices on Ethereum. That's the only cost — no listing fee.

## Path B — ANY other wallet infra (Coinbase CDP, Bankr, Safe, relayers)

Some wallet infra can't hand you a viem account — give the SDK a `sender`
instead: `{ address, send(tx) → txHash }`. The SDK pins the image, builds the
tx, estimates gas (+20%); your infra signs + submits; the SDK waits, parses,
and registers. ALL SDK methods (launch, claim fees, stake) work through it.

### CDP sender

CDP accounts are NOT viem-compatible for transaction sending (no `toAccount`
adapter exists in `@coinbase/cdp-sdk`):

```typescript
import { CdpClient } from '@coinbase/cdp-sdk';
import { Cc0Launchpad } from '@cc0company/sdk';

const cdp = new CdpClient();
const account = await cdp.evm.getOrCreateAccount({ name: 'launcher' });

const launchpad = new Cc0Launchpad({
  sender: {
    address: account.address,
    send: async (tx) => {
      // CDP's TypeScript SDK wants the BIGINT fields (tx.*) — hex fee strings
      // throw TipAboveFeeCapError. Everything is pre-estimated by the SDK.
      // (tx.json — the hex mirror — is for RAW JSON transports/relayers only.)
      const { transactionHash } = await cdp.evm.sendTransaction({
        address: account.address,
        network: 'base', // or 'ethereum' — Robinhood Chain isn't a CDP network; use the generic sender + its RPC
        transaction: {
          to: tx.to,
          data: tx.data,
          value: tx.value,
          gas: tx.gas,
          maxFeePerGas: tx.maxFeePerGas,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        },
      });
      return transactionHash; // CDP's field is `transactionHash`, NOT `hash`
    },
  },
});

await launchpad.launchToken({ ... }); // everything handled end-to-end
```

### Bankr sender (HTTP-only wallet, no local key)

Bankr submits raw transactions over HTTP via **`/wallet/submit`** — that's what
`sender` is for. Bankr wants **DECIMAL strings** for `value`/`gas`/fees (NOT the
hex `tx.json` — hex makes it reject the tx), so pass the bigint fields as
`.toString()`. This is the SAME sender you use for NFT drops:

```typescript
const launchpad = new Cc0Launchpad({
  sender: {
    address: BANKR_WALLET_ADDRESS, // your Bankr wallet's address
    send: async (tx) => {
      const res = await fetch('https://api.bankr.bot/wallet/submit', {
        method: 'POST',
        headers: { 'X-API-Key': process.env.BANKR_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: {
            to: tx.to, data: tx.data,
            value: tx.value.toString(),                    // DECIMAL wei, not hex
            gas: tx.gas.toString(), type: 2,
            maxFeePerGas: tx.maxFeePerGas?.toString(),
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
            chainId: tx.chainId,                           // 8453 Base · 1 Ethereum · 4663 Robinhood
          },
          waitForConfirmation: true,
        }),
      });
      return (await res.json()).transactionHash;           // Bankr's field is transactionHash
    },
  },
});
```

Two Bankr gotchas: (1) always `/wallet/submit`, never `bankr prompt` — launch
calldata blows past the 10,000-character prompt limit; (2) a `403` means your
key/wallet config blocks raw calldata (**"Disable arbitrary contract calls"**
toggle must be OFF, key must have `walletApiEnabled`, check recipient/IP
allowlists) — see the Bankr gotchas in
[`../agentic-marketplace/x402-payments/SKILL.md`](../agentic-marketplace/x402-payments/SKILL.md).

## All launch options

```typescript
await launchpad.launchToken({
  name: 'My Token',
  symbol: 'MTK',
  image: 'ipfs://…',

  feeMode: 'static',            // 'static' (default) | 'dynamic' (1%→3% volatility preset)
  feeTier: 1,                   // 1 | 2 | 3 (static only)

  // Split YOUR 75% across up to 5 wallets (bps of TOTAL fees, sum must be 7500)
  creatorRewards: [
    { recipient: '0xYou',     bps: 5000, feePreference: 'both' },   // ETH + token
    { recipient: '0xPartner', bps: 2500, feePreference: 'paired' }, // ETH only
  ],

  // Anti-snipe: descending tax on the first seconds… or omit for a 2-block MEV delay
  sniperTax: { startingBps: 800_000, endingBps: 50_000, secondsToDecay: 15 },

  // Lock supply for yourself (lockup ≥ 7 days, optional linear vesting)
  vault: { percentage: 10, lockupSeconds: 604800, vestingSeconds: 2592000 },

  // Merkle airdrop of supply (lockup ≥ 1 day)
  airdrop: { merkleRoot: '0x…', percentage: 5 },

  // Buy your own token in the launch transaction
  devBuyEth: '0.05',

  register: true,               // default — auto-registers on cc0.company
});
```

## Claim your fees

Fees accrue in the fee locker per `(feeOwner, token)` as trades happen.
Claiming is PERMISSIONLESS — any wallet can trigger it, funds always go to the
creator. Three ways:

```typescript
// SDK
import { Cc0Fees } from '@cc0company/sdk';
const fees = new Cc0Fees({ account });
await fees.getClaimableFees(creatorWallet, tokenAddress); // { weth, token } in wei
await fees.claimFees(creatorWallet, tokenAddress);        // claims both
```

- **Token page**: `cc0.company/token/{address}` has a one-tap **Claim fees** button.
- **Raw contract**: `claim(address feeOwner, address token)` on the fee locker
  `0xC04bdF721FA5CEc839819864FA86F3D48B89Fcee` (claim WETH at
  `0x4200000000000000000000000000000000000006`, and your token address).

## Stake $cc0company

15% of every launchpad token's trading fees flow to **$cc0company stakers** in
WETH — stake once on Base and earn from launches on all three chains. The full
stake / claim / unstake flow (SDK + any-wallet `sender`), the 48h unbond
cooldown, and the staking contract addresses live in the dedicated skill:
[`../staking/SKILL.md`](../staking/SKILL.md).

## Contract reference (all three chains, all verified)

Independently deployed on each chain — same factory logic, same enforced split.
The SDK picks the right addresses from your `chain` automatically
(`CC0_CONTRACTS` export); hardcode only if you skip the SDK.

| Contract | Base (8453) | Ethereum (1) | Robinhood Chain (4663) |
|----------|-------------|--------------|------------------------|
| Factory (validates the split) | `0xf9007657b627c5421d6eBD5D71F86CDfCdc7dA8D` | `0x70baFfe8783396142385Ece53f2cDF8D1cf9872C` | `0x79F331d3d7977062d5c78Ad122851fC57Ee3DC1a` |
| Fee locker (claim here) | `0xC04bdF721FA5CEc839819864FA86F3D48B89Fcee` | `0x0De94068195C5d85e31406804357F44E0D20E255` | `0x343d77D94A119D5cEA495aeE8336A3a7Aa5CD385` |
| Staking recipient (the 15%) | `0x38cE743b88c54eD1aF84816Ff596E518d16DFF95` | `0xF84D22728E7f4DdD56Fd3BE7Cb30148e727A8a1a` | `0xE4542b52Ed212bDcFb10f3C9F8A12f2cEeeF35b2` |
| WETH | `0x4200000000000000000000000000000000000006` | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

Explorers: [basescan.org](https://basescan.org) · [etherscan.io](https://etherscan.io) · [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) (Arbitrum-Orbit L2, ETH gas).

**Staking is on Base only** (`$cc0company` `0x67c5F00491c09cbCF6359f95690574E6106bb3CF`) —
the 15% staker slice reaches the Base pool from every chain via bridges. How to
stake + the staking contracts: [`../staking/SKILL.md`](../staking/SKILL.md).
**Fee claiming (`Cc0Fees`) happens on the chain you launched on.**

Full list: [cc0.company/docs/smart-contracts](https://cc0.company/docs/smart-contracts).

## Errors you might hit

| Error | Cause | Fix |
|-------|-------|-----|
| `Cc0InvalidProtocolSplit` | Hand-rolled lockerConfig that drops/resizes the protocol slices | Use the SDK — it builds the exact enforced layout |
| `Deprecated` | You called the OLD factory (`0x2Ed3…D40B`) | Use the current factory above / update the SDK |
| `walletClient has no account attached` | viem client built without an account | Pass `account:` to the constructor or attach one to the WalletClient |
| `registered: false` in the result | Registry unreachable (the launch itself succeeded) | Call `registerLaunch()` again later — idempotent |

## Related skills

- [`../staking/SKILL.md`](../staking/SKILL.md) — stake $cc0company, earn the 15% fee share
- [`../nft-collections/SKILL.md`](../nft-collections/SKILL.md) — deploy NFT collections (Base + Ethereum)
- [`../agentic-marketplace/SKILL.md`](../agentic-marketplace/SKILL.md) — pay-per-call services (x402/USDC)

## License

CC0.
