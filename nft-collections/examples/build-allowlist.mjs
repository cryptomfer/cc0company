/**
 * CC0Drop allowlist builder — leaves bind (wallet, maxQuantity) so every
 * wallet gets its OWN mint cap. OZ sorted-pair tree; single entry ⇒
 * root = leaf and proof = [].
 *
 *   node build-allowlist.mjs
 */
import { keccak256, encodePacked, getAddress } from "viem"

export function leafOf(address, maxQuantity) {
  return keccak256(
    encodePacked(["address", "uint256"], [getAddress(address), BigInt(maxQuantity)]),
  )
}

function pair(a, b) {
  return a.toLowerCase() < b.toLowerCase()
    ? keccak256(encodePacked(["bytes32", "bytes32"], [a, b]))
    : keccak256(encodePacked(["bytes32", "bytes32"], [b, a]))
}

/** entries: [{ address, quantity }] → merkle root (bytes32) */
export function computeRoot(entries) {
  if (entries.length === 0) return "0x" + "0".repeat(64)
  let layer = entries.map((e) => leafOf(e.address, e.quantity))
  while (layer.length > 1) {
    const next = []
    for (let i = 0; i < layer.length; i += 2) {
      next.push(pair(layer[i], layer[i + 1] ?? layer[i])) // odd: duplicate last
    }
    layer = next
  }
  return layer[0]
}

/** Proof for one wallet (needed for mintAllowlist). */
export function proofFor(entries, address) {
  const target = leafOf(
    address,
    entries.find((e) => e.address.toLowerCase() === address.toLowerCase())?.quantity ?? 1,
  )
  let layer = entries.map((e) => leafOf(e.address, e.quantity))
  let idx = layer.findIndex((l) => l === target)
  if (idx === -1) return null
  const proof = []
  while (layer.length > 1) {
    const sibling = idx % 2 === 0 ? layer[idx + 1] ?? layer[idx] : layer[idx - 1]
    proof.push(sibling)
    const next = []
    for (let i = 0; i < layer.length; i += 2) {
      next.push(pair(layer[i], layer[i + 1] ?? layer[i]))
    }
    idx = Math.floor(idx / 2)
    layer = next
  }
  return proof
}

// Demo
const entries = [
  { address: "0x92d1345E14EEf6555b7F5bB864dbC6bF5BbC682b", quantity: 10 },
  { address: "0x151A3443EC023dB682419c9e2d8004C75C6584c0", quantity: 1 },
]
console.log("root :", computeRoot(entries))
console.log("proof:", proofFor(entries, entries[0].address))
