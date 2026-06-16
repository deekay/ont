import {
  legacyTxidOf,
  merkleRootFromProof,
  merkleRootHexFromHeaderHex,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";

// Shared inclusion firewall (B4_ADAPTERS_PLAN §9.11 call 1) — the generic chain-binding reused by
// B4-INDEX-ANCHOR + B4-INDEX-INVOKE. DECODER-SPECIFIC payload selection (RootAnchor 0x0b vs RecoverOwner
// 0x09) stays in each adapter (CL); this module owns only the exact OP_RETURN data extraction + the
// height / txid / header-canonicality / merkle-inclusion bind, with GENERIC reasons each adapter maps to
// its prefixed reason. Total + fail-closed; never throws.

const HEX = /^[0-9a-fA-F]*$/;

function hexToBytesOrNull(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !HEX.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/**
 * The data bytes of a script that is EXACTLY `OP_RETURN <push> <data>` and NOTHING ELSE — or null. The
 * script must be consumed exactly: a single direct push (0x01..0x4b) or OP_PUSHDATA1 (0x4c len, ≤255 — the
 * 171-byte RecoverOwner carrier, §9.11 call 2), with `data` ending the script (no trailing bytes, not a
 * loose "first push wins" parse; OP_0 / OP_PUSHDATA2/4 / opcode forms rejected).
 */
export function opReturnData(scriptPubKeyHex: unknown): Uint8Array | null {
  const script = hexToBytesOrNull(scriptPubKeyHex);
  if (script === null || script.length < 2 || script[0] !== 0x6a) return null;
  const op = script[1]!;
  let dataStart: number;
  let len: number;
  if (op >= 0x01 && op <= 0x4b) {
    len = op;
    dataStart = 2;
  } else if (op === 0x4c) {
    if (script.length < 3) return null;
    len = script[2]!;
    dataStart = 3;
  } else {
    return null;
  }
  if (dataStart + len !== script.length) return null; // must consume the script EXACTLY
  return script.slice(dataStart, dataStart + len);
}

export type InclusionRejectReason = "tx-malformed" | "noncanonical-header" | "not-included";

export interface BindTxInclusionInput {
  readonly tx: LegacyTransaction;
  readonly blockHeaderHex: string;
  readonly minedHeight: number;
  readonly merkle: readonly string[];
  readonly pos: number;
  readonly headerSource: BitcoinHeaderSource;
}

export type BindTxInclusionResult =
  | { readonly ok: true; readonly txid: string }
  | { readonly ok: false; readonly reason: InclusionRejectReason };

/**
 * Bind a structured tx to the canonical chain: a malformed `minedHeight` rejects WITHOUT consulting the
 * header source; `legacyTxidOf` null → `tx-malformed`; the block header must be the source's header at
 * `minedHeight` (null/throw/mismatch → `noncanonical-header`); the Merkle recompute must match the header's
 * committed root (else `not-included`). Returns the proven `txid`. Total + fail-closed; never throws.
 */
export function bindTxInclusion(input: BindTxInclusionInput): BindTxInclusionResult {
  try {
    const { tx, blockHeaderHex, minedHeight, merkle, pos, headerSource } = input;
    if (!Number.isInteger(minedHeight) || minedHeight < 0) return { ok: false, reason: "noncanonical-header" };
    const txid = legacyTxidOf(tx);
    if (txid === null) return { ok: false, reason: "tx-malformed" };
    let canonical: string | null;
    try {
      canonical = headerSource.headerHexAtHeight(minedHeight);
    } catch {
      return { ok: false, reason: "noncanonical-header" };
    }
    if (
      typeof blockHeaderHex !== "string" ||
      canonical === null ||
      canonical.toLowerCase() !== blockHeaderHex.toLowerCase()
    ) {
      return { ok: false, reason: "noncanonical-header" };
    }
    const computed = merkleRootFromProof(txid, Array.isArray(merkle) ? merkle : [], pos);
    const headerRoot = merkleRootHexFromHeaderHex(blockHeaderHex);
    if (computed === null || headerRoot === null || bytesToHex(computed) !== headerRoot) {
      return { ok: false, reason: "not-included" };
    }
    return { ok: true, txid };
  } catch {
    return { ok: false, reason: "tx-malformed" };
  }
}
