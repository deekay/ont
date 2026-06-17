import {
  legacyTxidOf,
  merkleRootFromProof,
  merkleRootHexFromHeaderHex,
  opReturnData,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";

export { opReturnData };

// Shared inclusion firewall (B4_ADAPTERS_PLAN §9.11 call 1) — the generic chain-binding reused by
// B4-INDEX-ANCHOR + B4-INDEX-INVOKE. DECODER-SPECIFIC payload selection (RootAnchor 0x0b vs RecoverOwner
// 0x09) stays in each adapter (CL); this module owns only the exact OP_RETURN data extraction + the
// height / txid / header-canonicality / merkle-inclusion bind, with GENERIC reasons each adapter maps to
// its prefixed reason. Total + fail-closed; never throws.

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// opReturnData was promoted to @ont/bitcoin (single-source OP_RETURN byte extraction, go-live G1 3b-2.5)
// and is re-exported above so intra-package callers (confirmed-batch-anchor / confirmed-recover-invoke)
// keep importing it from ./inclusion.js. RootAnchor/RecoverOwner decode semantics stay in each adapter.

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
