# Airdrops — batch mint-to for deployed collections

Airdrop tokens from your **deployed** collection (a draft 404s the intent:
`POST` requires `contract_address` to be set — run the deploy flow first) to a
list of `{address, quantity}` recipients. Works for every rail; the endpoints
below are the fully-onchain (SSTORE2) path where the backend tracks the job.
For IPFS CC0Drop contracts you own the contract directly — airdrop =
`ownerMint(qty, to)` / `ownerMint(tokenId, qty, to)` calls from your wallet
(counts toward caps; see [`ipfs/SKILL.md`](ipfs/SKILL.md)) — you can still
record the result here for stats.

Auth: wallet-signature headers on everything under `/agents/me/**` — see
[SKILL.md → Authentication](SKILL.md#authentication-wallet-signature--canonical).
All examples assume `$ADDR` / `$SIG` / `$MSG` from that section's shell recipe.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/store/agents/me/collections/:id/airdrops` | Create an airdrop (requires deployed collection) |
| `GET`  | `/api/store/agents/me/collections/:id/airdrops` | List airdrops (historical + in-flight) |
| `GET`  | `/api/store/agents/me/collections/:id/airdrops/:airdropId` | Read one airdrop (poll status) |
| `PATCH`| `/api/store/agents/me/collections/:id/airdrops/:airdropId` | Update status after an on-chain tx |
| `POST` | `/api/store/nft-holders/recipients` | Holder snapshot → ready-made `recipients` array (open, no auth) |
| `GET`  | `/api/store/nft-holders?contract=0x…&chain=` | Cheap preflight: holder count + preview (open) |
| `POST` | `/api/store/agents/me/collections/:id/allowlist/from-collection` | Same snapshot, but into an **allowlist phase** instead |

## Create an airdrop

```bash
curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COLLECTION_ID/airdrops \
  -H "X-Owner-Address: $ADDR" -H "X-Owner-Signature: $SIG" -H "X-Owner-Message: $MSG" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": [
      { "address": "0x92d1345E14EEf6555b7F5bB864dbC6bF5BbC682b", "quantity": 2 },
      { "address": "0x151A3443EC023dB682419c9e2d8004C75C6584c0", "quantity": 1 }
    ],
    "token_id_1155": "1"
  }'
# → 201 {
#   "success": true,
#   "airdrop": { "id": "airdrop_…", "status": "pending", "total_quantity": 3, … },
#   "total_quantity": 3,
#   "recipients_count": 2
# }
```

Body fields:

| Field | Required | Notes |
|---|---|---|
| `recipients` | yes | `[{ address, quantity, token_id? }]` — `address` must be a 0x address, `quantity ≥ 1`; per-recipient `token_id` overrides for mixed-token 1155 drops |
| `token_id_1155` | 1155 only | which token id to mint (string) |
| `status` | no | omit (→ `"pending"`) for the backend-driven flow; pass `"completed"` + `tx_hash` to record mints you already broadcast yourself |
| `tx_hash` | no | with `status: "completed"` / `"failed"` — the (last) on-chain tx |
| `created_by` | no | free-form attribution |

Validations that will 400 you: empty `recipients`, malformed address,
`quantity < 1`, collection not `active`, and — for `pending`/`processing`
airdrops — `current_supply + total_quantity > max_supply` (the response tells
you how many are still available). Open editions (`max_supply` 0/null) skip
the supply gate. `completed` records skip it too (supply already counted).

## Execution: two modes

**A. Platform-executed (default — you pay nothing for execution).** POST with
no `status`: the job is created `pending` and execution is on the platform —
the **platform uploader wallet signs the `mintTo(token_id, address, qty)` txs**
on your contract (it's the collection's registered uploader; that's the same
wallet that uploaded your artwork chunks). You pay no gas and send no payment
for the airdrop itself. Poll:

```bash
curl -s https://cc0.company/api/store/agents/me/collections/$COLLECTION_ID/airdrops/$AIRDROP_ID \
  -H "X-Owner-Address: $ADDR" -H "X-Owner-Signature: $SIG" -H "X-Owner-Message: $MSG"
# → { "success": true, "airdrop": { "status": "pending|processing|completed|failed",
#      "tx_hash": "0x…", "error_message": null, … } }
```

Status lifecycle: `pending → processing → completed | failed`. On `completed`
the collection's `current_supply` is bumped by `total_quantity`. If a job sits
in `pending` longer than you like, fall through to mode B — you own the
contract and can always mint directly.

**B. Self-executed, record after-the-fact.** You (the collection
creator/owner) sign the `mintTo` / `ownerMint` txs from your own wallet, then
POST with the final result so stats and supply stay correct:

```bash
curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COLLECTION_ID/airdrops \
  -H "X-Owner-Address: $ADDR" -H "X-Owner-Signature: $SIG" -H "X-Owner-Message: $MSG" \
  -H "Content-Type: application/json" \
  -d '{ "recipients": [ { "address": "0x92d1…682b", "quantity": 2 } ],
        "token_id_1155": "1", "status": "completed", "tx_hash": "0xLastMintTx" }'
```

Or POST `pending` first and PATCH as you go
(`{ "status": "processing" | "completed" | "failed", "tx_hash"?, "error_message"? }`
— `completed` triggers the supply bump exactly once).

## Airdrop to all holders of another collection

The snapshot primitive is open (no auth) and **cross-chain**: the source
collection can live on Base or Ethereum regardless of where your drop is —
the output is just addresses. Alchemy-backed, deduped, capped at **25,000
holders** (`truncated: true` when the cap dropped tail addresses), cached 60s.

```bash
# 0. (optional) preflight — how many holders are we talking about?
curl -s "https://cc0.company/api/store/nft-holders?contract=0xSourceCollection&chain=ethereum"
# → { holders_count, total_holders, truncated, holders_preview, max_holders_per_airdrop: 25000 }

# 1. snapshot → recipients array
curl -s -X POST https://cc0.company/api/store/nft-holders/recipients \
  -H "Content-Type: application/json" \
  -d '{
    "collection_address": "0xSourceCollection",
    "chain": "ethereum",
    "quantity_each": 1,
    "exclude": ["0xYourOwnWallet", "0x000000000000000000000000000000000000dEaD"]
  }' > snapshot.json
# → { "success": true, "recipients": [ { "address": "0x…", "quantity": 1 }, … ],
#     "count": 812, "total_holders": 812, "truncated": false, "max_holders": 25000 }

# 2. pipe straight into the airdrop
jq '{ recipients: .recipients, token_id_1155: "1" }' snapshot.json | \
curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COLLECTION_ID/airdrops \
  -H "X-Owner-Address: $ADDR" -H "X-Owner-Signature: $SIG" -H "X-Owner-Message: $MSG" \
  -H "Content-Type: application/json" -d @-
```

Snapshot body: `collection_address` (required), `chain` (`"base"` default |
`"ethereum"`), `quantity_each` (default 1, floored, min 1), `exclude`
(addresses to skip — burn/LP/your own). Errors: 400 malformed address, 502
Alchemy down or zero holders on the requested chain (the message names the
chain it tried — flip the picker).

Watch the supply gate: 812 holders × `quantity_each` must fit in your
remaining supply, or POST airdrops 400s.

## Allowlist the holders instead (mint-window, not push)

Same snapshot, different destination: give holders the *right* to mint during
an allowlist phase rather than pushing tokens at them. One authed call
snapshots + appends entries + regenerates the phase's merkle root:

```bash
curl -s -X POST \
  https://cc0.company/api/store/agents/me/collections/$COLLECTION_ID/allowlist/from-collection \
  -H "X-Owner-Address: $ADDR" -H "X-Owner-Signature: $SIG" -H "X-Owner-Message: $MSG" \
  -H "Content-Type: application/json" \
  -d '{
    "phase_id": "phase_…",
    "source_collection": "0xSourceCollection",
    "source_chain": "ethereum",
    "max_mint_quantity": 2,
    "exclude": ["0xYourOwnWallet"]
  }'
# → { "success": true, "count": 812, "merkle_root": "0x…",
#     "source_collection": "0x…", "source_chain": "ethereum",
#     "total_holders": 812, "truncated": false }
```

Rules: `phase_id` must be an **allowlist** phase belonging to this collection
(404/400 otherwise); entries are **appended** — run it against a fresh phase.
Same 25k cap and cross-chain semantics as the recipients route. The new
`merkle_root` is DB-side; push it on-chain via the phase-activation tx and
find the leaf/proof recipe in
[`limited-edition/SKILL.md`](limited-edition/SKILL.md).

## Gotchas

- **Deployed + active only.** POST requires `contract_address` set (400 with
  "run prepare-deploy → sign → confirm-deploy first") and `status: "active"`.
- **Airdrops count toward supply and per-token caps** — they are mints.
- **1155 `mintTo` to a contract address** requires the receiver to implement
  `IERC1155Receiver`; a snapshot of an old collection will contain contract
  holders (vaults, multisigs) — expect some entries to revert on rails that
  enforce it, and `exclude` known offenders.
- **Recipients are lowercased server-side**; duplicates are not merged — two
  entries for the same wallet mint twice.
- **Idempotency is on you** for mode A: POSTing the same recipients twice
  creates two jobs. Check `GET …/airdrops` before retrying a timed-out create.
