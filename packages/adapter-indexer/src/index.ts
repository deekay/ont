// @ont/adapter-indexer — B4 indexer (firewall-minting heart). See docs/core/B4_ADAPTERS_PLAN.md §9.
// First sub-slice: B4-INDEX-ANCHOR (the inclusion firewall → ConfirmedBatchAnchor + fee-tx parts).
export {
  buildConfirmedBatchAnchor,
  type BuildConfirmedBatchAnchorInput,
  type ConfirmedBatchAnchorResult,
  type ConfirmedBatchAnchorRejectReason,
} from "./confirmed-batch-anchor.js";
