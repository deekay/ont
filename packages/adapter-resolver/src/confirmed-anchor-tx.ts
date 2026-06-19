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

/**
 * Map a persisted confirmed-anchor record to this view (G2 slice 6a). PURE + STRUCTURAL: it takes only the
 * fields the view needs (the original anchor tx + the indexer's confirmed fact), so @ont/adapter-resolver keeps
 * NO runtime or package dependency on the node-targeted @ont/anchor-store — a real `ConfirmedAnchorRecord` is
 * assignable here by structural width. The resolver's durable read source (selectResolverAnchorTxView, slice 6b)
 * composes anchor-store.getByTxid → this map → ConfirmedAnchorTxView; web/resolver never import the indexer.
 */
export function confirmedAnchorRecordToTxView(record: {
  readonly confirmedAnchor: { readonly minedHeight: number; readonly anchoredRoot: string; readonly batchSize: number };
  readonly feeTxParts: { readonly anchorTx: LegacyTransaction };
}): ConfirmedAnchorTxView {
  return {
    anchorTx: record.feeTxParts.anchorTx,
    minedHeight: record.confirmedAnchor.minedHeight,
    anchoredRoot: record.confirmedAnchor.anchoredRoot,
    batchSize: record.confirmedAnchor.batchSize,
  };
}
