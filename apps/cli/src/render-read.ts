import type { ServedValueHistoryResult, ServedRecoveryHistoryResult } from "@ont/adapter-resolver";
import type { CliTxRead } from "./read-port.js";

// B5-CLI — read rendering (pure surface cores). Fold a fetched read into a CLI view-model. The two resolver
// history renders carry the resolver's not-ownership-authority / resolver-indexed-mirror stamps VERBATIM (the
// surface never upgrades authority). The tx render is provenance/display only (bitcoin-chain) and is typed
// not-ownership-authority so it cannot grow ownership language. A missing/rejected read → unavailable (no
// fabricated state). Total; never throws.

export interface HistoryView {
  readonly name: string;
  readonly count: number;
  readonly provenance: "resolver-indexed-mirror";
  readonly authority: "not-ownership-authority";
}

export interface TxView {
  readonly txid: string;
  readonly confirmations: number | null;
  readonly blockHeight: number | null;
  readonly provenance: "bitcoin-chain";
  readonly authority: "not-ownership-authority";
}

export type RenderHistoryResult = { readonly ok: true; readonly view: HistoryView } | { readonly ok: false; readonly reason: "unavailable" };
export type RenderTxResult = { readonly ok: true; readonly view: TxView } | { readonly ok: false; readonly reason: "unavailable" };

/** RED stub. Green: served.ok → view {name, count: records.length, provenance, authority} (stamps verbatim); else unavailable. */
export function renderValueHistory(served: ServedValueHistoryResult): RenderHistoryResult {
  void served;
  return { ok: false, reason: "unavailable" };
}

/** RED stub. Green: served.ok → view {name, count: descriptors.length, provenance, authority} (stamps verbatim); else unavailable. */
export function renderRecoveryHistory(served: ServedRecoveryHistoryResult): RenderHistoryResult {
  void served;
  return { ok: false, reason: "unavailable" };
}

/** RED stub. Green: tx is an object → view {txid, confirmations, blockHeight, provenance:"bitcoin-chain", authority:"not-ownership-authority"}; else unavailable. */
export function renderTx(tx: CliTxRead): RenderTxResult {
  void tx;
  return { ok: false, reason: "unavailable" };
}
