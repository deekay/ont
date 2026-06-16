import {
  legacyTxidOf,
  merkleRootFromProof,
  merkleRootHexFromHeaderHex,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";
import { decodeEvent, EventType } from "@ont/wire";
import type { ConfirmedBatchAnchor, GateFeeTxWitnessParts } from "@ont/claim-path";

// B4-INDEX-ANCHOR (B4_ADAPTERS_PLAN §9.4) — the inclusion firewall: bind a candidate RootAnchor tx to
// the canonical chain and mint the chain-bound ConfirmedBatchAnchor + the fee-tx parts the audited B3
// gate-fee predicate consumes. ONE structured tx is used for BOTH inclusion (legacyTxidOf) and fees
// (feeTxParts.anchorTx is that SAME object) — so the included/decoded tx and the fee tx can never
// diverge (no facts-from-A / fee-from-B). The anchoredRoot / batchSize come ONLY from the decoded
// RootAnchor OP_RETURN — never a caller side-channel field. A forged / withheld / non-canonical /
// wrong-payload anchor mints NO fact (recompute-don't-trust), so a B3 predicate cannot falsely accept.
//
// Trusted: `headerSource` (validated by B4-HEADER). Untrusted: everything else (the tx, prevouts,
// header bytes, height, merkle path, position). Total + fail-closed; never throws.

export type ConfirmedBatchAnchorRejectReason =
  | "anchor-malformed" // not a tx / no single decodable RootAnchor OP_RETURN / wrong-type / bad payload
  | "anchor-noncanonical-header" // headerSource has no/other header at minedHeight (null/throw caught)
  | "anchor-not-included"; // merkle recompute != the block header's committed root

export interface BuildConfirmedBatchAnchorInput {
  /** UNTRUSTED — the structured anchor tx (the SAME tx used for inclusion and fees). */
  readonly anchorTx: LegacyTransaction;
  /** UNTRUSTED — each input's prevout tx, in input order (for the fee-tx parts). */
  readonly prevoutTxs: readonly LegacyTransaction[];
  /** UNTRUSTED — the block's 80-byte header (display hex). */
  readonly blockHeaderHex: string;
  /** UNTRUSTED — the claimed mined height. */
  readonly minedHeight: number;
  /** UNTRUSTED — the Merkle sibling path (display hex, esplora order). */
  readonly merkle: readonly string[];
  /** UNTRUSTED — the tx index within the block (Merkle path direction). */
  readonly pos: number;
  /** TRUSTED — the canonical header source validated by B4-HEADER. */
  readonly headerSource: BitcoinHeaderSource;
  /** Optional explicit OP_RETURN output index; absent → the exactly-one-decodable-RootAnchor rule. */
  readonly anchorVout?: number;
}

export type ConfirmedBatchAnchorResult =
  | {
      readonly ok: true;
      readonly confirmedAnchor: ConfirmedBatchAnchor;
      readonly feeTxParts: GateFeeTxWitnessParts;
    }
  | { readonly ok: false; readonly reason: ConfirmedBatchAnchorRejectReason };

/**
 * GREEN contract (B4-INDEX-ANCHOR):
 *   0. height    minedHeight must be a non-negative integer — else "anchor-noncanonical-header" WITHOUT
 *                consulting the header source (a malformed height must never reach the lookup or be minted).
 *   1. txid      = legacyTxidOf(anchorTx); null → "anchor-malformed".
 *   2. payload   if anchorVout given: it must be an integer in [0, outputs.length) — else "anchor-malformed";
 *                decode ONLY that output (no fallback to other outputs). Else scan anchorTx.outputs for
 *                OP_RETURN data that decodeEvent → RootAnchor; EXACTLY ONE decodable RootAnchor (0 or >1 →
 *                "anchor-malformed", no silent first-match). wrong-type / non-anchor / malformed payload
 *                (decodeEvent throws, caught) → "anchor-malformed". anchoredRoot/batchSize from the DECODE only.
 *   3. canonical hdr = headerSource.headerHexAtHeight(minedHeight) (null/throw caught);
 *                hdr !== blockHeaderHex → "anchor-noncanonical-header".
 *   4. inclusion merkleRootFromProof(txid, merkle, pos) bytes === merkleRootHexFromHeaderHex(blockHeaderHex)
 *                → else "anchor-not-included" (a null recompute — malformed pos / sibling — is not included).
 *   5. mint      confirmedAnchor { anchorTxid: txid, minedHeight, anchoredRoot: decoded.newRoot,
 *                batchSize: decoded.batchSize }; feeTxParts { anchorTx, prevoutTxs } (SAME anchorTx object).
 *
 * Total + fail-closed; never throws.
 */
export function buildConfirmedBatchAnchor(
  input: BuildConfirmedBatchAnchorInput,
): ConfirmedBatchAnchorResult {
  try {
    if (input === null || typeof input !== "object") return reject("anchor-malformed");
    const { anchorTx, prevoutTxs, blockHeaderHex, minedHeight, merkle, pos, headerSource, anchorVout } = input;

    // 0. height — a malformed height must never reach the header source or be minted.
    if (!Number.isInteger(minedHeight) || minedHeight < 0) return reject("anchor-noncanonical-header");

    // 1. txid — binds inclusion AND fees to the SAME tx.
    const anchorTxid = legacyTxidOf(anchorTx);
    if (anchorTxid === null) return reject("anchor-malformed");

    // 2. payload — the decoded RootAnchor (no caller side-channel). anchorVout is no-fallback.
    const decoded = selectRootAnchor(anchorTx, anchorVout);
    if (decoded === null) return reject("anchor-malformed");

    // 3. canonical — the block header must be the source's header at minedHeight (null/throw → reject).
    let canonical: string | null;
    try {
      canonical = headerSource.headerHexAtHeight(minedHeight);
    } catch {
      return reject("anchor-noncanonical-header");
    }
    if (
      typeof blockHeaderHex !== "string" ||
      canonical === null ||
      canonical.toLowerCase() !== blockHeaderHex.toLowerCase()
    ) {
      return reject("anchor-noncanonical-header");
    }

    // 4. inclusion — recompute the Merkle root and match the header's committed root (bytes 36..68).
    const computed = merkleRootFromProof(anchorTxid, Array.isArray(merkle) ? merkle : [], pos);
    const headerRoot = merkleRootHexFromHeaderHex(blockHeaderHex);
    if (computed === null || headerRoot === null || bytesToHex(computed) !== headerRoot) {
      return reject("anchor-not-included");
    }

    // 5. mint — chain-bound fact + fee parts (the SAME anchorTx object).
    return {
      ok: true,
      confirmedAnchor: { anchorTxid, minedHeight, anchoredRoot: decoded.newRoot, batchSize: decoded.batchSize },
      feeTxParts: { anchorTx, prevoutTxs },
    };
  } catch {
    return reject("anchor-malformed");
  }
}

function reject(reason: ConfirmedBatchAnchorRejectReason): ConfirmedBatchAnchorResult {
  return { ok: false, reason };
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function hexToBytesOrNull(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * The data bytes of a script that is EXACTLY `OP_RETURN <push> <data>` and NOTHING ELSE — or null. The
 * script must be consumed exactly (CL green-watch): a single direct push (0x01..0x4b) or OP_PUSHDATA1
 * (0x4c len), with `data` ending the script (no trailing bytes, not a loose "first push wins" parse).
 */
function opReturnData(scriptPubKeyHex: unknown): Uint8Array | null {
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
    return null; // OP_0 / OP_PUSHDATA2/4 / opcodes are not a single data push we accept
  }
  if (dataStart + len !== script.length) return null; // must consume the script EXACTLY
  return script.slice(dataStart, dataStart + len);
}

interface DecodedRootAnchor {
  readonly newRoot: string;
  readonly batchSize: number;
}

/** Decode the candidate output's OP_RETURN as a RootAnchor, or null. decodeEvent throws → caught. */
function decodeRootAnchorAt(tx: LegacyTransaction, vout: number): DecodedRootAnchor | null {
  const output = tx.outputs[vout];
  if (output === undefined) return null;
  const data = opReturnData(output.scriptPubKeyHex);
  if (data === null) return null;
  let event: ReturnType<typeof decodeEvent>;
  try {
    event = decodeEvent(data);
  } catch {
    return null;
  }
  if (event.type !== EventType.RootAnchor) return null;
  return { newRoot: event.newRoot, batchSize: event.batchSize };
}

/**
 * Select the RootAnchor to mint from. With an explicit `anchorVout` it must be an integer in
 * [0, outputs.length) decoding to a RootAnchor — NO fallback to other outputs. Otherwise EXACTLY ONE
 * output must decode to a RootAnchor (0 or >1 → null, no silent first-match).
 */
function selectRootAnchor(tx: LegacyTransaction, anchorVout: number | undefined): DecodedRootAnchor | null {
  if (tx === null || typeof tx !== "object" || !Array.isArray(tx.outputs)) return null;
  if (anchorVout !== undefined) {
    if (!Number.isInteger(anchorVout) || anchorVout < 0 || anchorVout >= tx.outputs.length) return null;
    return decodeRootAnchorAt(tx, anchorVout);
  }
  let found: DecodedRootAnchor | null = null;
  for (let i = 0; i < tx.outputs.length; i += 1) {
    const candidate = decodeRootAnchorAt(tx, i);
    if (candidate === null) continue;
    if (found !== null) return null; // more than one decodable RootAnchor → ambiguous, no first-match
    found = candidate;
  }
  return found;
}
