// @ont/indexer — clean runnable indexer service (batch block-ingestion, NO HTTP). See PURPOSE.md. Drives the
// @ont/adapter-indexer inclusion firewall over an injected store port and persists chain-bound facts; re-derives
// no firewall/consensus rule, no legacy reach, no live network in the tested core.
export {
  ingestConfirmedAnchors,
  type ConfirmAnchor,
  type ConfirmedAnchorRecord,
  type ConfirmedAnchorStore,
  type IngestRejectReason,
  type IngestAnchorsReport,
} from "./ingest-anchors.js";
export {
  ingestServedBatches,
  type VerifyServedDelta,
  type IndexedBatchStore,
  type ServedIngestRejectReason,
  type IngestServedReport,
} from "./ingest-served.js";
export {
  ingestRecoverInvokes,
  type ConfirmRecoverInvoke,
  type RecoverInvokeStore,
  type RecoverInvokeRejectReason,
  type IngestRecoverInvokesReport,
} from "./ingest-recover-invoke.js";
export {
  runIndexerTick,
  runIndexerLoop,
  createEmptyIndexerBlockSource,
  createInMemoryIndexerCursorStore,
  createInMemoryConfirmedAnchorStore,
  type IndexerCursor,
  type ConfirmedAnchorBatch,
  type IndexerBlockSource,
  type IndexerCursorStore,
  type IndexerRunnerDeps,
  type IndexerTickReport,
  type RunLoopOptions,
} from "./runner.js";
// Env-selected live block source (go-live slice 4b) — published so the regtest e2e composes it.
export { selectIndexerBlockSource } from "./live/select-block-source.js";
// Env-selected durable stores (go-live G2 slice 3) — published so the restart-survival e2e (6c) drives the SAME
// env-selected indexer path operators use. selectIndexerStores only CONSTRUCTS the stores; the cursor store stays
// indexer-owned (ownership does not move out).
export { selectIndexerStores, type IndexerStores } from "./live/select-stores.js";
// The firewall input type — re-exported so the hermetic e2e can type its fake block source's candidates.
export type { BuildConfirmedBatchAnchorInput } from "@ont/adapter-indexer";
