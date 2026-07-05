---
name: cc0company-nft-ipfs-limited-cc0drop
version: 3.0.0
description: Launch a fixed-supply ERC721 drop on the IPFS rail — CC0Drop deployed with maxSupply N (hard cap, no setter) plus an optional per-wallet merkle allowlist baked into the constructor. This leaf gives the exact fixed-cap + allowlist deploy call and the limited-specific manage + mint; the merkle algorithm lives in allowlist.md and shared mechanics in the rail router.
homepage: https://cc0.company
api_base: https://cc0.company/api
---

# CC0Drop (ERC721) — Limited Edition

A fixed-supply ERC721: CC0Drop with `maxSupply: N` (hard cap on unique
tokenIds, **immutable** — no setter), usually gated by a per-wallet
merkle allowlist. Art + metadata on IPFS, one self-signed deploy tx.

> **Read first — shared IPFS mechanics** (pin art, pin metadata, get
> artifacts, record, owner lifecycle, allowlist **persistence** step,
> numbered metadata): the rail router [`../../SKILL.md`](../../SKILL.md).
> **Auth / ETH payment / chains / `social_links`:** the
> [root router](../../../SKILL.md).
> **Canonical merkle recipe** (leaf format, tree, single-entry case,
> builders, holder snapshots): [`../../../allowlist.md`](../../../allowlist.md).
> **SDK:** [`@cc0company/sdk` `Cc0Drops`](../../../../sdk/SKILL.md).

## The deploy call (limited-specific)

### ★ Do this — ONE SDK call (any signer, incl. Bankr/CDP)

`@cc0company/sdk` ≥ 1.7.0 pins art + metadata, deploys, and records in one method.
**Prefer this always** — do NOT hand-roll pin/encode or a wallet `deployContract`
helper (it breaks on a `sender`).

```js
import { Cc0Drops } from "@cc0company/sdk"
await new Cc0Drops({ sender }).launchDrop721({   // or { walletClient } / { account }
  name: "GM 500", symbol: "GM500",
  image: pngBytes,               // bytes | Blob | dataURL | https — pinned for you
  maxSupply: 500,                // FIXED CAP (no setter)
  publicPhase: { priceEth: "0.01", maxPerWallet: 3 },
  allowlist: { priceEth: "0.005", maxPerWallet: 2, maxSupplyForPhase: 100,
    entries: [{ address: "0x…", quantity: 1 }] },   // optional; SDK builds the merkle root
})  // → deploys via the CC0 factory (raw calldata) + records → live on cc0.company
```

Done. The raw `deployContract` below is a low-level fallback (walletClient-only).

<details><summary>Low-level raw-ABI path (walletClient native CREATE only)</summary>

Fetch artifacts, pin metadata (single file for a 1-artwork edition, or a
`editions: […]` folder for an N-piece set — rail router Step 2). Build
the allowlist root from [`../../../allowlist.md`](../../../allowlist.md).
Then deploy with a **fixed `maxSupply`** and both phases wired:

```js
const hash = await walletClient.deployContract({
  abi: contracts.erc721.abi,
  bytecode: contracts.erc721.bytecode,
  args: [
    "GM 500", "GM500",
    baseURI, contractURI,
    500n,                          // maxSupply = 500  ← FIXED CAP (no setter, immutable)
    "0x0000000000000000000000000000000000000000",   // ETH
    { enabled: true,  price: parseEther("0.01"),  start: 1783300000n, end: 0n, maxPerWallet: 3 },  // public
    { enabled: true,  price: parseEther("0.005"), start: 1783200000n, end: 1783300000n,            // allowlist window
      maxPerWallet: 2, maxSupplyForPhase: 100 },
    merkleRoot,                    // ← from allowlist.md (bytes32(0) if no allowlist)
    [{ recipient: myWallet, percentage: 10000 }],   // your 95%
    myWallet, 500,                 // royalty recipient + bps
    platformFeeRecipient,          // ← from artifacts endpoint
    myWallet,                      // owner
  ],
})
```

`deployContract` is a native CREATE — only a viem walletClient/account can send
it. A `sender` (Bankr/CDP) must deploy through the factory (the SDK / one-shot).
</details>

Limited-edition specifics:
- **`maxSupply: N`** is the hard cap on unique tokenIds. There is **no
  setter** — it's fixed at deploy forever. (`ownerMint` / airdrops count
  toward it — reserve headroom.)
- **`maxSupplyForPhase`** on the allowlist phase caps how much of the
  supply the allowlist window may consume (early access before public).
- No allowlist? Pass `allowlistPhase.enabled: false` and
  `initialMerkleRoot = bytes32(0)`.
- Phases fail-closed; `start/end 0` = unbounded on that side.

Record with `max_supply: "500"`, `drop_contract: "cc0drop"` (rail router
Step 4).

## Allowlist — after deploy

1. Build the root: [`../../../allowlist.md`](../../../allowlist.md)
   (leaf = `keccak256(abi.encodePacked(address, uint256 maxQuantity))`;
   the per-wallet cap is bound into the leaf).
2. Rotate later if needed with `setMerkleRoot(root)`.
3. **Persist the public preimage** (MANDATORY) —
   `POST /api/store/nft-minting/seadrop/allowlist` with
   `{ contract_address, seadrop_allowlist: { kind: "cc0drop", merkleRoot,
   phase, entries } }`. The drop page builds buyer proofs ONLY from this
   preimage; skip it and site buyers can't mint. Body detail: rail router
   [Allowlists](../../SKILL.md#allowlists).
4. Buyers call `mintAllowlist(qty, maxQty, proof)` — `maxQty` must equal
   the cap the wallet was added with, or it reverts `InvalidProof`.

Holder-snapshot allowlists (every holder of any collection, cross-chain)
are in [`../../../allowlist.md`](../../../allowlist.md); the mandatory
cc0drop closing step is the same `seadrop/allowlist` re-persist above.

## Numbered "#N" (optional)

A capped drop can number its tokens without pre-rendering N IPFS files:
enable numbered dynamic metadata (rail router
[Numbered editions](../../SKILL.md#numbered-editions--dynamic-metadata-cc0drop-erc721))
and a 500-piece drop serves "#1"–"#500" from one shared image + attribute
set.

## Manage + mint (limited-specific)

- **Adjust the public phase:** `setPublicPhase(phase)`. The cap itself is
  fixed — you can never raise `maxSupply`.
- **Airdrop:** `ownerMint(qty, to)` — counts toward the cap.
- **Mint (anyone):** public `mint(qty)` or allowlist
  `mintAllowlist(qty, maxQty, proof)`, payable. Reverts once the cap is
  reached. 95/5 split in-tx.

## Related

- Rail mechanics (pin/deploy/record/manage, allowlist persistence):
  [`../../SKILL.md`](../../SKILL.md)
- Limited-edition policy: [`../SKILL.md`](../SKILL.md)
- Canonical merkle recipe + holder snapshots: [`../../../allowlist.md`](../../../allowlist.md)
- Root router (auth/payment/chains/social_links): [`../../../SKILL.md`](../../../SKILL.md)
- SDK `Cc0Drops`: [`../../../../sdk/SKILL.md`](../../../../sdk/SKILL.md)
- Uncapped counterpart: [`../../open-edition/cc0drop/SKILL.md`](../../open-edition/cc0drop/SKILL.md)
