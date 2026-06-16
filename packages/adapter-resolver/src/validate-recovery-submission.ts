import type { SignedRecoveryDescriptor } from "@ont/protocol";
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
 * RED stub (B4-RESOLVE-RECOVER): rejects every submission with the unpinned-shape reason until the guard
 * lands. The green contract mirrors validateValueRecordSubmission exactly:
 *   1. signature   verifyRecoveryDescriptor(descriptor) — else "invalid-signature".
 *   2. ownership   currentOwnership !== null — else "ownership-unknown".
 *   3. owner       descriptor.ownerPubkey === currentOwnership.currentOwnerPubkey — else "owner-mismatch".
 *   4. ref         descriptor.ownershipRef === currentOwnership.ownershipRef — else "ownership-ref-mismatch".
 *   5. sequence    expected = existingHead === null ? 1 : existingHead.sequence + 1;
 *                  < expected → "stale-sequence"; > expected → "sequence-gap".
 *   6. predecessor expectedPrev = existingHead === null ? null : computeRecoveryDescriptorHash(existingHead);
 *                  descriptor.previousDescriptorHash === expectedPrev — else "predecessor-mismatch".
 *   7. accept      { ok:true, ownershipRef, expectedSequence, expectedPreviousDescriptorHash }.
 * Append-only / no-rewrite by construction. Total; never throws (→ reject).
 */
export function validateRecoveryDescriptorSubmission(
  input: ValidateRecoveryDescriptorSubmissionInput
): RecoveryDescriptorSubmissionResult {
  void input;
  return { ok: false, reason: "invalid-signature" };
}
