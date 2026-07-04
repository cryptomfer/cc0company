---
name: cc0company-x402-payments
version: 2.0.0
description: Canonical x402 v2 client reference for cc0.company. Three signing patterns (viem one-liner, Bankr HTTP, CDP SDK) covering every x402-gated endpoint on the platform. This is the ONLY doc in the repo with x402 client code.
homepage: https://cc0.company
api_base: https://cc0.company/api
chain: base
network: eip155:8453
facilitator: https://api.cdp.coinbase.com/platform/v2/x402
---

# x402 Payments on cc0.company — Skill for AI Agents

The x402-gated surface of cc0.company:

- `POST /api/store/agent-services/{slug}/invoke` — every service in the
  [agentic-marketplace catalog](../SKILL.md): the 5 image LoRAs
  (`sartoshi-gen`, `darkfarms-gen`, `hokusai-gen`, `van-gogh-gen`,
  `monet-gen`), the data services (`cc0-daily-brief`, `cc0pedia`,
  `cc0pedia-search`, `cc0pedia-verify`, `cc0pedia-market`), and the
  re-brokered mfergpt services (`mfergpt-lore`, `mfergpt-ask`,
  `mfergpt-mferfy`). Prices per slug: [`../SKILL.md`](../SKILL.md).
- `POST /api/store/agent-assets/{slug}/buy` — buy a listed CC0 asset from the
  x402 asset marketplace (price set per asset; response returns a signed
  `download_token`).

All use **x402 v2** USDC on Base mainnet. The flow is identical everywhere:
call without payment → receive a 402 challenge → sign an EIP-3009 USDC
`transferWithAuthorization` for the requested amount → retry with the signed
payload in `PAYMENT-SIGNATURE`. The legacy `X-PAYMENT` header is still
accepted for compatibility, but new integrations should use
`PAYMENT-SIGNATURE`.

> **Not x402:** the NFT collection endpoints (`/api/store/agents/me/collections/*`)
> are paid in **ETH** — agent-signed gas transactions plus HTTP-402-style plain
> ETH transfers verified via tx hash. See
> [`../../nft-collections/SKILL.md`](../../nft-collections/SKILL.md).

## Network + asset constants

```
Network:           Base mainnet (chainId 8453, CAIP-2 eip155:8453)
USDC contract:     0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
EIP-712 domain:    { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: <USDC contract> }
Facilitator:       https://api.cdp.coinbase.com/platform/v2/x402 (Coinbase CDP)
```

The `payTo` address and `maxAmountRequired` value come from the **live 402
response** — never hard-code them.

## Pattern A — `@x402/fetch` + viem (recommended, one-liner)

Works for **any wallet where you can produce a viem-compatible signer**:
throwaway hot keys (`generatePrivateKey()`), exported private keys from CDP /
Base MCP, browser-extension wallets via WalletConnect, etc.

```bash
npm install @x402/fetch @x402/evm viem
```

```typescript
import { x402Client, wrapFetchWithPayment } from "@x402/fetch"
import { registerExactEvmScheme } from "@x402/evm/exact/client"
import { privateKeyToAccount } from "viem/accounts"

const signer = privateKeyToAccount(YOUR_PRIVATE_KEY as `0x${string}`)
const client = new x402Client()
registerExactEvmScheme(client, { signer })
const fetchWithPayment = wrapFetchWithPayment(fetch, client)

// Any fetch through this wrapper auto-handles 402 challenges:
const res = await fetchWithPayment(
  "https://cc0.company/api/store/agent-services/sartoshi-gen/invoke",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agent-Name": "your_handle" },
    body: JSON.stringify({ prompt: "..." }),
  }
)
const job = await res.json()
```

The wrapper catches the 402, signs `transferWithAuthorization` with your viem
signer, attaches `PAYMENT-SIGNATURE`, and retries — zero manual typed-data
work.

## Pattern B — Bankr (HTTP-only, no Node needed)

For agents running in environments where you can't import npm packages but you
can `curl`. Bankr exposes a typed-data signing endpoint at `/wallet/sign` (the
older `/agent/sign` is deprecated and returns HTML — make sure you hit the new
path).

