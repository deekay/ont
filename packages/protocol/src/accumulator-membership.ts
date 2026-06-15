// Sparse-Merkle accumulator primitives — the leaf/internal hashing, default
// node chain, and membership-proof recompute that decide cheap-rail ownership.
//
// These live in @ont/protocol so there is exactly ONE implementation of the
// fold that turns (leaf, value, siblings) into a root: the accumulator BUILDER
// (@ont/core) and the frozen-core proof-bundle VERIFIER (@ont/consensus) both
// import it. Duplicating this computation would let an offline verifier and the
// live indexer disagree about who owns a name — the one divergence the audited
// core exists to prevent. @ont/protocol is the lowest shared layer (it already
// holds sha256/concat), so both packages reach it without a dependency cycle.
//
// Hashing is domain-separated SHA-256 and matches the reference tree in
// @ont/core's delta-merge-sim (cross-checked by the accumulator tests).
import { bytesToHex, hexToBytes } from "./bytes.js";
import { concatBytes, sha256Bytes } from "./crypto.js";

export const ACCUMULATOR_DEPTH = 256;

export const ACCUMULATOR_EMPTY_NODE = new Uint8Array(32);

const LEAF_DOMAIN = Uint8Array.from([0x00]);
const INTERNAL_DOMAIN = Uint8Array.from([0x01]);

export function hashAccumulatorLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(LEAF_DOMAIN, key, value));
}

export function hashAccumulatorInternal(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(INTERNAL_DOMAIN, left, right));
}

/** Default node hash at each level of a fully-empty subtree (index 0 = root). */
export const ACCUMULATOR_DEFAULTS: readonly Uint8Array[] = buildDefaults();

function buildDefaults(): readonly Uint8Array[] {
  const defaults: Uint8Array[] = new Array(ACCUMULATOR_DEPTH + 1);
  defaults[ACCUMULATOR_DEPTH] = ACCUMULATOR_EMPTY_NODE;
  for (let level = ACCUMULATOR_DEPTH - 1; level >= 0; level -= 1) {
    const child = defaults[level + 1] ?? ACCUMULATOR_EMPTY_NODE;
    defaults[level] = hashAccumulatorInternal(child, child);
  }
  return defaults;
}

/** Bit `index` of a 256-bit key, MSB-first (bit 0 is the high bit of byte 0). */
export function accumulatorKeyBit(key: Uint8Array, index: number): 0 | 1 {
  const byte = key[index >> 3] ?? 0;
  return ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
}

export interface AccumulatorMembershipProof {
  readonly keyHex: string;
  /** Hex value for a membership proof, or `null` for a non-membership proof. */
  readonly value: string | null;
  /** Non-default siblings only, each tagged with the child level it sits at. */
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}

/**
 * Recompute the root from `(keyHex, value, siblings)` and check it equals
 * `rootHex`. This is the soundness check: a structurally well-formed proof whose
 * siblings/value don't actually fold to the claimed root returns `false`.
 */
export function verifyAccumulatorMembership(rootHex: string, proof: AccumulatorMembershipProof): boolean {
  // Total / fail-closed: a malformed proof (non-hex or odd-length key, value, or
  // sibling hash; bad root) returns `false`, NEVER throws. The B3 hostile-evidence
  // contract relies on this — a forged witness must produce the no-witness reject
  // effect, not crash the verifier (see docs/core/B3_EVIDENCE_HARDENING.md E-ND1).
  try {
    const key = hexToBytes(proof.keyHex);
    if (key.length !== 32) {
      return false;
    }
    // Canonical root: exactly 32 bytes of hex (case-insensitive).
    if (!/^[0-9a-f]{64}$/.test(rootHex.toLowerCase())) {
      return false;
    }
    // Canonical sibling set: each sits at a real child level [1, DEPTH], levels
    // are unique, and each hash is 32 bytes. Non-canonical metadata is rejected,
    // not silently ignored — a level-0/257 or duplicate-level sibling would
    // otherwise be dropped/overwritten by the level-keyed fold, letting a forged
    // proof smuggle siblings the verifier never reads.
    const siblingByLevel = new Map<number, Uint8Array>();
    for (const sibling of proof.siblings) {
      if (!Number.isInteger(sibling.level) || sibling.level < 1 || sibling.level > ACCUMULATOR_DEPTH) {
        return false;
      }
      if (siblingByLevel.has(sibling.level)) {
        return false;
      }
      const hash = hexToBytes(sibling.hash);
      if (hash.length !== 32) {
        return false;
      }
      siblingByLevel.set(sibling.level, hash);
    }

    let digest = proof.value === null
      ? ACCUMULATOR_EMPTY_NODE
      : hashAccumulatorLeaf(key, hexToBytes(proof.value));
    for (let childLevel = ACCUMULATOR_DEPTH; childLevel >= 1; childLevel -= 1) {
      const parentLevel = childLevel - 1;
      const sibling = siblingByLevel.get(childLevel) ?? ACCUMULATOR_DEFAULTS[childLevel] ?? ACCUMULATOR_EMPTY_NODE;
      digest = accumulatorKeyBit(key, parentLevel) === 0
        ? hashAccumulatorInternal(digest, sibling)
        : hashAccumulatorInternal(sibling, digest);
    }

    return bytesToHex(digest) === rootHex.toLowerCase();
  } catch {
    return false;
  }
}
