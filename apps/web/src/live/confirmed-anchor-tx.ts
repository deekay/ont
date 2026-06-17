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
import type { ServedTx, ServedTxOutput } from "../web-read-port.js";

/** The original confirmed-anchor tx + the indexer's confirmed fact to cross-check against (loose values —
 *  NO indexer-app type, so the web never imports the indexer). */
export interface ConfirmedAnchorTxView {
  readonly anchorTx: LegacyTransaction;
  readonly minedHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
}

/** Total + fail-closed (null), never throws. */
export function confirmedAnchorTxToServedTx(view: ConfirmedAnchorTxView): ServedTx | null {
  const { anchorTx, minedHeight, anchoredRoot, batchSize } = view;

  // txid from the ORIGINAL bytes; an unserializable tx fails closed.
  const txid = legacyTxidOf(anchorTx);
  if (txid === null) return null;

  // Collect every output whose OP_RETURN payload decodes to a RootAnchor — exactly one is required
  // (non-unique carrier fails closed, mirroring the inclusion firewall's exactly-one rule).
  const rootAnchors: Uint8Array[] = [];
  for (const output of anchorTx.outputs) {
    const payload = opReturnData(output.scriptPubKeyHex);
    if (payload === null) continue;
    let ev;
    try {
      ev = decodeEvent(payload);
    } catch {
      continue; // arbitrary OP_RETURN noise — not a carrier
    }
    if (ev.type === EventType.RootAnchor) rootAnchors.push(payload);
  }
  if (rootAnchors.length !== 1) return null;

  // Cross-check the decoded carrier against the indexer's confirmed fact; bytes shown are the original payload.
  const payload = rootAnchors[0]!;
  const decoded = decodeEvent(payload);
  if (decoded.type !== EventType.RootAnchor) return null; // unreachable (filtered above), kept fail-closed
  if (decoded.newRoot !== anchoredRoot || decoded.batchSize !== batchSize) return null;

  const outputs: ServedTxOutput[] = anchorTx.outputs.map((o) => ({
    valueSats: o.valueSats.toString(),
    scriptHex: o.scriptPubKeyHex,
    address: null,
  }));

  return {
    txid,
    blockHash: null, // the indexer does not persist the block hash yet (G2)
    blockHeight: minedHeight,
    outputs,
    carrierPayloadHex: bytesToHex(payload),
  };
}
