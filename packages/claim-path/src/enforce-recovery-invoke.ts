import { verifyRecoveryDescriptorWitness } from "@ont/evidence";
import {
  acceptRecoverOwner,
  type RecoverOwnerInvokeFacts,
  type RecoveryNameStateFacts,
  type RecoveryParams,
} from "@ont/consensus";

// I-REC — the recovery-invoke enforcement orchestrator (B3_INTEGRATION_PLAN §8). An untrusted supply
// presents a VERIFIED confirmed-invoke seam fact + the recovery descriptor + current name-state; I-REC
// cross-binds the fact, mints the §3c descriptor witness via @ont/evidence (recompute-not-trust) at the
// confirmed h_r, and feeds the audited kernel acceptRecoverOwner. It emits an evidence trace + an
// ADMISSION verdict — NOT a state mutation: acceptRecoverOwner authorizes the invoke; the engine opens
// pendingRecovery only after PR-34 successor-bond/address checks (a later slice), and owner rotation
// happens at finalization. So I-REC never rotates the owner or emits a name-state delta. Pure + total.

/** The parsed RecoverOwner payload MINUS minedHeight — I-REC adds the confirmed h_r. Closed shape. */
export interface UnminedInvokeFields {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string;
  readonly flags: number;
  readonly successorBondVout: number;
  readonly challengeWindowBlocks: number;
  readonly recoveryDescriptorHash: string;
  readonly signature: string;
}

/**
 * The verified inclusion/adapter seam output (B4 produces it; fixture in B3). The h_r firewall lives in
 * the inclusion builder behind this seam — `minedHeight` is chain-verified, not a producer assertion.
 * Closed shape; `invokeFields` carries NO `minedHeight` / `source` / timestamp / witness.
 */
export interface ConfirmedRecoverOwnerInvoke {
  readonly txid: string;
  readonly minedHeight: number;
  readonly recoveryDescriptorHash: string;
  readonly invokeFields: UnminedInvokeFields;
}

export interface RecoveryInvokeInput {
  readonly confirmedInvoke: ConfirmedRecoverOwnerInvoke;
  readonly descriptor: Record<string, unknown>;
  readonly nameState: RecoveryNameStateFacts;
  readonly recoveryParams: RecoveryParams;
}

export type RecoveryInvokeStage = "cross-bind" | "witness" | "authority";

export interface RecoveryInvokeTraceStep {
  readonly stage: RecoveryInvokeStage;
  readonly ok: boolean;
  readonly reason?: string;
}

export type RecoveryInvokeVerdict =
  | {
      readonly authorized: true;
      readonly kind: "recovery-invoke-authorized";
      readonly proposedOwnerPubkey: string;
      readonly challengeWindowBlocks: number;
      readonly recoveryDescriptorHash: string;
    }
  | { readonly authorized: false; readonly reason: string };

export interface RecoveryInvokeResult {
  readonly trace: readonly RecoveryInvokeTraceStep[];
  readonly verdict: RecoveryInvokeVerdict;
}

/**
 * Enforce a recovery-invoke claim end-to-end: cross-bind → witness (D-RC mint) → authority (kernel).
 * Total + fail-closed: never throws; any malformed input or any failing stage yields a stable reason
 * and an authorized:false verdict with no state mutation.
 *
 * STUB (I-REC, tests-first): returns a fixed reject so the `rec.*` red battery fails for the right
 * reason until the orchestrator is implemented.
 */
export function enforceRecoveryInvoke(_input: RecoveryInvokeInput): RecoveryInvokeResult {
  void verifyRecoveryDescriptorWitness;
  void acceptRecoverOwner;
  const _facts: RecoverOwnerInvokeFacts | null = null;
  void _facts;
  return { trace: [], verdict: { authorized: false, reason: "rec-stub-not-implemented" } };
}
