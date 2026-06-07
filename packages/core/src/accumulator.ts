import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  normalizeName,
  sha256Bytes,
  utf8ToBytes
} from "@ont/protocol";

/**
 * Production name accumulator (signet-prototype C1).
 *
 * A binary sparse Merkle tree over 256-bit keys (`H(name)`), the productionised form of the tree in
 * `delta-merge-sim.ts`. Two differences make it real rather than illustrative:
 *
 *   1. **Compact build.** Single-leaf subtrees are collapsed (the leaf's hash is folded up through
 *      default siblings) instead of materialising all 256 levels, so building and proving stay
 *      O(occupied nodes) — fast enough to measure proof sizes at realistic populations.
 *   2. **Serialized proofs.** Membership and non-membership proofs have a byte wire format, so we can
 *      measure the actual on-wire proof size (R11 / T3) rather than estimating it.
 *
 * Hashing matches `delta-merge-sim` exactly (domain-separated SHA-256), so roots are identical for
 * the same leaf set — the test cross-checks this against the reference tree.
 */

export const ACCUMULATOR_DEPTH = 256;

const EMPTY_NODE = new Uint8Array(32);
const LEAF_DOMAIN = Uint8Array.from([0x00]);
const INTERNAL_DOMAIN = Uint8Array.from([0x01]);

function hashLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(LEAF_DOMAIN, key, value));
}

function hashInternal(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(INTERNAL_DOMAIN, left, right));
}

const DEFAULTS = buildDefaults();

function buildDefaults(): readonly Uint8Array[] {
  const defaults: Uint8Array[] = new Array(ACCUMULATOR_DEPTH + 1);
  defaults[ACCUMULATOR_DEPTH] = EMPTY_NODE;
  for (let level = ACCUMULATOR_DEPTH - 1; level >= 0; level -= 1) {
    const child = defaults[level + 1] ?? EMPTY_NODE;
    defaults[level] = hashInternal(child, child);
  }
  return defaults;
}

function keyBit(key: Uint8Array, index: number): 0 | 1 {
  const byte = key[index >> 3] ?? 0;
  return ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
}

/** `H(name)` — the fixed 256-bit leaf key a name occupies. */
export function accumulatorKeyForName(name: string): string {
  return bytesToHex(sha256Bytes(utf8ToBytes(normalizeName(name))));
}

/** The canonical root of an empty accumulator (genesis tip for the anchored root chain). */
export function emptyAccumulatorRoot(): string {
  return bytesToHex(DEFAULTS[0] ?? EMPTY_NODE);
}

export interface AccumulatorProof {
  readonly keyHex: string;
  /** Hex value for a membership proof, or `null` for a non-membership proof. */
  readonly value: string | null;
  /** Non-default siblings only, each tagged with the child level it sits at. */
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}

interface LeafEntry {
  readonly keyHex: string;
  readonly key: Uint8Array;
  readonly value: Uint8Array;
}

/** Fold a lone leaf up from depth 256 to `level`, pairing with default siblings. */
function singleLeafRoot(level: number, leaf: LeafEntry): Uint8Array {
  let digest = hashLeaf(leaf.key, leaf.value);
  for (let childLevel = ACCUMULATOR_DEPTH; childLevel > level; childLevel -= 1) {
    const parentLevel = childLevel - 1;
    const sibling = DEFAULTS[childLevel] ?? EMPTY_NODE;
    digest = keyBit(leaf.key, parentLevel) === 0
      ? hashInternal(digest, sibling)
      : hashInternal(sibling, digest);
  }
  return digest;
}

export class Accumulator {
  private readonly leaves = new Map<string, string>();
  private sorted: LeafEntry[] | null = null;
  private cache: Map<string, Uint8Array> | null = null;
  private cachedRoot: Uint8Array | null = null;

