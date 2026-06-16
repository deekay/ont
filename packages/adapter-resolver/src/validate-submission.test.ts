import { describe, expect, it } from "vitest";
import { computeValueRecordHash, deriveOwnerPubkey, signValueRecord, type SignedValueRecord } from "@ont/protocol";
import {
  validateValueRecordSubmission,
  type OwnershipInterval,
  type ValidateValueRecordSubmissionInput,
} from "./validate-submission.js";

// B4-RESOLVE-GUARD red battery (B4_ADAPTERS_PLAN §12.1). The append-only submission store-guard: an
// untrusted value-record may be appended to the off-chain mirror only if it is owner-signed by the interval's
// CURRENT owner, on the right ownership interval, at the exact-next sequence, chaining to the head. The bar is
// "no false append" — NOT resolver authority over ownership. RED until the guard lands (the stub rejects).

const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const OTHER_SK = "22".repeat(32);
const REF = "ab".repeat(32);
const OTHER_REF = "cd".repeat(32);
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";

function record(over: {
  sk?: string; ownershipRef?: string; sequence?: number; previousRecordHash?: string | null; payloadHex?: string; issuedAt?: string;
} = {}): SignedValueRecord {
  return signValueRecord({
    name: "alice",
    ownerPrivateKeyHex: over.sk ?? OWNER_SK,
    ownershipRef: over.ownershipRef ?? REF,
    sequence: over.sequence ?? 1,
    previousRecordHash: over.previousRecordHash ?? null,
    valueType: 0,
    payloadHex: over.payloadHex ?? "00",
    issuedAt: over.issuedAt ?? T0,
  });
}

const HEAD = record({ sequence: 1, previousRecordHash: null }); // genesis head (seq 1)
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

function validate(over: Partial<ValidateValueRecordSubmissionInput> & { record?: SignedValueRecord }) {
  return validateValueRecordSubmission({ record: HEAD, currentOwnership: CURRENT, existingHead: null, ...over });
}

describe("validateValueRecordSubmission — accept (clean appends)", () => {
  it("valid genesis (seq 1, previousRecordHash null) → accept", () => {
    const r = validate({ record: record({ sequence: 1, previousRecordHash: null }), existingHead: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ownershipRef).toBe(REF);
    expect(r.expectedSequence).toBe(1);
    expect(r.expectedPreviousRecordHash).toBeNull();
  });

  it("valid successor (seq head+1, previousRecordHash = hash(head)) → accept", () => {
    const next = record({ sequence: 2, previousRecordHash: computeValueRecordHash(HEAD), payloadHex: "01", issuedAt: T1 });
    const r = validate({ record: next, existingHead: HEAD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expectedSequence).toBe(2);
    expect(r.expectedPreviousRecordHash).toBe(computeValueRecordHash(HEAD));
  });
});

describe("validateValueRecordSubmission — reject (no false append)", () => {
  it("invalid / tampered signature → invalid-signature (never throws)", () => {
    const forged = { ...HEAD, signature: "00".repeat(64) } as SignedValueRecord;
    let r: ReturnType<typeof validateValueRecordSubmission> | undefined;
    expect(() => { r = validate({ record: forged, existingHead: null }); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("invalid-signature");
  });

  it("currentOwnership null → ownership-unknown", () => {
    const r = validate({ currentOwnership: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-unknown");
  });

  it("owner mismatch (self-signed by a non-owner, right ownershipRef) → owner-mismatch", () => {
    const byOther = record({ sk: OTHER_SK, sequence: 1, previousRecordHash: null }); // valid self-signature, REF correct
    const r = validate({ record: byOther, existingHead: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("owner-mismatch");
  });

  it("ownershipRef mismatch → ownership-ref-mismatch", () => {
    const wrongRef = record({ ownershipRef: OTHER_REF, sequence: 1, previousRecordHash: null });
    const r = validate({ record: wrongRef, existingHead: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-ref-mismatch");
  });

  it("stale sequence (< expected) → stale-sequence", () => {
    const r = validate({ record: record({ sequence: 1, previousRecordHash: null }), existingHead: HEAD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stale-sequence");
  });

  it("sequence gap (> expected) → sequence-gap", () => {
    const skip = record({ sequence: 3, previousRecordHash: computeValueRecordHash(HEAD) });
    const r = validate({ record: skip, existingHead: HEAD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("sequence-gap");
  });

  it("predecessor mismatch (wrong previousRecordHash) → predecessor-mismatch", () => {
    const badPrev = record({ sequence: 2, previousRecordHash: "ef".repeat(32) });
    const r = validate({ record: badPrev, existingHead: HEAD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("predecessor-mismatch");
  });
});

describe("validateValueRecordSubmission — totality", () => {
  it("malformed wrapper / ownership / head inputs → reject (ok:false), never throws, never appends", () => {
    const nextValid = record({ sequence: 2, previousRecordHash: computeValueRecordHash(HEAD) });
    const cases: Array<() => ReturnType<typeof validateValueRecordSubmission>> = [
      () => validateValueRecordSubmission(null as unknown as ValidateValueRecordSubmissionInput),
      () => validate({ record: null as unknown as SignedValueRecord }),
      () => validate({ currentOwnership: {} as unknown as OwnershipInterval }),
      () => validate({ record: nextValid, existingHead: {} as unknown as SignedValueRecord }),
    ];
    for (const run of cases) {
      let r: ReturnType<typeof validateValueRecordSubmission> | undefined;
      expect(() => { r = run(); }).not.toThrow(); // never throws
      expect(r?.ok).toBe(false); // fail-closed: never a false append on malformed input
    }
  });

  it("is deterministic", () => {
    const next = record({ sequence: 2, previousRecordHash: computeValueRecordHash(HEAD), payloadHex: "01", issuedAt: T1 });
    expect(validate({ record: next, existingHead: HEAD })).toEqual(validate({ record: next, existingHead: HEAD }));
  });
});
