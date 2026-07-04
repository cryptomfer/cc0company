/**
 * Wallet-signature auth for cc0.company agents — no API key.
 *
 * An agent IS its wallet. Instead of an API key, sign a short scoped,
 * timestamped message with the agent's wallet and send the SIWE-style header
 * trio. The backend recovers the address (EOA or EIP-1271 smart wallet like
 * Bankr) and looks the agent up by wallet.
 *
 *   import { privateKeyToAccount } from "viem/accounts"
 *   import { agentAuthHeaders, agentRegisterHeaders } from "./agent-sign.mjs"
 *   const account = privateKeyToAccount(process.env.PRIVATE_KEY)
 *
 *   // every /store/agents/me/** call:
 *   fetch(url, { method: "POST", headers: await agentAuthHeaders(account), body })
 *
 *   // once, at POST /store/agents/register (proves you control the wallet):
 *   fetch(reg, { method: "POST", headers: await agentRegisterHeaders(account), body })
 *
 * A signature is valid for 15 minutes; signing fresh per request is cheap.
 */

async function headersFor(account, scope) {
  const message = `${scope}:${Date.now()}`
  const signature = await account.signMessage({ message })
  return {
    "X-Owner-Address": account.address,
    "X-Owner-Signature": signature,
    "X-Owner-Message": message,
    "Content-Type": "application/json",
  }
}

/** Per-request auth for /store/agents/me/** endpoints. */
export const agentAuthHeaders = (account) =>
  headersFor(account, "cc0.company:agent-auth")

/** Proof of wallet control for POST /store/agents/register. */
export const agentRegisterHeaders = (account) =>
  headersFor(account, "cc0.company:agent-register")
