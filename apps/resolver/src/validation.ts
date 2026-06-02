// Pure validation for owner-signed submissions (value records + recovery
// descriptors). Extracted from the HTTP handlers so every rejection branch is
// unit-testable in isolation: the handler computes the inputs (parsed record,
// current name record from the indexer, current chain head) and delegates the
// accept/reject decision here. Behavior must stay byte-identical to what the
// handler previously inlined — the mobile client depends on these exact codes.
import type { NameRecord } from "@ont/core";
import {
  computeRecoveryDescriptorHash,
  computeValueRecordHash,
  type SignedRecoveryDescriptor,
  type SignedValueRecord,
  verifyRecoveryDescriptor,
  verifyValueRecord
} from "@ont/protocol";

export interface SubmissionRejection {
  readonly ok: false;
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface ValueRecordAcceptance {
  readonly ok: true;
  readonly ownershipRef: string;
  readonly expectedSequence: number;
  readonly expectedPreviousRecordHash: string | null;
}

export interface RecoveryDescriptorAcceptance {
  readonly ok: true;
  readonly ownershipRef: string;
  readonly expectedSequence: number;
  readonly expectedPreviousDescriptorHash: string | null;
}

/** The resolver's notion of the ownership interval a record chain hangs off. */
export function ownershipRefOf(record: NameRecord): string {
  return record.lastStateTxid;
}

/**
 * Decide whether a signed value record may be appended. `currentNameRecord` is
 * the indexer's current view of the name (or null if unknown); `existingHead` is
 * the current head of the value chain for the record's ownership interval (or
 * null if none yet).
 */
export function validateValueRecordSubmission(
  record: SignedValueRecord,
  currentNameRecord: NameRecord | null,
  existingHead: SignedValueRecord | null
): SubmissionRejection | ValueRecordAcceptance {
  if (!verifyValueRecord(record)) {
    return reject(400, "invalid_signature", "Value record signature did not verify.");
  }
  if (currentNameRecord === null || currentNameRecord.status === "invalid") {
    return reject(404, "name_not_found", "Cannot publish a value for an unclaimed or invalid name.", {
      name: record.name
    });
  }
  if (currentNameRecord.currentOwnerPubkey !== record.ownerPubkey) {
    return reject(409, "owner_mismatch", "Value record owner pubkey does not match the resolver's current owner.", {
      name: record.name,
      currentOwnerPubkey: currentNameRecord.currentOwnerPubkey
    });
  }
  const currentOwnershipRef = ownershipRefOf(currentNameRecord);
  if (record.ownershipRef !== currentOwnershipRef) {
    return reject(
      409,
      "ownership_ref_mismatch",
      "Value record ownershipRef must match the resolver's current ownership interval.",
      { name: record.name, currentOwnershipRef }
    );
  }
  const expectedSequence = existingHead === null ? 1 : existingHead.sequence + 1;
  const expectedPreviousRecordHash = existingHead === null ? null : computeValueRecordHash(existingHead);
  if (record.sequence < expectedSequence) {
    return reject(
      409,
      "stale_sequence",
      "Value record sequence must be the exact next sequence for the current ownership interval.",
      { name: record.name, currentSequence: existingHead?.sequence ?? 0, expectedSequence }
    );
  }
  if (record.sequence > expectedSequence) {
    return reject(409, "sequence_gap", "Value record sequence cannot skip over missing predecessors.", {
      name: record.name,
      currentSequence: existingHead?.sequence ?? 0,
      expectedSequence
    });
  }
  if (record.previousRecordHash !== expectedPreviousRecordHash) {
    return reject(409, "predecessor_mismatch", "Value record previousRecordHash must point to the current chain head.", {
      name: record.name,
      expectedPreviousRecordHash
    });
  }
  return { ok: true, ownershipRef: currentOwnershipRef, expectedSequence, expectedPreviousRecordHash };
}

/** Decide whether a signed recovery descriptor may be appended (mirror of the above). */
export function validateRecoveryDescriptorSubmission(
  descriptor: SignedRecoveryDescriptor,
  currentNameRecord: NameRecord | null,
  existingHead: SignedRecoveryDescriptor | null
): SubmissionRejection | RecoveryDescriptorAcceptance {
  if (!verifyRecoveryDescriptor(descriptor)) {
    return reject(400, "invalid_signature", "Recovery descriptor signature did not verify.");
  }
  if (currentNameRecord === null || currentNameRecord.status === "invalid") {
    return reject(404, "name_not_found", "Cannot publish a recovery descriptor for an unclaimed or invalid name.", {
      name: descriptor.name
    });
  }
  if (currentNameRecord.currentOwnerPubkey !== descriptor.ownerPubkey) {
    return reject(
      409,
      "owner_mismatch",
      "Recovery descriptor owner pubkey does not match the resolver's current owner.",
      { name: descriptor.name, currentOwnerPubkey: currentNameRecord.currentOwnerPubkey }
    );
  }
  const currentOwnershipRef = ownershipRefOf(currentNameRecord);
  if (descriptor.ownershipRef !== currentOwnershipRef) {
    return reject(
      409,
      "ownership_ref_mismatch",
      "Recovery descriptor ownershipRef must match the resolver's current ownership interval.",
      { name: descriptor.name, currentOwnershipRef }
    );
  }
  const expectedSequence = existingHead === null ? 1 : existingHead.sequence + 1;
  const expectedPreviousDescriptorHash =
    existingHead === null ? null : computeRecoveryDescriptorHash(existingHead);
  if (descriptor.sequence < expectedSequence) {
    return reject(
      409,
      "stale_sequence",
      "Recovery descriptor sequence must be the exact next sequence for the current ownership interval.",
      { name: descriptor.name, currentSequence: existingHead?.sequence ?? 0, expectedSequence }
    );
  }
  if (descriptor.sequence > expectedSequence) {
    return reject(409, "sequence_gap", "Recovery descriptor sequence cannot skip over missing predecessors.", {
      name: descriptor.name,
      currentSequence: existingHead?.sequence ?? 0,
      expectedSequence
    });
  }
  if (descriptor.previousDescriptorHash !== expectedPreviousDescriptorHash) {
    return reject(
      409,
      "predecessor_mismatch",
      "Recovery descriptor previousDescriptorHash must point to the current chain head.",
      { name: descriptor.name, expectedPreviousDescriptorHash }
    );
  }
  return { ok: true, ownershipRef: currentOwnershipRef, expectedSequence, expectedPreviousDescriptorHash };
}

function reject(
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {}
): SubmissionRejection {
  return { ok: false, status, body: { error, message, ...extra } };
}
