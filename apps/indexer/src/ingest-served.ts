// @ont/indexer — served-batch (availability) ingest driver (slice 2). The service validates presented batch
// served-data through the @ont/adapter-indexer availability firewall (`verifyServedDelta` — recompute-don't-trust)
// and persists ONLY verified batches as `IndexedBatchRecord`s through an injected, Promise-shaped store; an
// unverifiable batch mints nothing (fail-closed). The stored records feed `createAvailabilitySource` downstream,
// which RE-verifies on read (defense in depth). The firewall is a narrow, pure injected seam defaulting to the
// real `verifyServedDelta`, so the orchestration is hermetically testable. Total; never throws.
//
// RED battery slice: `ingestServedBatches` is a stub (empty report) until the reviewed green slice lands.
import {
  verifyServedDelta,
  type VerifyServedDeltaInput,
  type IndexedBatchRecord,
} from "@ont/adapter-indexer";

/** The narrow, pure availability firewall seam — default = the real `verifyServedDelta`. */
export type VerifyServedDelta = typeof verifyServedDelta;

/** Persistence port for verified batch records — Promise-shaped (shell around future DB/filesystem state). */
export interface IndexedBatchStore {
  has(anchoredRoot: string): Promise<boolean>;
  put(record: IndexedBatchRecord): Promise<void>;
}

export type ServedIngestRejectReason = "unverifiable" | "ingest-error";

export interface IngestServedReport {
  readonly accepted: readonly string[]; // anchoredRoots newly persisted (verified)
  readonly skipped: readonly string[]; // anchoredRoots already present (idempotent)
  readonly rejected: readonly { readonly reason: ServedIngestRejectReason }[]; // reason-only
}

/**
 * Drive the availability firewall over `candidates`, persisting only verified batches (idempotent per
 * anchoredRoot), fail-closed on `null`, total. Green: per candidate, `verify(candidate)` → null ⇒ rejected
 * `unverifiable`; non-null ⇒ if not already stored, `store.put` the IndexedBatchRecord ({prevRoot, anchoredRoot,
 * baseLeaves, presentedServed}, no service-added fields) + accept, else skip; unexpected throw ⇒ `ingest-error`.
 */
export async function ingestServedBatches(
  _candidates: readonly VerifyServedDeltaInput[],
  _store: IndexedBatchStore,
  _verify: VerifyServedDelta = verifyServedDelta
): Promise<IngestServedReport> {
  return { accepted: [], skipped: [], rejected: [] };
}