```bash
# 1. Get the 402 challenge — read paymentRequired from the response body
CHALLENGE=$(curl -s -X POST https://cc0.company/api/store/agent-services/sartoshi-gen/invoke \
  -H "Content-Type: application/json" \
  -d '{"prompt": "..."}')

PAY_TO=$(echo "$CHALLENGE" | jq -r '.paymentRequired.payTo')
AMOUNT=$(echo "$CHALLENGE" | jq -r '.paymentRequired.maxAmountRequired')
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
NONCE="0x$(openssl rand -hex 32)"
VALID_BEFORE=$(( $(date +%s) + 600 ))
FROM=$(bankr prompt "What is my wallet address on Base?" | jq -r '.address')

# 2. Ask Bankr to sign the EIP-712 typed data
SIG=$(curl -s -X POST https://api.bankr.bot/wallet/sign \
  -H "X-API-Key: $BANKR_KEY" \
  -H "Content-Type: application/json" \
  -d @- <<JSON | jq -r '.signature'
{
  "signatureType": "eth_signTypedData_v4",
  "typedData": {
    "types": {
      "TransferWithAuthorization": [
        {"name": "from",         "type": "address"},
        {"name": "to",           "type": "address"},
        {"name": "value",        "type": "uint256"},
        {"name": "validAfter",   "type": "uint256"},
        {"name": "validBefore",  "type": "uint256"},
        {"name": "nonce",        "type": "bytes32"}
      ]
    },
    "primaryType": "TransferWithAuthorization",
    "domain": {
      "name": "USD Coin", "version": "2", "chainId": 8453,
      "verifyingContract": "$USDC"
    },
    "message": {
      "from": "$FROM", "to": "$PAY_TO", "value": "$AMOUNT",
      "validAfter": "0", "validBefore": "$VALID_BEFORE", "nonce": "$NONCE"
    }
  }
}
JSON
)

# 3. CRITICAL: send x402v2 envelope. The accepted field MUST contain
# the FULL paymentRequirements object from the 402 verbatim — the
# server matches it with deepEqual. The v1 path is broken in
# @x402/core v2.12 (matcher reads paymentPayload.accepted.scheme but
# v1 schema doesn't have an `accepted` field) — use v2 always.
ACCEPTED=$(echo "$CHALLENGE" | jq -c '.accepts[0] // .paymentRequired')

PAYLOAD=$(jq -nc \
  --arg sig "$SIG" --arg from "$FROM" --arg to "$PAY_TO" --arg val "$AMOUNT" \
  --arg vb "$VALID_BEFORE" --arg n "$NONCE" --argjson acc "$ACCEPTED" \
  '{
    x402Version: 2,
    accepted: $acc,
    payload: {
      signature: $sig,
      authorization: { from: $from, to: $to, value: $val, validAfter: "0", validBefore: $vb, nonce: $n }
    }
  }' | base64 -w0)

# 4. Retry with PAYMENT-SIGNATURE
curl -X POST https://cc0.company/api/store/agent-services/sartoshi-gen/invoke \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: $PAYLOAD" \
  -d '{"prompt": "..."}'
```

### Bankr API key gotchas

Three separate flags can each cause a `403 Forbidden` on `/wallet/sign` or
`/agent/submit`:

1. **"Disable arbitrary contract calls"** toggle (default ON for new
   accounts). Blocks raw deploys / mints / custom contract calls. Fix:
   [bankr.bot/security](https://bankr.bot/security) → flip OFF.
2. **`readOnly: true`** on the API key. Blocks every write endpoint. Fix:
   edit the key, flip OFF.
3. **`allowedRecipients` restriction.** Blocks any raw submission since Bankr
   can't verify recipients from calldata. Fix: clear it.

If you can't or won't change these, use Pattern A (CDP / viem) — no Bankr-side
config to manage.

## Pattern C — CDP SDK / Coinbase Agentic Wallet

The CDP SDK's `cdp.evm.getOrCreateAccount(...)` returns an account that
already implements viem's `LocalAccount` interface — including
`signTypedData`. **No wrapping needed.** Plug it straight into Pattern A's
`registerExactEvmScheme({ signer })`. Keys stay in Coinbase's Nitro Enclave
the whole time.

```typescript
import { CdpClient } from "@coinbase/cdp-sdk"
import { x402Client, wrapFetchWithPayment } from "@x402/fetch"
import { registerExactEvmScheme } from "@x402/evm/exact/client"

const cdp = new CdpClient({
  apiKeyId: process.env.CDP_API_KEY_ID,
  apiKeySecret: process.env.CDP_API_KEY_SECRET,
})

// This account exposes signTypedData natively — pass directly.
const signer = await cdp.evm.getOrCreateAccount({ name: "my-agent" })

const client = new x402Client()
registerExactEvmScheme(client, { signer })
const fetchWithPayment = wrapFetchWithPayment(fetch, client)

// Use exactly like Pattern A.
```

> **CDP gotcha:** don't call `wallet.sign()` — that's raw-bytes
> signing only. The account from `getOrCreateAccount()` is a viem
> `LocalAccount`; pass it as `signer`. If you genuinely need manual
> typed-data signing, call `account.signTypedData({ domain, types,
> primaryType, message })` directly.
>
> If your `@coinbase/cdp-sdk` is older than v1.40, upgrade:
> `npm i @coinbase/cdp-sdk@latest`.

## What cc0.company actually needs from your wallet

1. A Base EVM address (`0x...`).
2. The ability to sign EIP-3009 `transferWithAuthorization` for x402 payments.
3. (Only for NFT collection deploys) the ability to send arbitrary
   transactions (`sendTransaction`) — see
   [`../../nft-collections/SKILL.md`](../../nft-collections/SKILL.md).

If your wallet does all three, you can use every cc0.company endpoint.

## Discovery + errors

Catalog discovery (Coinbase Bazaar, agentic.market, ERC-8257 manifests) and
the full error matrix (402/400/404/425/5xx + auto-cancel semantics) live once
in the marketplace router: [`../SKILL.md`](../SKILL.md).

## Related skills

- [`../SKILL.md`](../SKILL.md) — the marketplace catalog, pricing, discovery,
  error matrix, agent registration
- [`../image-generation/SKILL.md`](../image-generation/SKILL.md) — the 5
  image-gen models paying via this protocol
- [`../../nft-collections/SKILL.md`](../../nft-collections/SKILL.md) — ETH
  not USDC, but the agent flow (quote → pay → retry with tx_hash) has the
  same shape

## License

CC0.
