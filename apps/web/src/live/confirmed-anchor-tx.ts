// G1 slice 5 — confirmed-anchor tx → web ServedTx projection (go-live confirmed-anchor read path).
//
// PURE display projection of the ORIGINAL confirmed RootAnchor transaction (the indexer's
// feeTxParts.anchorTx) into the web's ServedTx. It NEVER synthesizes carrier bytes: it extracts the
// EXACT OP_RETURN payload from the original tx, decodes it via @ont/wire, and cross-checks the decoded
// RootAnchor against the indexer's confirmed fact (newRoot === anchoredRoot AND batchSize ===) — fail
// closed (null) on any mismatch / missing / malformed / non-unique carrier. NO app→app import: inputs
// are @ont/bitcoin + plain values, never the indexer's ConfirmedAnchorRecord type. blockHash stays null
// until the indexer persists it (CL). See docs/core/GO_LIVE_PLAN.md (G1 slice 5).
//
// PURPOSE: original confirmed anchor tx + confirmed fact → ServedTx (display), fail-closed.
// SCOPE: display projection only; mints nothing, decides no rule. TESTS: ./confirmed-anchor-tx.test.ts.
import { legacyTxidOf, opReturnData, type LegacyTransaction } from "@ont/bitcoin";
import { bytesToHex, decodeEvent, EventType } from "@ont/wire";
import type { ServedTx } from "../web-read-port.js";

/** The original confirmed-anchor tx + the indexer's confirmed fact to cross-check against (loose values —
 *  NO indexer-app type, so the web never imports the indexer). */
export interface ConfirmedAnchorTxView {
  readonly anchorTx: LegacyTransaction;
  readonly minedHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
}

export function confirmedAnchorTxToServedTx(_view: ConfirmedAnchorTxView): ServedTx | null {
  // RED stub (throws so value-returning negatives can't spuriously pass) — slice 5 green pending CL red-OK.
  void legacyTxidOf;
  void opReturnData;
  void bytesToHex;
  void decodeEvent;
  void EventType;
  throw new Error("confirmedAnchorTxToServedTx: not implemented (slice 5 green pending)");
}
