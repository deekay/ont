import type { ServedValueHistoryResult, ServedRecoveryHistoryResult } from "@ont/adapter-resolver";
import type { CliTxRead, ResolverRawRead } from "./read-port.js";

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

/** served.ok → view carrying the resolver stamps verbatim; else unavailable (no fabricated state). Never throws. */
export function renderValueHistory(served: ServedValueHistoryResult): RenderHistoryResult {
  try {
    if (served === null || typeof served !== "object" || served.ok !== true) return { ok: false, reason: "unavailable" };
    return {
      ok: true,
      view: { name: served.name, count: served.records.length, provenance: served.provenance, authority: served.authority },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** served.ok → view carrying the resolver stamps verbatim; else unavailable. Never throws. */
export function renderRecoveryHistory(served: ServedRecoveryHistoryResult): RenderHistoryResult {
  try {
    if (served === null || typeof served !== "object" || served.ok !== true) return { ok: false, reason: "unavailable" };
    return {
      ok: true,
      view: { name: served.name, count: served.descriptors.length, provenance: served.provenance, authority: served.authority },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Chain provenance/display only — never ownership authority. Object → view; else unavailable. Never throws. */
export function renderTx(tx: CliTxRead): RenderTxResult {
  try {
    if (tx === null || typeof tx !== "object") return { ok: false, reason: "unavailable" };
    return {
      ok: true,
      view: { txid: tx.txid, confirmations: tx.confirmations, blockHeight: tx.blockHeight, provenance: "bitcoin-chain", authority: "not-ownership-authority" },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// Raw resolver read display (lean ii). The envelope's stamps are validated EXACTLY + carried; `data` is passed
// through UNCHANGED (opaque). Missing/wrong stamps or a malformed envelope → unavailable; authority is NEVER
// inferred from the payload.
export interface RawView {
  readonly provenance: "resolver-indexed-mirror";
  readonly authority: "not-ownership-authority";
  readonly data: unknown;
}
export type RenderResolverRawResult = { readonly ok: true; readonly view: RawView } | { readonly ok: false; readonly reason: "unavailable" };

/** RED stub. Green: validate env object + EXACT stamps → {ok:true, view:{provenance, authority, data}} (data unchanged); else unavailable. */
export function renderResolverRaw(env: ResolverRawRead): RenderResolverRawResult {
  void env;
  return { ok: false, reason: "unavailable" };
}
