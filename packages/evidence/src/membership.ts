// D-AM — accumulator membership-proof construction (B3, FREE; conforms to the
// ratified accumulator membership rule). The VERIFIER lives in @ont/protocol
// (verifyAccumulatorMembership) and is shared with the kernel; B3 owns the
// BUILDER — producing a proof that folds to the committed root — so an offline
// verifier and the live indexer can never disagree about who owns a name.
//
// Non-deciding: this constructs witnesses only. It works at the key/value byte
// level — it never chooses name normalization or leaf identity (that is the
// caller's / kernel's job), so no ownership decision is smuggled here.
import {
  ACCUMULATOR_DEFAULTS,
  ACCUMULATOR_DEPTH,
  accumulatorKeyBit,
  bytesToHex,
  hashAccumulatorInternal,
  hashAccumulatorLeaf,
  hexToBytes,
  type AccumulatorMembershipProof,
} from "@ont/protocol";

export interface BuiltMembershipProof {
  /** The accumulator root the proof folds to. */
  readonly rootHex: string;
  /** The membership (value set) / non-membership (value null) proof. */
  readonly proof: AccumulatorMembershipProof;
}

const HEX_32 = /^[0-9a-f]{64}$/;

/** Lowercase + require exactly 32 bytes of hex, else throw (builder misuse). */
function normHex32(hex: string, label: string): string {
  const lower = hex.toLowerCase();
  if (!HEX_32.test(lower)) {
    throw new Error(`@ont/evidence: ${label} must be 32-byte hex, got ${JSON.stringify(hex)}`);
  }
  return lower;
}

function defaultAt(level: number): Uint8Array {
  return ACCUMULATOR_DEFAULTS[level] ?? new Uint8Array(32);
}

interface Leaf {
  readonly keyHex: string;
  readonly key: Uint8Array;
  readonly value: Uint8Array;
}

/** Normalize the committed set; reject malformed/duplicate keys (builder misuse). */
function toLeaves(leaves: ReadonlyMap<string, string>): Leaf[] {
  const out: Leaf[] = [];
  const seen = new Set<string>();
  for (const [keyHex, valueHex] of leaves) {
    const k = normHex32(keyHex, "leaf key");
    const v = normHex32(valueHex, "leaf value");
    if (seen.has(k)) {
      throw new Error(`@ont/evidence: duplicate leaf key ${k}`);
    }
    seen.add(k);
    out.push({ keyHex: k, key: hexToBytes(k), value: hexToBytes(v) });
  }
  return out;
}

/** Root of the sparse subtree rooted at `level` over `leaves` (all sharing the
 * first `level` bits). Empty subtree folds to the level default. */
function subtreeRoot(level: number, leaves: readonly Leaf[]): Uint8Array {
  if (leaves.length === 0) {
    return defaultAt(level);
  }
  if (level === ACCUMULATOR_DEPTH) {
    const only = leaves[0]!;
    return hashAccumulatorLeaf(only.key, only.value);
  }
  const left: Leaf[] = [];
  const right: Leaf[] = [];
  for (const leaf of leaves) {
    (accumulatorKeyBit(leaf.key, level) === 0 ? left : right).push(leaf);
  }
  return hashAccumulatorInternal(subtreeRoot(level + 1, left), subtreeRoot(level + 1, right));
}

function sharesPrefix(a: Uint8Array, b: Uint8Array, bits: number): boolean {
  for (let i = 0; i < bits; i += 1) {
    if (accumulatorKeyBit(a, i) !== accumulatorKeyBit(b, i)) {
      return false;
    }
  }
  return true;
}

/** The non-default sibling path along `targetKey` over the committed `leaves`. */
function siblingPath(
  leaves: readonly Leaf[],
  targetKey: Uint8Array,
): { readonly level: number; readonly hash: string }[] {
  const siblings: { level: number; hash: string }[] = [];
  for (let parentLevel = 0; parentLevel < ACCUMULATOR_DEPTH; parentLevel += 1) {
    const childLevel = parentLevel + 1;
    const targetBit = accumulatorKeyBit(targetKey, parentLevel);
    const siblingLeaves = leaves.filter(
      (leaf) =>
        sharesPrefix(leaf.key, targetKey, parentLevel) &&
        accumulatorKeyBit(leaf.key, parentLevel) !== targetBit,
    );
    const siblingHash = subtreeRoot(childLevel, siblingLeaves);
    if (bytesToHex(siblingHash) !== bytesToHex(defaultAt(childLevel))) {
      siblings.push({ level: childLevel, hash: bytesToHex(siblingHash) });
    }
  }
  return siblings;
}

/**
 * The accumulator root committing EXACTLY `leaves` (the canonical from-empty
 * fold). Used by D-SB to recompute a served leaf set's root and compare it to the
 * anchor's committed root — the completeness check (not mere member inclusion).
 */
export function accumulatorRootOf(leaves: ReadonlyMap<string, string>): string {
  return bytesToHex(subtreeRoot(0, toLeaves(leaves)));
}

/**
 * Build a MEMBERSHIP proof for `targetKeyHex` over the committed `leaves`
 * (keyHex -> valueHex). The proof verifies against the returned root via
 * @ont/protocol `verifyAccumulatorMembership`. Throws on builder misuse:
 * malformed hex, or a target absent from the committed set.
 */
export function buildMembershipProof(
  leaves: ReadonlyMap<string, string>,
  targetKeyHex: string,
): BuiltMembershipProof {
  const set = toLeaves(leaves);
  const targetKey = normHex32(targetKeyHex, "target key");
  const member = set.find((leaf) => leaf.keyHex === targetKey);
  if (member === undefined) {
    throw new Error(`@ont/evidence.buildMembershipProof: target ${targetKey} is not in the committed set`);
  }
  return {
    rootHex: bytesToHex(subtreeRoot(0, set)),
    proof: { keyHex: targetKey, value: bytesToHex(member.value), siblings: siblingPath(set, member.key) },
  };
}

/**
 * Build a NON-MEMBERSHIP proof (`value === null`) for an absent `targetKeyHex`.
 * It proves the key folds to the empty subtree under the committed root. Throws
 * on builder misuse: malformed hex, or a target that IS in the committed set.
 */
export function buildNonMembershipProof(
  leaves: ReadonlyMap<string, string>,
  targetKeyHex: string,
): BuiltMembershipProof {
  const set = toLeaves(leaves);
  const targetKey = normHex32(targetKeyHex, "target key");
  if (set.some((leaf) => leaf.keyHex === targetKey)) {
    throw new Error(`@ont/evidence.buildNonMembershipProof: target ${targetKey} IS in the committed set`);
  }
  return {
    rootHex: bytesToHex(subtreeRoot(0, set)),
    proof: { keyHex: targetKey, value: null, siblings: siblingPath(set, hexToBytes(targetKey)) },
  };
}
