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
