---
name: cc0company-staking
version: 1.0.0
description: Stake $cc0company and earn a pro-rata share of 15% of ALL cc0.company trading fees, paid in WETH — real yield from every launch and swap across Base, Ethereum, and Robinhood Chain, no emissions. Covers stake / claim / unstake / exit via @cc0company/sdk (viem, private key, CDP, or Bankr sender), the 48h unbond cooldown, the contract addresses, and reading a live position.
homepage: https://cc0.company
api_base: https://cc0.company/api
sdk: "@cc0company/sdk"
chain: base (8453)
staking_pool: 0x38cE743b88c54eD1aF84816Ff596E518d16DFF95
cc0company_token: 0x67c5F00491c09cbCF6359f95690574E6106bb3CF
---

# cc0.company Staking — Skill for AI Agents

Stake **$cc0company** into the platform staking pool and earn a pro-rata cut of
**15% of every trade** across the whole platform — every launch, every swap, on
Base, Ethereum, and Robinhood Chain — streamed as **WETH**. Real yield from
fees, not token emissions or inflation.

Trustless + non-custodial: every action is a transaction the agent's **own
wallet** signs; no admin can move, freeze, or reassign a stake. Staking lives on
**Base**.

## Where the rewards come from

Every launchpad token's LP fee is split **75% creator / 15% stakers / 10%
treasury**, enforced on-chain by the factory (see
[`../launch-token/SKILL.md`](../launch-token/SKILL.md)). The 15% staker slice is
routed to this pool as WETH and pooled per staked token (Synthetix-style
`rewardPerToken` accumulator), claimable at any time.

APR is variable — it tracks platform trading volume ÷ total staked, so never
present the live rate as fixed or guaranteed.

## Stake / claim / unstake — @cc0company/sdk

```bash
npm install @cc0company/sdk viem
```

```typescript
import { Cc0Staking } from '@cc0company/sdk';
import { parseEther } from 'viem';

const staking = new Cc0Staking({ account });      // a viem account or walletClient
await staking.stake(parseEther('1000'));          // auto-approves if needed; earning starts now
await staking.claimRewards();                     // accrued WETH → your wallet (no cooldown)
const pos = await staking.getPosition(me);         // { staked, earned, unbonding, unlockAt, totalStaked }
await staking.requestUnstake(parseEther('500'));   // moves to unbonding; starts the 48h cooldown
// … wait 48h …
await staking.withdraw();                          // principal back to your wallet
await staking.exit();                              // claim all + unstake all in one tx (still wait cooldown → withdraw)
await staking.cancelUnstake();                     // abort unbonding, re-stake the balance
```

**Cooldown:** `requestUnstake` starts a **48-hour** (`172800s`) unbond;
requesting again **resets the clock for the whole unbonding balance**, so unstake
the full amount you want in one go. `withdraw()` reverts with
`CooldownNotElapsed` before the unlock. Your WETH stays claimable throughout.

> **RPC / rate limits.** `getPosition` reads several on-chain values — the public
> Base node throttles bursts, so give your SDK client **your own RPC** (Alchemy /
> Infura) rather than a public endpoint. And you **never need a position read to
> stake, claim, or unstake** — the writes stand alone; reads are only for display.

## Any wallet infra (CDP / Bankr / Safe / relayers)

Can't hand the SDK a viem account? Give it a universal `sender` instead —
`{ address, send(tx) → txHash }` — and **every** staking method works through it,
exactly like the launchpad. Full CDP + Bankr `sender` snippets and their
per-provider gotchas are in [`../launch-token/SKILL.md`](../launch-token/SKILL.md)
(Path B); the SDK method reference is in [`../sdk/SKILL.md`](../sdk/SKILL.md).

No SDK at all? A raw-calldata reference (cast / Bankr / CDP, function selectors,
revert reasons) is served at
[`cc0.company/skills/cc0-staking`](https://cc0.company/skills/cc0-staking/SKILL.md).

## Contracts (Base mainnet, chainId 8453)

Stake on **Base**. The 15% slice from launches on the other chains still reaches
the Base pool, so you stake **once** and earn from launches on all three.

| Role | Address |
|------|---------|
| Staking pool | `0x38cE743b88c54eD1aF84816Ff596E518d16DFF95` |
| $cc0company (staking token, 18 dec) | `0x67c5F00491c09cbCF6359f95690574E6106bb3CF` |
| WETH (reward token, 18 dec) | `0x4200000000000000000000000000000000000006` |

Cross-chain routing of the 15%: on Ethereum via the `Cc0EthStakingForwarder`
(WETH → OP bridge → Base), on Robinhood Chain via the `Cc0StakingEscrow` (Relay
bridge). **Fee *claiming* for your own launches** happens on the chain you
launched on — that's `Cc0Fees`, in the launch-token skill.

## Amounts & gas

$cc0company and WETH are both **18-decimal**. All txs are on Base (cheap gas in
ETH) — keep a little ETH in the wallet for gas; rewards arrive as **WETH**, not
native ETH.

## Related skills

- [`../launch-token/SKILL.md`](../launch-token/SKILL.md) — launch a token (the source of the 15% staker fees)
- [`../sdk/SKILL.md`](../sdk/SKILL.md) — `@cc0company/sdk` method reference (`Cc0Staking`, signers)
- [`../agentic-marketplace/SKILL.md`](../agentic-marketplace/SKILL.md) — pay-per-call x402 services

## License

CC0.
