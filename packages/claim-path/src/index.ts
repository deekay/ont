// @ont/claim-path — B3 integration orchestrator. See PURPOSE.md and
// docs/core/B3_INTEGRATION_PLAN.md.
export {
  enforceBatchedClaim,
  type BatchDataSource,
  type BatchedClaimSources,
  type BatchedClaimAnchor,
  type BatchedClaimWindow,
  type BatchedClaimPolicy,
  type BatchedClaimInput,
  type GateFeeTxWitnessParts,
  type ClaimStep,
  type ClaimTraceEntry,
  type NameStateDelta,
  type BatchedClaimResult,
  type BitcoinHeaderSource,
} from "./enforce-batched-claim.js";

export {
  enforceRecoveryInvoke,
  type UnminedInvokeFields,
  type ConfirmedRecoverOwnerInvoke,
  type RecoveryInvokeInput,
  type RecoveryInvokeStage,
  type RecoveryInvokeTraceStep,
  type RecoveryInvokeVerdict,
  type RecoveryInvokeResult,
} from "./enforce-recovery-invoke.js";

export {
  enforceGateFee,
  type ConfirmedBatchAnchor,
  type GateFeeInput,
  type GateFeeStage,
  type GateFeeTraceStep,
  type GateFeeAdmissionVerdict,
  type GateFeeEnforcementResult,
} from "./enforce-gate-fee.js";

export {
  enforceContestedBatch,
  type ContestedLeafRouting,
  type InsertedLeaf,
  type ContestedBatchVerdict,
  type ContestedBatchTraceStep,
  type ContestedBatchResult,
} from "./enforce-contested-batch.js";
