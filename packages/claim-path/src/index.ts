// @ont/claim-path — B3 integration orchestrator. See PURPOSE.md and
// docs/core/B3_INTEGRATION_PLAN.md.
export {
  enforceBatchedClaim,
  type BatchDataSource,
  type BatchedClaimSources,
  type BatchedClaimAnchor,
  type BatchedClaimWindow,
  type BatchedClaimInput,
  type ClaimStep,
  type ClaimTraceEntry,
  type NameStateDelta,
  type BatchedClaimResult,
  type BitcoinHeaderSource,
} from "./enforce-batched-claim.js";
