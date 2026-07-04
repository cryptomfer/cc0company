---
name: cc0company-nft-ipfs-limited-erc1155
version: 3.0.0
description: Launch a capped ERC1155 edition on the IPFS rail — CC0Drop1155 deployed with EditionInit.maxSupply N (shrink-only, exempt from open-edition finality) plus an optional per-wallet merkle allowlist. This leaf gives the exact capped deploy call, the add-edition-to-live-1155 flow, and the limited-specific manage + mint; merkle algorithm in allowlist.md, shared mechanics in the rail router.
homepage: https://cc0.company
api_base: https://cc0.company/api
---

# CC0Drop1155 — Limited Edition

A capped ERC1155 edition: CC0Drop1155 with `EditionInit.maxSupply: N`.
One tokenId with at most N copies, usually gated by a per-wallet merkle
allowlist. Unlike the open 1155, a **capped** edition is **exempt from
the finality rule** — the cap protects holders, so the owner keeps
managing it after the window ends.

> **Read first — shared IPFS mechanics** (pin, artifacts, record, owner
> lifecycle, allowlist **persistence** step, add-edition-to-live-1155):
> the rail router [`../../SKILL.md`](../../SKILL.md).
> **Auth / ETH payment / chains / `social_links`:** the
> [root router](../../../SKILL.md).
> **Canonical merkle recipe:** [`../../../allowlist.md`](../../../allowlist.md).
> **SDK:** [`@cc0company/sdk` `Cc0Drops`](../../../../sdk/SKILL.md).

## The deploy call (limited-specific)

Pin metadata (single file for one edition, or the `editions: […]` folder
if you'll add more — rail router Step 2). Build the root from
[`../../../allowlist.md`](../../../allowlist.md). Deploy with
`EditionInit.maxSupply: N`:

```js
const hash = await walletClient.deployContract({
  abi: contracts.erc1155.abi,
  bytecode: contracts.erc1155.bytecode,
  args: [
    "GM Capped", "GMCAP",
    baseURI, contractURI,
    "0x0000000000000000000000000000000000000000",   // ETH
    {                              // EditionInit
      tokenId: 1,
      maxSupply: 250n,             // ← FIXED CAP on this edition (shrink-only after mint)
      publicPhase:    { enabled: true, price: parseEther("0.01"),  start: 1783300000n, end: 0n, maxPerWallet: 3 },
      allowlistPhase: { enabled: true, price: parseEther("0.005"), start: 1783200000n, end: 1783300000n,
                        maxPerWallet: 2, maxSupplyForPhase: 50 },
      merkleRoot,                  // ← from allowlist.md (bytes32(0) if none)
    },
    [{ recipient: myWallet, percentage: 10000 }],   // your 95%
    myWallet, 500,                 // royalty recipient + bps
    platformFeeRecipient,          // ← from artifacts endpoint
    myWallet,                      // owner
  ],
})
```

Limited-edition specifics:
- **`EditionInit.maxSupply: N`** caps this tokenId. Post-mint,
  `setMaxSupply(tokenId, newMax)` can **shrink, never raise**.
- **Exempt from open-edition finality** — because the cap protects
  holders, `setPublicPhase` / `setAllowlistPhase` / `setMerkleRoot` /
  `ownerMint` / `setMaxSupply` keep working after the window ends.
- **`maxSupplyForPhase`** caps the allowlist window's slice of the supply.
- No allowlist? `allowlistPhase.enabled: false`, `merkleRoot: bytes32(0)`.

Record with `token_standard: "ERC1155"`, `token_id_1155: 1`,
`max_supply: "250"`, `drop_contract: "cc0drop"` (rail router Step 4).

## Allowlist — after deploy

1. Build the root: [`../../../allowlist.md`](../../../allowlist.md).
2. Rotate with `setMerkleRoot(tokenId, root)` (1155 takes `tokenId`
   first).
3. **Persist the public preimage** (MANDATORY) —
   `POST /api/store/nft-minting/seadrop/allowlist` (`kind: "cc0drop"`).
   The drop page builds buyer proofs ONLY from it. Body: rail router
   [Allowlists](../../SKILL.md#allowlists).
4. Buyers call `mintAllowlist(tokenId, qty, maxQty, proof)`.

## Add a new edition to this live 1155

To add a second capped edition later, use the four-step re-pin +
`createEdition` flow (never `createEdition` alone — the folder must
contain the new id's file):

1. Read every live edition's `uri(id)` JSON.
2. Re-pin the FULL folder including the new id (`editions: […]`, files
   `"1".."N"`) → new `baseURI: "ipfs://<folder>/"`.
3. `setBaseURI("ipfs://<newFolder>/")` (sig 1, EIP-4906).
4. `createEdition({ tokenId, maxSupply, publicPhase, allowlistPhase,
   merkleRoot })` (sig 2, fail-closed).

Full version: rail router
[Add an edition to a live 1155](../../SKILL.md#add-an-edition-to-a-live-1155).
The drop page probes `editionExists(id)` — no DB update needed.

## Manage + mint (limited-specific)

- **Shrink the cap:** `setMaxSupply(tokenId, newMax)` — only downward, and
  only after mints exist; never raises.
- **Adjust phases:** `setPublicPhase(tokenId, phase)` /
  `setAllowlistPhase(tokenId, phase)` — allowed anytime (no finality).
- **Airdrop:** `ownerMint(tokenId, qty, to)` — counts toward the cap.
  ⚠️ to a CONTRACT, `to` must implement `IERC1155Receiver`.
- **Mint (anyone):** `mint(tokenId, qty)` or
  `mintAllowlist(tokenId, qty, maxQty, proof)`, payable. Reverts at cap.
  95/5 split in-tx.

## Related

- Rail mechanics (pin/deploy/record/manage, add-edition, allowlist
  persistence): [`../../SKILL.md`](../../SKILL.md)
- Limited-edition policy: [`../SKILL.md`](../SKILL.md)
- Canonical merkle recipe + holder snapshots: [`../../../allowlist.md`](../../../allowlist.md)
- Root router (auth/payment/chains/social_links): [`../../../SKILL.md`](../../../SKILL.md)
- SDK `Cc0Drops`: [`../../../../sdk/SKILL.md`](../../../../sdk/SKILL.md)
- Uncapped counterpart (finality applies): [`../../open-edition/erc1155/SKILL.md`](../../open-edition/erc1155/SKILL.md)
