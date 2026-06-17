// @ont/anchor-store — the durable confirmed-anchor record + store contract (G2 slice 6a extraction).
//
// Relocated verbatim from @ont/indexer's ingest-anchors so the durable confirmed-anchor store is SHARED
// infrastructure (the indexer writes it; the resolver reads it) with no app->app edge. The record is exactly the
// firewall's ok facts — no added fields; the type identity (claim-path ConfirmedBatchAnchor +
// GateFeeTxWitnessParts) is preserved. claim-path is a TYPE-only import (no runtime dependency).
import type { ConfirmedBatchAnchor, GateFeeTxWitnessParts } from "@ont/claim-path";

/** The exact firewall ok facts the indexer persists — no service-added fields. */
export interface ConfirmedAnchorRecord {
  readonly confirmedAnchor: ConfirmedBatchAnchor;
  readonly feeTxParts: GateFeeTxWitnessParts;
}

/** Persistence port — Promise-shaped (a shell around future DB/filesystem state). The indexer writes (has/put);
 *  the resolver reads (getByTxid). The read accessor mints/mutates nothing — the resolver/web read these
 *  indexer-produced facts, they never confirm. */
export interface ConfirmedAnchorStore {
  has(anchoredRoot: string): Promise<boolean>;
  put(record: ConfirmedAnchorRecord): Promise<void>;
  getByTxid(anchorTxid: string): Promise<ConfirmedAnchorRecord | null>;
}
