import { computeRecoveryDescriptorHash, verifyRecoveryDescriptor, type SignedRecoveryDescriptor } from "@ont/protocol";
import type { OwnershipInterval, SubmissionRejectReason } from "./validate-submission.js";

// B4-RESOLVE-RECOVER (B4_ADAPTERS_PLAN §12.2) — the resolver's append-only recovery-descriptor submission
// store-guard. The EXACT MIRROR of validateValueRecordSubmission (§12.1) over recovery descriptors. Decides
// whether an UNTRUSTED submitted recovery descriptor may be APPENDED to the off-chain mirror chain for an
// ownership interval. Guards the CONVENIENCE mirror, NOT consensus — recovery authority is decided on-chain +
// by the audited kernel; the resolver is never an authority. Bar = "no false append": a hostile/garbage
// submission (forged signature, wrong owner, wrong interval, stale/gap sequence, wrong predecessor) is
// REJECTED; a clean next descriptor is accepted. Carry-forward store policy from apps/resolver/src/validation.ts
// (no new law). The store-guard adds ONLY mirror-chain policy (owner-bind / ownershipRef / exact-next sequence
// / predecessor hash); descriptor-field validity (recoveryAddress, signingProfile, challengeWindowBlocks) is
// owned entirely by verifyRecoveryDescriptor's signed digest — the guard imposes no extra field policy.
// Reuses OwnershipInterval + the SubmissionRejectReason taxonomy from validate-submission.ts (same boundary,
// same reasons); the only shape difference is the success payload field name (expectedPreviousDescriptorHash).
// Total + fail-closed; never throws.

export interface ValidateRecoveryDescriptorSubmissionInput {
  readonly descriptor: SignedRecoveryDescriptor;
  readonly currentOwnership: OwnershipInterval | null;
  readonly existingHead: SignedRecoveryDescriptor | null;
}

export type RecoveryDescriptorSubmissionResult =
  | {
      readonly ok: true;
      readonly ownershipRef: string;
      readonly expectedSequence: number;
      readonly expectedPreviousDescriptorHash: string | null;
    }
  | { readonly ok: false; readonly reason: SubmissionRejectReason };

/**
 * GREEN contract (B4-RESOLVE-RECOVER), mirroring validateValueRecordSubmission exactly:
 *   1. signature   verifyRecoveryDescriptor(descriptor) — else "invalid-signature".
 *   2. ownership   currentOwnership !== null — else "ownership-unknown".
 *   3. owner       descriptor.ownerPubkey === currentOwnership.currentOwnerPubkey — else "owner-mismatch"
 *                  (verifyRecoveryDescriptor only proves a self-signature by descriptor.ownerPubkey; the
 *                  signer must also be the indexed CURRENT owner for the interval).
 *   4. ref         descriptor.ownershipRef === currentOwnership.ownershipRef — else "ownership-ref-mismatch".
 *   5. sequence    expected = existingHead === null ? 1 : existingHead.sequence + 1;
 *                  descriptor.sequence < expected → "stale-sequence"; > expected → "sequence-gap".
 *   6. predecessor expectedPrev = existingHead === null ? null : computeRecoveryDescriptorHash(existingHead);
 *                  descriptor.previousDescriptorHash === expectedPrev — else "predecessor-mismatch".
 *   7. accept      { ok:true, ownershipRef, expectedSequence, expectedPreviousDescriptorHash }.
 * Descriptor-field validity (recoveryAddress/signingProfile/challengeWindowBlocks) is owned by step 1's signed
 * digest; the guard adds no extra field policy. Append-only / no-rewrite by construction (exact-next sequence +
 * chains-to-head). Total; never throws (→ reject).
 */
export function validateRecoveryDescriptorSubmission(
  input: ValidateRecoveryDescriptorSubmissionInput
): RecoveryDescriptorSubmissionResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "invalid-signature" };
    const { descriptor, currentOwnership, existingHead } = input;

    if (!verifyRecoveryDescriptor(descriptor)) return { ok: false, reason: "invalid-signature" };
    if (currentOwnership === null || typeof currentOwnership !== "object") return { ok: false, reason: "ownership-unknown" };
    if (descriptor.ownerPubkey !== currentOwnership.currentOwnerPubkey) return { ok: false, reason: "owner-mismatch" };
    if (descriptor.ownershipRef !== currentOwnership.ownershipRef) return { ok: false, reason: "ownership-ref-mismatch" };

    const expectedSequence = existingHead === null ? 1 : existingHead.sequence + 1;
    if (descriptor.sequence < expectedSequence) return { ok: false, reason: "stale-sequence" };
    if (descriptor.sequence > expectedSequence) return { ok: false, reason: "sequence-gap" };

    const expectedPreviousDescriptorHash = existingHead === null ? null : computeRecoveryDescriptorHash(existingHead);
    if (descriptor.previousDescriptorHash !== expectedPreviousDescriptorHash) return { ok: false, reason: "predecessor-mismatch" };

    return { ok: true, ownershipRef: currentOwnership.ownershipRef, expectedSequence, expectedPreviousDescriptorHash };
  } catch {
    return { ok: false, reason: "invalid-signature" }; // fail-closed on any malformed input — never a false append
  }
}
