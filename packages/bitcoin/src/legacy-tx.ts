// Pure Bitcoin LEGACY transaction serialization + txid recompute (no host crypto, no I/O).
// Used by the audited kernel's gate-fee predicate (D-GF): the fee witness carries the complete
// anchor tx + each input's prevout tx, and the kernel binds them by recomputing each txid. The
// LEGACY (non-witness) serialization is exactly what the txid is the double-SHA256 of — correct
// for segwit txs too (the txid never covers witness data). Total / fail-closed: a malformed tx
// returns null (the caller fails closed), never throws.
import { sha256 } from "@noble/hashes/sha2";

/** One input of a legacy tx. `prevoutTxid` is 32-byte DISPLAY hex (reversed into wire order here). */
export interface LegacyTransactionInput {
  readonly prevoutTxid: string;
  readonly prevoutVout: number;
  readonly scriptSigHex: string;
  readonly sequence: number;
}

/** One output of a legacy tx. */
export interface LegacyTransactionOutput {
  readonly valueSats: bigint;
  readonly scriptPubKeyHex: string;
}

/** A complete legacy (non-witness) transaction whose `legacyTxidOf` is the on-chain txid. */
export interface LegacyTransaction {
  readonly version: number;
  readonly inputs: readonly LegacyTransactionInput[];
  readonly outputs: readonly LegacyTransactionOutput[];
  readonly locktime: number;
}

const U32_MAX = 0xffff_ffff;
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_EVEN = /^[0-9a-f]*$/;

const isU32 = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= U32_MAX;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !HEX_EVEN.test(hex)) {
    return null;
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

const u32LE = (n: number): Uint8Array =>
  Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);

function u64LE(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Bitcoin CompactSize (varint) encoding of a non-negative count/length. */
function compactSize(n: number): Uint8Array {
  if (n < 0xfd) return Uint8Array.of(n);
  if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, (n >>> 8) & 0xff);
  if (n <= U32_MAX) return Uint8Array.of(0xfe, ...u32LE(n));
  return Uint8Array.of(0xff, ...u64LE(BigInt(n)));
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const dsha256 = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes));
const reversed = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes).reverse();

/**
 * Serialize a legacy transaction to its exact consensus byte form (the form the txid hashes).
 * Returns null on any malformed field (bad hex, out-of-range version/vout/sequence/locktime, a
 * value not in `[0, 2^64)`), so the caller can fail closed.
 */
export function serializeLegacyTransaction(tx: LegacyTransaction): Uint8Array | null {
  const t = tx as unknown;
  if (!isObject(t) || !Array.isArray(t.inputs) || !Array.isArray(t.outputs)) return null;
  if (!isU32(t.version) || !isU32(t.locktime)) return null;

  const parts: Uint8Array[] = [u32LE(t.version), compactSize(t.inputs.length)];
  for (const input of t.inputs) {
    if (!isObject(input) || typeof input.prevoutTxid !== "string" || !HEX_64.test(input.prevoutTxid)) return null;
    if (!isU32(input.prevoutVout) || !isU32(input.sequence)) return null;
    if (typeof input.scriptSigHex !== "string") return null;
    const txidBytes = hexToBytes(input.prevoutTxid);
    const scriptSig = hexToBytes(input.scriptSigHex);
    if (txidBytes === null || scriptSig === null) return null;
    parts.push(
      reversed(txidBytes), // display -> internal/wire order
      u32LE(input.prevoutVout),
      compactSize(scriptSig.length),
      scriptSig,
      u32LE(input.sequence),
    );
  }
  parts.push(compactSize(t.outputs.length));
  for (const output of t.outputs) {
    if (!isObject(output) || typeof output.valueSats !== "bigint") return null;
    if (output.valueSats < 0n || output.valueSats > U64_MAX) return null;
    if (typeof output.scriptPubKeyHex !== "string") return null;
    const scriptPubKey = hexToBytes(output.scriptPubKeyHex);
    if (scriptPubKey === null) return null;
    parts.push(u64LE(output.valueSats), compactSize(scriptPubKey.length), scriptPubKey);
  }
  parts.push(u32LE(t.locktime));
  return concat(parts);
}

/**
 * The transaction id (display/big-endian hex) of a legacy transaction:
 * `reverse(doubleSHA256(serialize(tx)))`. Returns null if the tx is malformed.
 */
export function legacyTxidOf(tx: LegacyTransaction): string | null {
  const serialized = serializeLegacyTransaction(tx);
  if (serialized === null) return null;
  return bytesToHex(reversed(dsha256(serialized)));
}