  public insert(keyHex: string, valueHex: string): void {
    const key = hexToBytes(keyHex);
    if (key.length !== 32) {
      throw new Error("accumulator key must be 32 bytes");
    }
    hexToBytes(valueHex); // validate
    this.leaves.set(keyHex.toLowerCase(), valueHex.toLowerCase());
    this.markDirty();
  }

  public has(keyHex: string): boolean {
    return this.leaves.has(keyHex.toLowerCase());
  }

  public size(): number {
    return this.leaves.size;
  }

  public root(): string {
    this.rebuildIfDirty();
    return bytesToHex(this.cachedRoot ?? (DEFAULTS[0] ?? EMPTY_NODE));
  }

  public proveMembership(keyHex: string): AccumulatorProof {
    const normalized = keyHex.toLowerCase();
    if (!this.leaves.has(normalized)) {
      throw new Error("proveMembership: key is not present");
    }
    return this.prove(normalized);
  }

  public proveNonMembership(keyHex: string): AccumulatorProof {
    const normalized = keyHex.toLowerCase();
    if (this.leaves.has(normalized)) {
      throw new Error("proveNonMembership: key is present");
    }
    return this.prove(normalized);
  }

  private markDirty(): void {
    this.sorted = null;
    this.cache = null;
    this.cachedRoot = null;
  }

  private rebuildIfDirty(): void {
    if (this.cache !== null) {
      return;
    }
    const sorted: LeafEntry[] = [...this.leaves.entries()]
      .map(([keyHex, valueHex]) => ({ keyHex, key: hexToBytes(keyHex), value: hexToBytes(valueHex) }))
      .sort((a, b) => a.keyHex.localeCompare(b.keyHex));
    this.sorted = sorted;
    this.cache = new Map();
    this.cachedRoot = this.build(0, 0, sorted.length, "");
  }

  /** Recursively compute the subtree root over sorted leaves [lo, hi), caching non-empty nodes. */
  private build(level: number, lo: number, hi: number, prefix: string): Uint8Array {
    const cache = this.cache as Map<string, Uint8Array>;
    const sorted = this.sorted as LeafEntry[];
    if (hi - lo === 0) {
      return DEFAULTS[level] ?? EMPTY_NODE;
    }
    if (hi - lo === 1) {
      const node = singleLeafRoot(level, sorted[lo] as LeafEntry);
      cache.set(prefix, node);
      return node;
    }
    const mid = this.firstIndexWithBit1(lo, hi, level);
    const left = this.build(level + 1, lo, mid, `${prefix}0`);
    const right = this.build(level + 1, mid, hi, `${prefix}1`);
    const node = hashInternal(left, right);
    cache.set(prefix, node);
    return node;
  }

