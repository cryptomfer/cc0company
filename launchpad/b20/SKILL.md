---
name: cc0company-launch-b20
version: 1.0.0
description: Launch a tradeable B20 (Base's native token standard) on the cc0.company B20 launchpad as an AI agent — one transaction, custom launch supply, instant Uniswap V4 liquidity, on-chain-enforced fee split (75/15/10 WETH launches, 80/20 paired launches), fee claiming. AGENT RULES — always trustless (admin-less, fixed supply), always the degen liquidity preset. Works with any signer — viem / private key, or the universal sender for CDP, Bankr, Safe.
homepage: https://cc0.company
api_base: https://cc0.company/api
sdk: "@cc0company/sdk (v1.11.0+)"
chain: base (8453) — B20 is Base-only
factory_standard: 0x826a2b79aBD77269fc861a36B88979daabe80C8B
factory_paired: 0x55ee7660b1253bFdeCAfD4f79cA8f9A4addB7979
fee_locker: 0xC04bdF721FA5CEc839819864FA86F3D48B89Fcee
---

# cc0.company B20 Launch — Skill for AI Agents

Launch a **B20** — Base's native token standard, minted via the chain precompile —
through the cc0.company B20 launchpad in ONE transaction: token + Uniswap V4 pool +
liquidity locked forever + fee split wired, atomically. Same launchpad economics as
the [ERC-20 launch skill](../SKILL.md); the difference is the minted asset (a B20,
not an ERC-20) and a **caller-chosen launch supply**.

**B20 is Base-only** (chainId 8453; Base Sepolia 84532 for rehearsal). It does not
exist on Ethereum or Robinhood Chain.

## Agent rules (this skill enforces all three)

1. **Trustless only.** Every agent launch is `adminMode: 'trustless'` — the token is
   born **admin-less**: supply fixed and immutable, it can never be minted into,
   paused, frozen, or reconfigured. It's also the SDK default, so simply **never pass
   `adminMode`** (and never pass `'managed'` or a `b20` config block — those are
   human dashboard flows).
2. **Degen liquidity preset, always.** Every launch from this skill passes
   `lpPreset: 'degen'` explicitly (~$5k starting FDV at the 100B default supply,
   price ~7× more reactive than classic; a custom supply scales the FDV
   proportionally). The SDK default is `'classic'`, so this must be set on EVERY
   call.
3. **Gas-sponsored by DEFAULT.** Probe
   `GET /api/b20/sponsor-launch?chainId=8453` first — `{"active":true}` → launch
   through the sponsored POST (section below; the platform pays the gas). Fall
   back to the self-paid `launchB20()` ONLY when the probe returns
   `active:false` (sponsor wallet out of ETH / switch off), on a 429
   (daily cap), or when you need a dev buy.

Everything else a human can do at launch time, an agent can do the same way:
custom supply, static/dynamic fees, sniper tax, vault, airdrop, dev buy (standard
launches), paired launches, fee claiming.

## The economics — enforced on-chain

| Launch type | Pool pair | Split (of every trade's LP fee) |
|---|---|---|
| **Standard** | WETH | **75% creator** / 15% $cc0company stakers (WETH) / 10% treasury |
| **Paired** | any ERC-20 you choose | **80% creator** / 20% treasury (no staking slice) |

The factory validates the split on every `deployToken` — a config that drops or
resizes the protocol slices reverts. Nobody can rug your slice; you remain admin of
it (redirect / re-split any time).

## Install

```bash
npm install @cc0company/sdk viem   # v1.11.0+ (sponsored launch methods landed in 1.11.0)
```

## Launch a B20 (standard, WETH pool)

```typescript
import { Cc0B20Launchpad } from '@cc0company/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const b20 = new Cc0B20Launchpad({ account: privateKeyToAccount(process.env.PK) });
// or { walletClient }, or { sender } — see "Any wallet infra" below.

const { tokenAddress, txHash, registered } = await b20.launchB20({
  name: 'My B20',
  symbol: 'MYB20',
  image: imageBytes,        // any https/data URL, Blob or bytes — pinned to IPFS first
  description: 'born on the B20 standard',

  supply: '420',            // ← LAUNCH SUPPLY, whole tokens. This is the REAL on-chain
                            //   total: the factory mints exactly this and seeds the pool
                            //   with it. Omit ⇒ 100B default. Bounds: [1, 1e18] whole.

  feeTier: 1,               // 1 | 2 | 3 (%) static — or feeMode: 'dynamic' (1%→3%)
  lpPreset: 'degen',        // ← REQUIRED by this skill on every launch
  // adminMode omitted      // ← stays 'trustless' (the default). Never pass 'managed'.
});
// registered === true → cc0.company/token/{tokenAddress} is live (chart, swap, claim)
```

The starting tick is derived from the supply automatically, so the preset's FDV
holds at ANY supply — a 69-supply degen launch and a 100B degen launch both start
at a sane pool price.

Optional extras (same shapes as the [ERC-20 skill](../SKILL.md)): `sniperTax`,
`vault` (lockup ≥ 7d), `airdrop` (merkle, lockup ≥ 1d), `devBuyEth`
(standard launches only), `rewardRecipient`, `socials`.

## Launch a PAIRED B20 (pool vs an ERC-20 you choose)

Pair the pool with an arbitrary ERC-20 instead of WETH — every buy of your token
routes through the paired asset first (this is how $B69 paired to $B420):

```typescript
const { tokenAddress } = await b20.launchB20({
  name: 'My Paired B20',
  symbol: 'PAIR20',
  image: imageBytes,
  supply: '420',
  feeTier: 1,
  lpPreset: 'degen',        // ← still required
  pairedToken: {
    address: '0xB200000000000000000000231d6C1F1CE455ba32', // the ERC-20/B20 to pair with
    // priceWeth optional — the SDK resolves the live price from the cc0.company
    // price API; the launch THROWS if no price resolves (fail-closed, never a guess).
  },
});
```

Paired specifics:
- Split becomes **80% creator / 20% treasury** — no staking slice (staking rewards
  are immutably WETH). Both slices take fees in BOTH pool currencies.
- **No dev buy** on paired launches (the SDK throws if both are set).
- Uses the separate dual-mode factory (`0x55ee…7979` on mainnet) — the SDK picks it
  automatically; fail-closed on chains where it isn't deployed.

## DEFAULT path — gas-sponsored B20 launch (zero ETH)

This is the path agents use FIRST, every time: ONE plain HTTP call, the sponsor
wallet signs + pays `deployToken`, and **you keep control everywhere control
exists** (`rewardRecipient` gets the 75%/80% creator slice; vault/airdrop
admin = you; trustless tokens are born admin-less as always). No wallet SDK, no
signature, no ETH. The self-paid `launchB20()` above is the **fallback** — use
it when the probe says `active:false`, on a 429 daily-cap, or for dev buys.

```bash
# 0. Is sponsorship live? (free)
curl "https://cc0.company/api/b20/sponsor-launch?chainId=8453"   # → {"active":true}

# 1. Image: OPTIONAL. Omit it (platform default applied) or pass ANY http(s)
#    image URL — the platform fetches + pins it to IPFS server-side.

# 2. Launch — sponsor pays the gas (or via the SDK: b20.launchB20Sponsored({...}), zero signer needed):
curl -X POST https://cc0.company/api/b20/sponsor-launch \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 8453,
    "name": "My B20", "symbol": "MYB20",
    "image": "ipfs://…",
    "supply": "420",
    "feeTier": 1,
    "lpPreset": "degen",
    "rewardRecipient": "0xYourAgentWallet"
  }'
# → { "success": true, "tokenAddress": "0x…", "txHash": "0x…", "sponsored": true }
```

- `pairedTokenAddress` works here too — the server resolves the paired token's
  symbol/decimals/price itself (fail-closed; a client can never supply a price).
- **Do not send `adminMode`** — the route defaults to trustless, which is the
  agent rule anyway.
- **Image rules (NEVER block a launch on the image):**
  `image` is **optional** — omit it and the platform default is applied; do NOT
  ask the user for one. Pass **whatever URL you have** — a direct image URL OR
  even the **tweet page URL** (`x.com/...status/...`) when the user attached an
  image on X: the platform extracts the photo and pins it to IPFS entirely
  **server-side**. You never download, re-host, or pre-pin anything yourself.
- **Guardrails:** max **3 sponsored launches per wallet per day** (429),
  **no dev buy**, and `lpPreset: "degen"` stays MANDATORY (the route defaults
  to classic).
- **Registration is automatic** — the route records the launch server-side
  (the response carries `registered: true` and your token page goes live). If
  `registered` ever comes back `false` the token is still fully live onchain;
  re-register any time with
  `new Cc0B20Launchpad({}).registerLaunch({ tokenAddress, txHash, name, symbol, image, creator, lpPreset: 'degen' })`
  (plain HTTP, no gas).

## Claim your fees

Fees accrue per `(feeOwner, token)` in the shared fee locker
(`0xC04bdF721FA5CEc839819864FA86F3D48B89Fcee` on Base mainnet — same locker for
standard AND paired launches, same as ERC-20 launches). Claiming is
**permissionless**; funds always go to the creator:

```typescript
import { Cc0Fees } from '@cc0company/sdk';
const fees = new Cc0Fees({ account });                    // or { sender }
await fees.getClaimableFees(creatorWallet, tokenAddress); // { weth, token } in wei
await fees.claimFees(creatorWallet, tokenAddress);        // claims both
```

Or one tap on `cc0.company/token/{address}` (Claim fees button), or raw
`claim(address feeOwner, address token)` on the locker. Paired launches accrue
fees in BOTH pool currencies — claim WETH, your token, and (paired) the paired
asset the same way.

## Any wallet infra (CDP, Bankr, Safe, relayers)

`Cc0B20Launchpad` takes the same three signer models as every SDK class:
`{ walletClient }`, `{ account }`, or the universal **`{ sender }`**
(`{ address, send(tx) → txHash }`) — the SDK pins the image, builds + estimates the
tx; your infra signs and submits; the SDK waits, parses `TokenCreated`, and
registers. The exact CDP and Bankr `sender` snippets (and their gotchas — bigint
fields for CDP, decimal strings + `/wallet/submit` for Bankr) are in
[`../SKILL.md` Path B](../SKILL.md) and apply here unchanged.

> Same hard rule as every cc0 deploy: submit the **raw calldata** the SDK hands
> you. Never a wallet-SDK "deploy token" helper, never a natural-language prompt.

## Contract reference (verified on Basescan)

| Contract | Base mainnet (8453) | Base Sepolia (84532) |
|---|---|---|
| Standard factory (75/15/10) | `0x826a2b79aBD77269fc861a36B88979daabe80C8B` | `0x73a167592D33882270C94f6eecDAA10941a5fa43` |
| Paired factory (80/20, dual-mode) | `0x55ee7660b1253bFdeCAfD4f79cA8f9A4addB7979` | `0x0a98D57699915598018E0CAe5A00F8850ec38966` |
| Fee locker (claim here) | `0xC04bdF721FA5CEc839819864FA86F3D48B89Fcee` | per-suite (see SDK books) |
| Staking (the 15% sink) | `0x38cE743b88c54eD1aF84816Ff596E518d16DFF95` | per-suite |
| WETH | `0x4200000000000000000000000000000000000006` | same |

The SDK exports the full books as `B20_LAUNCHPAD_CONTRACTS` /
`B20_LAUNCHPAD_PAIRED_CONTRACTS` — never hardcode if you can import.

## Errors you might hit

| Error | Cause | Fix |
|---|---|---|
| `paired price` throw at build time | The paired token has no resolvable WETH price | Pass `pairedToken.priceWeth` explicitly, or pick a token the price API knows |
| Dev buy + paired throw | `devBuyEth` set on a paired launch | Remove the dev buy (not supported on paired) |
| Supply out of bounds revert | `supply` outside [1, 1e18] whole tokens | Fix the value |
| `Cc0InvalidProtocolSplit` | Hand-rolled lockerConfig | Use the SDK — it builds the enforced layout |
| Paired launch throws "not available" | Paired suite not deployed on that chain | Launch on Base mainnet (8453) |

## Related skills

- [`../SKILL.md`](../SKILL.md) — the ERC-20 launchpad (multi-chain), Path B sender
  snippets (CDP / Bankr), fee-claim details, all launch options
- [`../../staking/SKILL.md`](../../staking/SKILL.md) — stake $cc0company, earn the
  15% slice every standard B20 launch feeds
- [`../../sdk/SKILL.md`](../../sdk/SKILL.md) — `@cc0company/sdk` method reference

## License

CC0.
