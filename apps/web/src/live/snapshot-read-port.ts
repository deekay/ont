// G1 slice 5 — snapshot-backed web read port (go-live confirmed-anchor read path).
//
// A WebReadPort over an injected, SYNC, harness-maintained snapshot of confirmed-anchor tx views (kept
// current as the indexer ingests). tx(txid) looks up the snapshot and projects via the pure
// confirmedAnchorTxToServedTx (fail-closed → null). valueHistory / recoveryHistory stay null: per-name
// ownership resolution is B3-deferred (deriving name→owner from a batch root is the batched claim path,
// not in the clean tree). Reads are pure — the port mints nothing and mutates nothing; no app→app import
// (the harness injects the snapshot). See docs/core/GO_LIVE_PLAN.md (G1 slice 5).
//
// PURPOSE: injected confirmed-anchor snapshot → a read-only WebReadPort (tx view only for G1).
// SCOPE: lookup + projection wiring; no minting, no name-ownership. TESTS: ./snapshot-read-port.test.ts.
import type { WebReadPort } from "../web-read-port.js";
import { confirmedAnchorTxToServedTx, type ConfirmedAnchorTxView } from "./confirmed-anchor-tx.js";

/** The harness-maintained read source: the original confirmed-anchor tx view for a txid, or null. SYNC so
 *  the web render path stays synchronous (CL slice-5 watch). */
export interface ConfirmedAnchorSnapshot {
  anchorTxByTxid(txid: string): ConfirmedAnchorTxView | null;
}

export function createSnapshotWebReadPort(snapshot: ConfirmedAnchorSnapshot): WebReadPort {
  return {
    // Per-name ownership resolution is B3-deferred; the read port mints nothing here.
    valueHistory: () => null,
    recoveryHistory: () => null,
    tx: (txid) => {
      const view = snapshot.anchorTxByTxid(txid);
      if (view === null) return null;
      const served = confirmedAnchorTxToServedTx(view);
      // Preserve the tx(txid) contract: a snapshot keyed to the wrong tx fails closed here, not just at render.
      if (served === null || served.txid !== txid) return null;
      return served;
    },
  };
}
