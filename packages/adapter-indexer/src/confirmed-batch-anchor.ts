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
 * STUB (B4-INDEX-ANCHOR, tests-first): returns a fixed reject so the idx-anchor.* red battery fails for
 * the right reason until the adapter is implemented.
 */
export function buildConfirmedBatchAnchor(
  _input: BuildConfirmedBatchAnchorInput,
): ConfirmedBatchAnchorResult {
  void legacyTxidOf;
  void merkleRootFromProof;
  void merkleRootHexFromHeaderHex;
  void decodeEvent;
  void EventType;
  return { ok: false, reason: "anchor-malformed" };
}
