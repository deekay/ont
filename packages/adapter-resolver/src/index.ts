// @ont/adapter-resolver — B4 resolver (read API + submission store-guards). See docs/core/B4_ADAPTERS_PLAN.md §12.
export {
  validateValueRecordSubmission,
  type OwnershipInterval,
  type ValidateValueRecordSubmissionInput,
  type ValueRecordSubmissionResult,
  type SubmissionRejectReason,
} from "./validate-submission.js";
export {
  validateRecoveryDescriptorSubmission,
  type ValidateRecoveryDescriptorSubmissionInput,
  type RecoveryDescriptorSubmissionResult,
} from "./validate-recovery-submission.js";
export {
  projectServedValueHistory,
  type ProjectServedValueHistoryInput,
  type ServedValueHistoryResult,
  type ServedValueHistoryRejectReason,
} from "./serve-value-history.js";
export {
  projectServedRecoveryHistory,
  type ProjectServedRecoveryHistoryInput,
  type ServedRecoveryHistoryResult,
  type ServedRecoveryHistoryRejectReason,
} from "./serve-recovery-history.js";
export {
  confirmedAnchorTxToServedTx,
  confirmedAnchorRecordToTxView,
  type ServedTx,
  type ServedTxOutput,
  type ConfirmedAnchorTxView,
} from "./confirmed-anchor-tx.js";
