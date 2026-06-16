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

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const hasExactKeys = (obj: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(obj).length === keys.length &&
  keys.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
const isU32 = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffff_ffff;
const HEX_64 = /^[0-9a-f]{64}$/;

const INPUT_KEYS = ["confirmedInvoke", "descriptor", "nameState", "recoveryParams"] as const;
const CONFIRMED_KEYS = ["txid", "minedHeight", "recoveryDescriptorHash", "invokeFields"] as const;
const INVOKE_FIELDS_KEYS = [
  "prevStateTxid",
  "newOwnerPubkey",
  "flags",
  "successorBondVout",
  "challengeWindowBlocks",
  "recoveryDescriptorHash",
  "signature",
] as const;

/**
 * Enforce a recovery-invoke claim end-to-end: cross-bind → witness (D-RC mint) → authority (kernel).
 * Total + fail-closed: never throws; any malformed input or any failing stage yields a stable reason
 * and an `authorized:false` verdict with NO state mutation. The minted witness height + the kernel
 * `minedHeight` come only from the confirmed-invoke seam fact (the confirmed height is the sole height).
 */
export function enforceRecoveryInvoke(input: RecoveryInvokeInput): RecoveryInvokeResult {
  const trace: RecoveryInvokeTraceStep[] = [];
  try {
    const root = input as unknown;
    if (!isObject(root) || !hasExactKeys(root, INPUT_KEYS)) return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    const { confirmedInvoke, descriptor, nameState, recoveryParams } = root;

    // ---- closed-shape totality on the seam fact I-REC binds/constructs from ----
    if (!isObject(confirmedInvoke) || !hasExactKeys(confirmedInvoke, CONFIRMED_KEYS)) {
      return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    }
    if (typeof confirmedInvoke.txid !== "string" || !HEX_64.test(confirmedInvoke.txid)) {
      return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    }
    if (!isU32(confirmedInvoke.minedHeight)) {
      return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    }
    if (
      typeof confirmedInvoke.recoveryDescriptorHash !== "string" ||
      !HEX_64.test(confirmedInvoke.recoveryDescriptorHash)
    ) {
      return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    }
    const fields = confirmedInvoke.invokeFields;
    // invokeFields stay UNMINED + closed: a smuggled minedHeight / source / timestamp / witness here fails closed.
    if (!isObject(fields) || !hasExactKeys(fields, INVOKE_FIELDS_KEYS)) {
      return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    }
    if (!isObject(descriptor)) {
      return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
    }

    // ---- cross-bind: the invoke fields' committed hash must equal the confirmed invoke's ----
    if (fields.recoveryDescriptorHash !== confirmedInvoke.recoveryDescriptorHash) {
      trace.push({ stage: "cross-bind", ok: false, reason: "rec-cross-bind-mismatch" });
      return { trace, verdict: { authorized: false, reason: "rec-cross-bind-mismatch" } };
    }
    trace.push({ stage: "cross-bind", ok: true });

    // ---- witness: mint the §3c descriptor witness at the confirmed h_r (recompute-not-trust) ----
    const witnessResult = verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: confirmedInvoke.recoveryDescriptorHash,
      confirmedInvokeMinedHeight: confirmedInvoke.minedHeight,
    });
    if (!witnessResult.ok) {
      trace.push({ stage: "witness", ok: false, reason: witnessResult.reason });
      return { trace, verdict: { authorized: false, reason: witnessResult.reason } };
    }
    trace.push({ stage: "witness", ok: true });

    // ---- authority: feed the audited kernel; minedHeight comes ONLY from the confirmed invoke ----
    const invokeFacts = {
      ...fields,
      minedHeight: confirmedInvoke.minedHeight,
    } as unknown as RecoverOwnerInvokeFacts;
    const authority = acceptRecoverOwner(
      invokeFacts,
      { descriptor, witness: witnessResult.witness },
      nameState as RecoveryNameStateFacts,
      recoveryParams as RecoveryParams,
    );
    if (!authority.accepted) {
      trace.push({ stage: "authority", ok: false, reason: authority.reason });
      return { trace, verdict: { authorized: false, reason: authority.reason } };
    }
    trace.push({ stage: "authority", ok: true });

    return {
      trace,
      verdict: {
        authorized: true,
        kind: "recovery-invoke-authorized",
        proposedOwnerPubkey: fields.newOwnerPubkey as string,
        challengeWindowBlocks: fields.challengeWindowBlocks as number,
        recoveryDescriptorHash: confirmedInvoke.recoveryDescriptorHash,
      },
    };
  } catch {
    return { trace, verdict: { authorized: false, reason: "rec-input-malformed" } };
  }
}
