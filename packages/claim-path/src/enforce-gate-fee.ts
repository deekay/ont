import {
  gateFeeValidation,
  type CommittedBatchContents,
  type GateFeeAnchorFacts,
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

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const hasExactKeys = (obj: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(obj).length === keys.length &&
  keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
const isU32 = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffff_ffff;
const HEX_64 = /^[0-9a-f]{64}$/;

const INPUT_KEYS = ["confirmedAnchor", "committedBatch", "feeWitness"] as const;
const CONFIRMED_ANCHOR_KEYS = ["anchorTxid", "minedHeight", "anchoredRoot", "batchSize"] as const;

const malformed = (): GateFeeEnforcementResult => ({
  trace: [],
  verdict: { adequate: false, reason: "gf-input-malformed" },
});

/**
 * Enforce gate-fee adequacy for a confirmed batch anchor: validate the seam fact (closed-shape +
 * hex/u32 — no producer side channel, no malformed seam field falling through into a later `gf-*`),
 * then run the audited `gateFeeValidation` over the committed leaf set + fee witness. Total +
 * fail-closed: never throws; a malformed seam fact or any `gf-*` reject yields an `adequate:false`
 * verdict, no mutation. `gateFeeValidation` owns the fee math + the fee-tx⇔anchor / batch⇔anchor binds.
 */
export function enforceGateFee(input: GateFeeInput): GateFeeEnforcementResult {
  try {
    const root = input as unknown;
    if (!isObject(root) || !hasExactKeys(root, INPUT_KEYS)) return malformed();
    const { confirmedAnchor, committedBatch, feeWitness } = root;

    // The confirmed-anchor seam fact is chain-bound: validate its closed shape + field types here so a
    // malformed seam can't masquerade as a fee/bind reject downstream.
    if (!isObject(confirmedAnchor) || !hasExactKeys(confirmedAnchor, CONFIRMED_ANCHOR_KEYS)) return malformed();
    if (typeof confirmedAnchor.anchorTxid !== "string" || !HEX_64.test(confirmedAnchor.anchorTxid)) return malformed();
    if (typeof confirmedAnchor.anchoredRoot !== "string" || !HEX_64.test(confirmedAnchor.anchoredRoot)) return malformed();
    if (!isU32(confirmedAnchor.minedHeight)) return malformed();
    if (!isU32(confirmedAnchor.batchSize)) return malformed();

    const anchorFacts: GateFeeAnchorFacts = {
      minedHeight: confirmedAnchor.minedHeight,
      anchoredRoot: confirmedAnchor.anchoredRoot,
      batchSize: confirmedAnchor.batchSize,
      anchorTxid: confirmedAnchor.anchorTxid,
    };

    const result = gateFeeValidation(
      anchorFacts,
      committedBatch as CommittedBatchContents,
      feeWitness as GateFeeWitness,
    );
    if (!result.accepted) {
      return { trace: [{ stage: "gate-fee", ok: false, reason: result.reason }], verdict: { adequate: false, reason: result.reason } };
    }
    return { trace: [{ stage: "gate-fee", ok: true }], verdict: { adequate: true, kind: "gate-fee-adequate" } };
  } catch {
    return malformed();
  }
}
