import { computeValueRecordHash, normalizeName, verifyValueRecord, type SignedValueRecord } from "@ont/protocol";
import type { OwnershipInterval } from "./validate-submission.js";

// B4-RESOLVE-READ (B4_ADAPTERS_PLAN §12.2) — the resolver's value-history read projection. The GET face is a
// chain-derived CONVENIENCE, NOT ownership authority (apps/claim requalification + the da-trust-model firewall
// doctrine: ownership is decided on-chain + by the audited kernel, never by the resolver). The firewall in the
// READ direction is "recompute-don't-trust serving": the resolver serves a value-record history ONLY if the
// whole chain independently re-verifies against the indexed ownership interval; a hostile/corrupt mirror
// (forged record, broken predecessor, sequence break, wrong owner/ref/name) is REJECTED as a served-error,
// never served as a valid-but-stale history (fail-closed reject-whole-chain, not verified-prefix — a prefix
// would make a corrupt mirror look merely stale). The HTTP wiring around this pure core stays thin plumbing;
// live-network smoke is separate. No consensus law; decides nothing about ownership.

export type ServedValueHistoryRejectReason =
  | "ownership-unknown" // currentOwnership is null (name unknown/released) — nothing to bind against
  | "empty-history" // records is empty — no head / no history to serve
  | "invalid-signature" // some record fails verifyValueRecord
  | "name-mismatch" // some record.name !== normalizeName(requested name)
  | "owner-mismatch" // some record.ownerPubkey !== currentOwnership.currentOwnerPubkey (checked for EVERY record)
  | "ownership-ref-mismatch" // some record.ownershipRef !== currentOwnership.ownershipRef
  | "sequence-broken" // records are not the contiguous run 1..N in order
  | "predecessor-mismatch"; // some record.previousRecordHash does not chain to its predecessor

export interface ProjectServedValueHistoryInput {
  readonly name: string;
  readonly currentOwnership: OwnershipInterval | null;
  readonly records: readonly SignedValueRecord[];
}

export type ServedValueHistoryResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly ownershipRef: string;
      readonly records: readonly SignedValueRecord[];
      readonly head: SignedValueRecord; // the newest record (records[N-1])
      readonly provenance: "resolver-indexed-mirror"; // chain-derived convenience store
      readonly authority: "not-ownership-authority"; // the read is NEVER consensus / ownership authority
    }
  | { readonly ok: false; readonly reason: ServedValueHistoryRejectReason };

/**
 * GREEN contract (B4-RESOLVE-READ):
 *   pre  currentOwnership !== null (object) — else "ownership-unknown".
 *   pre  records is a non-empty array — else "empty-history".
 *   (the requested name is normalized ONCE up front and reused for every record comparison.)
 *   for each record at index i (0-based), in order:
 *     1. signature   verifyValueRecord(record) — else "invalid-signature".
 *     2. name        record.name === normalizedName — else "name-mismatch".
 *     3. owner       record.ownerPubkey === currentOwnership.currentOwnerPubkey — else "owner-mismatch"
 *                    (checked for EVERY record, not just the head).
 *     4. ref         record.ownershipRef === currentOwnership.ownershipRef — else "ownership-ref-mismatch".
 *     5. sequence    record.sequence === i + 1 — else "sequence-broken" (contiguous run 1..N in order).
 *     6. predecessor record.previousRecordHash === (i === 0 ? null : computeValueRecordHash(records[i-1]))
 *                    — else "predecessor-mismatch".
 *   accept { ok:true, name: normalizedName, ownershipRef, records (the same caller records, served as-is),
 *           head: records[N-1], provenance: "resolver-indexed-mirror", authority: "not-ownership-authority" }.
 * Reject-whole-chain (fail-closed): any single break rejects the entire history. Total; never throws (→ reject).
 */
export function projectServedValueHistory(input: ProjectServedValueHistoryInput): ServedValueHistoryResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "ownership-unknown" };
    const { name, currentOwnership, records } = input;

    if (currentOwnership === null || typeof currentOwnership !== "object") return { ok: false, reason: "ownership-unknown" };
    if (!Array.isArray(records) || records.length === 0) return { ok: false, reason: "empty-history" };

    const normalizedName = normalizeName(name);

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];
      if (!verifyValueRecord(record)) return { ok: false, reason: "invalid-signature" };
      if (record.name !== normalizedName) return { ok: false, reason: "name-mismatch" };
      if (record.ownerPubkey !== currentOwnership.currentOwnerPubkey) return { ok: false, reason: "owner-mismatch" };
      if (record.ownershipRef !== currentOwnership.ownershipRef) return { ok: false, reason: "ownership-ref-mismatch" };
      if (record.sequence !== i + 1) return { ok: false, reason: "sequence-broken" };
      const expectedPreviousRecordHash = i === 0 ? null : computeValueRecordHash(records[i - 1]);
      if (record.previousRecordHash !== expectedPreviousRecordHash) return { ok: false, reason: "predecessor-mismatch" };
    }

    return {
      ok: true,
      name: normalizedName,
      ownershipRef: currentOwnership.ownershipRef,
      records,
      head: records[records.length - 1],
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
    };
  } catch {
    return { ok: false, reason: "invalid-signature" }; // fail-closed on any malformed input — never a false serve
  }
}
