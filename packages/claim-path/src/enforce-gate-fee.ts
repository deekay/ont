import {
  gateFeeValidation,
  type CommittedBatchContents,
  type GateFeeWitness,
} from "@ont/consensus";

// I-FEE-A — the gate-fee enforcement orchestrator (B3_INTEGRATION_PLAN §9). The audited
// `gateFeeValidation` is self-contained: it recompute-don't-trusts paidFee = Σ(spent prevouts) −
// Σ(anchor outputs) from txid-bound transactions (legacyTxidOf binds the fee tx to the anchor and each
// prevout to its input) and requiredFee = Σ g over the FULL committed leaf set (#52), binding the
// committed batch to the anchor by root/size. So I-FEE does NOT re-check fees — it feeds the kernel a
// CHAIN-BOUND `ConfirmedBatchAnchor` (not a producer assertion), calls `gateFeeValidation` itself, and
// emits an admission verdict + trace (no state mutation). Pure + total; never throws.
//
// Scope: this is the standalone slice (I-FEE-A). The mandatory in-path gate-fee stage inside
// enforceBatchedClaim (so it cannot reach a verdict/delta unless gate-fee admission passes) is the
// I-FEE-PATH follow-up.

/** The verified inclusion/adapter seam output: a chain-bound batch anchor (h firewall behind it). */
export interface ConfirmedBatchAnchor {
  readonly anchorTxid: string;
  readonly minedHeight: number;
  readonly anchoredRoot: string;
  readonly batchSize: number;
}

export interface GateFeeInput {
  readonly confirmedAnchor: ConfirmedBatchAnchor;
  readonly committedBatch: CommittedBatchContents;
  readonly feeWitness: GateFeeWitness;
}

export type GateFeeStage = "gate-fee";

export interface GateFeeTraceStep {
  readonly stage: GateFeeStage;
  readonly ok: boolean;
  readonly reason?: string;
}

export type GateFeeAdmissionVerdict =
  | { readonly adequate: true; readonly kind: "gate-fee-adequate" }
  | { readonly adequate: false; readonly reason: string };

export interface GateFeeEnforcementResult {
  readonly trace: readonly GateFeeTraceStep[];
  readonly verdict: GateFeeAdmissionVerdict;
}

/**
 * Enforce gate-fee adequacy for a confirmed batch anchor: validate the seam fact, then run the audited
 * `gateFeeValidation` over the committed leaf set + fee witness. Total + fail-closed: never throws; a
 * malformed seam fact or any `gf-*` reject yields an `adequate:false` verdict, no mutation.
 *
 * STUB (I-FEE-A, tests-first): returns a fixed reject so the `fee.*` red battery fails for the right
 * reason until the orchestrator is implemented.
 */
export function enforceGateFee(_input: GateFeeInput): GateFeeEnforcementResult {
  void gateFeeValidation;
  return { trace: [], verdict: { adequate: false, reason: "gf-stub-not-implemented" } };
}
