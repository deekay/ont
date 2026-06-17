// Client-side verification for the ONT name accumulator.
//
// Faithful port of @ont/protocol accumulator membership verification and
// name + byte helpers, with
// no @ont/* dependency so it bundles cleanly under Hermes. Hashing is
// domain-separated SHA-256 via @noble/hashes — identical to the engine, so the
// roots/leaves this computes match the publisher and resolver exactly.
//
// The wallet grants the publisher NO authority over a name: the publisher
// returns an inclusion proof, and the client verifies it against the anchored
// root here before trusting any claim receipt.
import { sha256 } from "@noble/hashes/sha2";

const NAME_PATTERN = /^[a-z0-9]{1,32}$/;

export function normalizeName(input: string): string {
  const normalized = input.toLowerCase();
  if (!NAME_PATTERN.test(normalized)) {
    throw new Error("invalid ONT name: must be lowercase alphanumeric, 1-32 characters");
  }
  return normalized;
}

export function isValidName(input: string): boolean {
  try {
    normalizeName(input);
    return true;
  } catch {
    return false;
  }
}

const HEX_PATTERN = /^[0-9a-f]*$/;

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.toLowerCase();
  if (!HEX_PATTERN.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("invalid hex");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return Uint8Array.from(sha256(bytes));
}

// --- Accumulator (sparse Merkle tree, depth 256, domain-separated SHA-256) ---

const ACCUMULATOR_DEPTH = 256;
const EMPTY_NODE = new Uint8Array(32);
const LEAF_DOMAIN = Uint8Array.from([0x00]);
const INTERNAL_DOMAIN = Uint8Array.from([0x01]);

function hashLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(LEAF_DOMAIN, key, value));
}

function hashInternal(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(INTERNAL_DOMAIN, left, right));
}

const DEFAULTS = ((): readonly Uint8Array[] => {
  const defaults: Uint8Array[] = new Array(ACCUMULATOR_DEPTH + 1);
  defaults[ACCUMULATOR_DEPTH] = EMPTY_NODE;
  for (let level = ACCUMULATOR_DEPTH - 1; level >= 0; level -= 1) {
    const child = defaults[level + 1] ?? EMPTY_NODE;
    defaults[level] = hashInternal(child, child);
  }
  return defaults;
})();

function keyBit(key: Uint8Array, index: number): 0 | 1 {
  const byte = key[index >> 3] ?? 0;
  return ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
}

/** `H(name)` — the fixed 256-bit leaf key a name occupies (hex). */
export function accumulatorKeyForName(name: string): string {
  return bytesToHex(sha256Bytes(utf8ToBytes(normalizeName(name))));
}

export interface AccumulatorProof {
  readonly keyHex: string;
  /** Hex value for a membership proof, or null for non-membership. */
  readonly value: string | null;
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
}

/**
 * The accumulator root of a tree that contains exactly one leaf (`keyHex` →
 * `valueHex`) and nothing else. Folds the leaf up through the default
 * empty-subtree hashes — the inverse of `verifyAccumulatorProof` with empty
 * siblings, so a proof `{ keyHex, value: valueHex, siblings: [] }` verifies
 * against the returned root. Used to generate self-consistent demo proofs that
 * the real verifier accepts; the real publisher returns full sibling paths.
 */
export function accumulatorRootForSingleLeaf(keyHex: string, valueHex: string): string {
  const key = hexToBytes(keyHex);
  let digest = hashLeaf(key, hexToBytes(valueHex));
  for (let childLevel = ACCUMULATOR_DEPTH; childLevel >= 1; childLevel -= 1) {
    const parentLevel = childLevel - 1;
    const sibling = DEFAULTS[childLevel] ?? EMPTY_NODE;
    digest = keyBit(key, parentLevel) === 0
      ? hashInternal(digest, sibling)
      : hashInternal(sibling, digest);
  }
  return bytesToHex(digest);
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