  /** First index in sorted [lo, hi) whose key has bit `level` set (the 0|1 split point). */
  private firstIndexWithBit1(lo: number, hi: number, level: number): number {
    const sorted = this.sorted as LeafEntry[];
    let low = lo;
    let high = hi;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (keyBit((sorted[mid] as LeafEntry).key, level) === 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  private prove(keyHex: string): AccumulatorProof {
    this.rebuildIfDirty();
    const cache = this.cache as Map<string, Uint8Array>;
    const sorted = this.sorted as LeafEntry[];
    const key = hexToBytes(keyHex);

    const siblings: { readonly level: number; readonly hash: string }[] = [];
    let lo = 0;
    let hi = sorted.length;
    let level = 0;
    let prefix = "";

    while (level < ACCUMULATOR_DEPTH) {
      if (hi - lo === 0) {
        break; // empty subtree below — remaining siblings are all default
      }
      if (hi - lo === 1) {
        const only = sorted[lo] as LeafEntry;
        if (only.keyHex === keyHex) {
          break; // the key is alone here — remaining siblings are all default
        }
        // A single *other* leaf shares the key's path. The key (absent) diverges from it at the
        // first differing bit `d`; the only non-default sibling is that leaf's subtree at d+1.
        // (Computed directly because the lone leaf is cached at a shallower prefix than `d`.)
        let d = level;
        while (d < ACCUMULATOR_DEPTH && keyBit(key, d) === keyBit(only.key, d)) {
          d += 1;
        }
        if (d < ACCUMULATOR_DEPTH) {
          siblings.push({ level: d + 1, hash: bytesToHex(singleLeafRoot(d + 1, only)) });
        }
        break;
      }
      const mid = this.firstIndexWithBit1(lo, hi, level);
      const bit = keyBit(key, level);
      const sameLo = bit === 0 ? lo : mid;
      const sameHi = bit === 0 ? mid : hi;
      const otherEmpty = bit === 0 ? mid === hi : lo === mid;
      if (!otherEmpty) {
        const otherPrefix = `${prefix}${bit === 0 ? "1" : "0"}`;
        const sibling = cache.get(otherPrefix) ?? DEFAULTS[level + 1] ?? EMPTY_NODE;
        siblings.push({ level: level + 1, hash: bytesToHex(sibling) });
      }
      lo = sameLo;
      hi = sameHi;
      prefix = `${prefix}${bit === 0 ? "0" : "1"}`;
      level += 1;
    }

    const value = this.leaves.get(keyHex) ?? null;
    return { keyHex, value, siblings };
  }
}

/** Verify a membership or non-membership proof against a root hex. */
export function verifyAccumulatorProof(rootHex: string, proof: AccumulatorProof): boolean {
  const key = hexToBytes(proof.keyHex);
  const siblingByLevel = new Map<number, Uint8Array>();
  for (const sibling of proof.siblings) {
    siblingByLevel.set(sibling.level, hexToBytes(sibling.hash));
  }

  let digest = proof.value === null ? EMPTY_NODE : hashLeaf(key, hexToBytes(proof.value));
  for (let childLevel = ACCUMULATOR_DEPTH; childLevel >= 1; childLevel -= 1) {
    const parentLevel = childLevel - 1;
    const sibling = siblingByLevel.get(childLevel) ?? DEFAULTS[childLevel] ?? EMPTY_NODE;
    digest = keyBit(key, parentLevel) === 0
      ? hashInternal(digest, sibling)
      : hashInternal(sibling, digest);
  }

  return bytesToHex(digest) === rootHex.toLowerCase();
}

function uint16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}

/**
 * Compact wire format:
 * `key(32) | valueFlag(1) | value(32 if member) | sibCount(2) | [ level(2) | hash(32) ] * sibCount`
 */
export function serializeAccumulatorProof(proof: AccumulatorProof): Uint8Array {
  const parts: Uint8Array[] = [hexToBytes(proof.keyHex)];
  if (proof.value === null) {
    parts.push(Uint8Array.of(0));
  } else {
    parts.push(Uint8Array.of(1), hexToBytes(proof.value));
  }
  parts.push(uint16(proof.siblings.length));
  for (const sibling of proof.siblings) {
    parts.push(uint16(sibling.level), hexToBytes(sibling.hash));
  }
  return concatBytes(...parts);
}

export function deserializeAccumulatorProof(bytes: Uint8Array): AccumulatorProof {
  let offset = 0;
  const take = (n: number): Uint8Array => {
    const slice = bytes.subarray(offset, offset + n);
    offset += n;
    return slice;
  };
  const keyHex = bytesToHex(take(32));
  const valueFlag = (take(1)[0] ?? 0) === 1;
  const value = valueFlag ? bytesToHex(take(32)) : null;
  const countBytes = take(2);
  const count = ((countBytes[0] ?? 0) << 8) | (countBytes[1] ?? 0);
  const siblings: { readonly level: number; readonly hash: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const levelBytes = take(2);
    const level = ((levelBytes[0] ?? 0) << 8) | (levelBytes[1] ?? 0);
    siblings.push({ level, hash: bytesToHex(take(32)) });
  }
  return { keyHex, value, siblings };
}

export function accumulatorProofSizeBytes(proof: AccumulatorProof): number {
  return serializeAccumulatorProof(proof).length;
}
