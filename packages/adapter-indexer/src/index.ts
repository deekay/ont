// @ont/adapter-indexer — B4 indexer (firewall-minting heart). See docs/core/B4_ADAPTERS_PLAN.md §9.
// First sub-slice: B4-INDEX-ANCHOR (the inclusion firewall → ConfirmedBatchAnchor + fee-tx parts).
export {
  buildConfirmedBatchAnchor,
  type BuildConfirmedBatchAnchorInput,
  type ConfirmedBatchAnchorResult,
  type ConfirmedBatchAnchorRejectReason,
} from "./confirmed-batch-anchor.js";

// B4-INDEX-COMMIT: the fee-critical committed-batch projection (B4_ADAPTERS_PLAN §9.6).
export {
  buildCommittedBatchForRoot,
  type CommittedBatchEntry,
  type BuildCommittedBatchInput,
} from "./committed-batch.js";

// B4-INDEX-DATASOURCE: the availability seam (B4_ADAPTERS_PLAN §9.8).
export {
  verifyBaseLeaves,
  verifyServedDelta,
  createAvailabilitySource,
  type AvailabilitySource,
  type IndexedBatchRecord,
  type VerifyServedDeltaInput,
} from "./availability-source.js";

// B4-INDEX-INVOKE: the recover-owner invoke firewall (B4_ADAPTERS_PLAN §9.10).
export {
  buildConfirmedRecoverOwnerInvoke,
  type BuildConfirmedRecoverOwnerInvokeInput,
  type ConfirmedRecoverOwnerInvokeResult,
  type ConfirmedRecoverOwnerInvokeRejectReason,
} from "./confirmed-recover-invoke.js";

// The shared inclusion firewall (src/inclusion.ts — opReturnData + bindTxInclusion) is an adapter INTERNAL
// reused by ANCHOR + INVOKE; intentionally NOT part of the package surface (CL green-watch). Intra-package
// callers + tests import it directly from ./inclusion.js.
