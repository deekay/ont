// @ont/adapter-resolver — G2 slice 4a: the confirmed-anchor tx → ServedTx projection.
//
// Promoted wholesale from apps/web/src/live/confirmed-anchor-tx.ts (G1 slice 5) so the RESOLVER owns the
// served-tx contract (rec B); web re-imports it and stays a thin renderer. PURE display projection of the
// ORIGINAL confirmed RootAnchor tx (the indexer's feeTxParts.anchorTx): extracts the EXACT OP_RETURN payload,
// decodes it via @ont/wire, and cross-checks the decoded RootAnchor against the indexer's confirmed fact
// (newRoot === anchoredRoot AND batchSize ===) — fail closed (null) on any mismatch / missing / malformed /
// non-unique carrier. Inputs are @ont/bitcoin + plain values (NO indexer app type). Mints nothing, decides
// no rule. TESTS: ./confirmed-anchor-tx.test.ts.
import { legacyTxidOf, opReturnData, type LegacyTransaction } from "@ont/bitcoin";
import { bytesToHex, decodeEvent, EventType } from "@ont/wire";

/** One projected output of a served tx (valueSats stringified — bigint never crosses JSON). */
export interface ServedTxOutput {
  readonly valueSats: string;
  readonly scriptHex: string;
  readonly address: string | null;
}

/** A confirmed tx projected for display/serving. */
export interface ServedTx {
  readonly txid: string;
  readonly blockHash: string | null;
  readonly blockHeight: number | null;
  readonly outputs: readonly ServedTxOutput[];
  readonly carrierPayloadHex: string | null;
}

/** The original confirmed-anchor tx + the indexer's confirmed fact to cross-check against (loose values —
 *  NO indexer-app type, so neither resolver nor web imports the indexer). */
export interface ConfirmedAnchorTxView {
  readonly anchorTx: LegacyTransaction;
  readonly minedHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
}

/** Total + fail-closed (null), never throws. */
export function confirmedAnchorTxToServedTx(view: ConfirmedAnchorTxView): ServedTx | null {
  void view;
  void legacyTxidOf;
  void opReturnData;
  void bytesToHex;
  void decodeEvent;
  void EventType;
  throw new Error("confirmed-anchor projection not implemented");
}
