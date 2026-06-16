import { computeValueRecordHash, verifyValueRecord, type SignedValueRecord } from "@ont/protocol";

// B4-RESOLVE-GUARD (B4_ADAPTERS_PLAN §12.1) — the resolver's append-only value-record submission store-guard.
// Decides whether an UNTRUSTED submitted value-record may be APPENDED to the off-chain mirror chain for an
// ownership interval. This guards the CONVENIENCE mirror, NOT consensus — ownership is decided on-chain + by
// the audited kernel; the resolver is never an authority (apps/claim requalification precedent). The bar is
// "no false append": a hostile/garbage submission (forged signature, wrong owner, wrong interval, stale/gap
// sequence, wrong predecessor) is REJECTED; a clean next record is accepted. Carry-forward store policy from
// apps/resolver/src/validation.ts (no new law). Total + fail-closed; never throws.

/** The indexed ownership interval a record chain hangs off (chain-derived; supplied by the indexer). */
export interface OwnershipInterval {
  readonly currentOwnerPubkey: string;
  readonly ownershipRef: string;
}

export type SubmissionRejectReason =
  | "invalid-signature" // verifyValueRecord(record) failed
  | "ownership-unknown" // currentOwnership is null (name unknown/released)
  | "owner-mismatch" // record.ownerPubkey is not the interval's current owner (self-signed by a non-owner)
  | "ownership-ref-mismatch" // record.ownershipRef is not the current interval's ref
  | "stale-sequence" // record.sequence < the exact next sequence
  | "sequence-gap" // record.sequence > the exact next sequence (skips predecessors)
  | "predecessor-mismatch"; // record.previousRecordHash does not chain to the current head

export interface ValidateValueRecordSubmissionInput {
  readonly record: SignedValueRecord;
  readonly currentOwnership: OwnershipInterval | null;
  readonly existingHead: SignedValueRecord | null;
}

export type ValueRecordSubmissionResult =
  | {
      readonly ok: true;
      readonly ownershipRef: string;
      readonly expectedSequence: number;
      readonly expectedPreviousRecordHash: string | null;
    }
  | { readonly ok: false; readonly reason: SubmissionRejectReason };

/**
 * GREEN contract (B4-RESOLVE-GUARD):
 *   1. signature   verifyValueRecord(record) — else "invalid-signature".
 *   2. ownership   currentOwnership !== null — else "ownership-unknown".
 *   3. owner       record.ownerPubkey === currentOwnership.currentOwnerPubkey — else "owner-mismatch"
 *                  (verifyValueRecord only proves a self-signature by record.ownerPubkey; the signer must
 *                  also be the indexed CURRENT owner for the interval).
 *   4. ref         record.ownershipRef === currentOwnership.ownershipRef — else "ownership-ref-mismatch".
 *   5. sequence    expected = existingHead === null ? 1 : existingHead.sequence + 1;
 *                  record.sequence < expected → "stale-sequence"; > expected → "sequence-gap".
 *   6. predecessor expectedPrev = existingHead === null ? null : computeValueRecordHash(existingHead);
 *                  record.previousRecordHash === expectedPrev — else "predecessor-mismatch".
 *   7. accept      { ok:true, ownershipRef, expectedSequence, expectedPreviousRecordHash }.
 * Append-only / no-rewrite by construction (exact-next sequence + chains-to-head). Total; never throws (→ reject).
 */
export function validateValueRecordSubmission(input: ValidateValueRecordSubmissionInput): ValueRecordSubmissionResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "invalid-signature" };
    const { record, currentOwnership, existingHead } = input;

    if (!verifyValueRecord(record)) return { ok: false, reason: "invalid-signature" };
    if (currentOwnership === null || typeof currentOwnership !== "object") return { ok: false, reason: "ownership-unknown" };
    if (record.ownerPubkey !== currentOwnership.currentOwnerPubkey) return { ok: false, reason: "owner-mismatch" };
    if (record.ownershipRef !== currentOwnership.ownershipRef) return { ok: false, reason: "ownership-ref-mismatch" };

    const expectedSequence = existingHead === null ? 1 : existingHead.sequence + 1;
    if (record.sequence < expectedSequence) return { ok: false, reason: "stale-sequence" };
    if (record.sequence > expectedSequence) return { ok: false, reason: "sequence-gap" };

    const expectedPreviousRecordHash = existingHead === null ? null : computeValueRecordHash(existingHead);
    if (record.previousRecordHash !== expectedPreviousRecordHash) return { ok: false, reason: "predecessor-mismatch" };

    return { ok: true, ownershipRef: currentOwnership.ownershipRef, expectedSequence, expectedPreviousRecordHash };
  } catch {
    return { ok: false, reason: "invalid-signature" }; // fail-closed on any malformed input — never a false append
  }
}
