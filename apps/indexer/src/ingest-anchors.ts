// @ont/indexer — confirmed-anchor ingest driver (clean runnable indexer, slice 1). Batch block-ingestion, NO
// HTTP. The service drives the @ont/adapter-indexer inclusion firewall over candidates and persists ONLY the
// accepted (ok) facts through an injected, Promise-shaped store port; a rejected candidate mints nothing
// (fail-closed). It re-derives no firewall/consensus/fee rule. The firewall is a narrow, pure injected seam
// (`confirm`) defaulting to the real `buildConfirmedBatchAnchor`, so the orchestration is hermetically testable.
//
// RED battery slice: `ingestConfirmedAnchors` is a stub (empty report) until the reviewed green slice lands; the
// test file pins the contract.
import {
  buildConfirmedBatchAnchor,
  type BuildConfirmedBatchAnchorInput,
  type ConfirmedBatchAnchorResult,
  type ConfirmedBatchAnchorRejectReason,
} from "@ont/adapter-indexer";
import type { ConfirmedBatchAnchor, GateFeeTxWitnessParts } from "@ont/claim-path";

/** The narrow, pure firewall seam: a confirmed-anchor candidate → the adapter's verdict. Default = the real
 *  `buildConfirmedBatchAnchor`. Async block-source work belongs BEFORE candidate construction, never here. */
export type ConfirmAnchor = (candidate: BuildConfirmedBatchAnchorInput) => ConfirmedBatchAnchorResult;

/** The exact firewall ok facts the service persists — no service-added fields. */
export interface ConfirmedAnchorRecord {
  readonly confirmedAnchor: ConfirmedBatchAnchor;
  readonly feeTxParts: GateFeeTxWitnessParts;
}

/** Persistence port — Promise-shaped from the start (the service is a shell around future DB/filesystem state). */
export interface ConfirmedAnchorStore {
  has(anchoredRoot: string): Promise<boolean>;
  put(record: ConfirmedAnchorRecord): Promise<void>;
}

export type IngestRejectReason = ConfirmedBatchAnchorRejectReason | "ingest-error";

export interface IngestAnchorsReport {
  readonly accepted: readonly string[]; // anchoredRoots newly persisted
  readonly skipped: readonly string[]; // anchoredRoots already present (idempotent)
  readonly rejected: readonly { readonly reason: IngestRejectReason }[]; // reason-only (no candidate echo)
}

/**
 * Drive the inclusion firewall over `candidates`, persisting only accepted facts (idempotent per anchoredRoot),
 * fail-closed on rejects, total (never throws). Green: per candidate, `confirm(candidate)` → ok ⇒ if not already
 * stored, `store.put({confirmedAnchor, feeTxParts})` + accept, else skip; reject ⇒ tally reason; any unexpected
 * throw ⇒ `ingest-error`, continue.
 */
export async function ingestConfirmedAnchors(
  _candidates: readonly BuildConfirmedBatchAnchorInput[],
  _store: ConfirmedAnchorStore,
  _confirm: ConfirmAnchor = buildConfirmedBatchAnchor
): Promise<IngestAnchorsReport> {
  return { accepted: [], skipped: [], rejected: [] };
}
