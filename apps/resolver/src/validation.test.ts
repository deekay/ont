import { describe, expect, it } from "vitest";

import type { NameRecord } from "@ont/core";
import {
  computeRecoveryDescriptorHash,
  computeValueRecordHash,
  signRecoveryDescriptor,
  signValueRecord,
  type SignedRecoveryDescriptor,
  type SignedValueRecord
} from "@ont/protocol";

import { validateRecoveryDescriptorSubmission, validateValueRecordSubmission } from "./validation.js";

const OWNER = "11".repeat(32);
const REF = "aa".repeat(32);

function signValue(over: Record<string, unknown> = {}): SignedValueRecord {
  return signValueRecord({
    name: "alice",
    ownerPrivateKeyHex: OWNER,
    ownershipRef: REF,
    sequence: 1,
    previousRecordHash: null,
    valueType: 2,
    payloadHex: "00",
    issuedAt: "2026-05-29T00:00:00.000Z",
    ...over
  });
}

const OWNER_PUB = signValue().ownerPubkey;

function nameRecord(over: Partial<NameRecord> = {}): NameRecord {
  return {
    status: "mature",
    currentOwnerPubkey: OWNER_PUB,
    lastStateTxid: REF,
    ...over
  } as unknown as NameRecord;
}

describe("validateValueRecordSubmission", () => {
  it("accepts a well-formed first record", () => {
    const r = validateValueRecordSubmission(signValue(), nameRecord(), null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expectedSequence).toBe(1);
      expect(r.expectedPreviousRecordHash).toBeNull();
      expect(r.ownershipRef).toBe(REF);
    }
  });

  it("rejects a bad signature (400)", () => {
    const r = validateValueRecordSubmission({ ...signValue(), signature: "00".repeat(64) }, nameRecord(), null);
    expect(r).toMatchObject({ ok: false, status: 400, body: { error: "invalid_signature" } });
  });

  it("rejects an unknown or invalid name (404)", () => {
    expect(validateValueRecordSubmission(signValue(), null, null)).toMatchObject({
      ok: false,
      status: 404,
      body: { error: "name_not_found" }
    });
    expect(
      validateValueRecordSubmission(signValue(), nameRecord({ status: "invalid" } as Partial<NameRecord>), null)
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects a foreign owner (409 owner_mismatch)", () => {
    const r = validateValueRecordSubmission(signValue(), nameRecord({ currentOwnerPubkey: "cd".repeat(32) }), null);
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: "owner_mismatch" } });
  });

  it("rejects a wrong ownership ref (409 ownership_ref_mismatch)", () => {
    const r = validateValueRecordSubmission(signValue(), nameRecord({ lastStateTxid: "bb".repeat(32) }), null);
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: "ownership_ref_mismatch" } });
  });

  it("rejects a stale sequence (409 stale_sequence)", () => {
    const head = signValue({ sequence: 1 });
    // submitting seq 1 again when head is already seq 1 (expected 2)
    const r = validateValueRecordSubmission(signValue({ sequence: 1 }), nameRecord(), head);
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: "stale_sequence", expectedSequence: 2 } });
  });

  it("rejects the losing writer in a concurrent head+1 race", () => {
    const head = signValue({ sequence: 1 });
    // Two writers both build seq 2 against head seq 1.
    const next = signValue({ sequence: 2, previousRecordHash: computeValueRecordHash(head) });
    expect(validateValueRecordSubmission(next, nameRecord(), head).ok).toBe(true);
    // Writer A wins and is applied -> head is now seq 2. Writer B's identical seq-2
    // submission is now stale (expected seq 3).
    const r = validateValueRecordSubmission(
      signValue({ sequence: 2, previousRecordHash: computeValueRecordHash(head) }),
      nameRecord(),
      next
    );
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: "stale_sequence", expectedSequence: 3 } });
  });

  it("rejects a sequence gap (409 sequence_gap)", () => {
    const r = validateValueRecordSubmission(signValue({ sequence: 3 }), nameRecord(), null);
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: "sequence_gap", expectedSequence: 1 } });
  });

  it("rejects a wrong predecessor hash (409 predecessor_mismatch)", () => {
    const head = signValue({ sequence: 1 });
    // correct sequence (2) but previousRecordHash points nowhere
    const next = signValue({ sequence: 2, previousRecordHash: "ee".repeat(32) });
    const r = validateValueRecordSubmission(next, nameRecord(), head);
    expect(r).toMatchObject({ ok: false, status: 409, body: { error: "predecessor_mismatch" } });
  });

  it("accepts a correctly-chained successor", () => {
    const head = signValue({ sequence: 1 });
    const next = signValue({ sequence: 2, previousRecordHash: computeValueRecordHash(head) });
    expect(validateValueRecordSubmission(next, nameRecord(), head).ok).toBe(true);
  });
});

function signRecovery(over: Record<string, unknown> = {}): SignedRecoveryDescriptor {
  return signRecoveryDescriptor({
    name: "alice",
    ownerPrivateKeyHex: OWNER,
    ownershipRef: REF,
    sequence: 1,
    previousDescriptorHash: null,
    recoveryAddress: "tb1qexampleexampleexampleexampleexample0l7k7f",
    issuedAt: "2026-05-29T00:00:00.000Z",
    ...over
  });
}

describe("validateRecoveryDescriptorSubmission", () => {
  it("accepts a well-formed first descriptor", () => {
    const r = validateRecoveryDescriptorSubmission(signRecovery(), nameRecord(), null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expectedSequence).toBe(1);
      expect(r.expectedPreviousDescriptorHash).toBeNull();
    }
  });

  it("rejects bad signature / unknown name / foreign owner / wrong ref", () => {
    expect(
      validateRecoveryDescriptorSubmission({ ...signRecovery(), signature: "00".repeat(64) }, nameRecord(), null)
    ).toMatchObject({ ok: false, status: 400 });
    expect(validateRecoveryDescriptorSubmission(signRecovery(), null, null)).toMatchObject({ ok: false, status: 404 });
    expect(
      validateRecoveryDescriptorSubmission(signRecovery(), nameRecord({ currentOwnerPubkey: "cd".repeat(32) }), null)
    ).toMatchObject({ ok: false, body: { error: "owner_mismatch" } });
    expect(
      validateRecoveryDescriptorSubmission(signRecovery(), nameRecord({ lastStateTxid: "bb".repeat(32) }), null)
    ).toMatchObject({ ok: false, body: { error: "ownership_ref_mismatch" } });
  });

  it("enforces the exact-next sequence + predecessor chain", () => {
    const head = signRecovery({ sequence: 1 });
    expect(validateRecoveryDescriptorSubmission(signRecovery({ sequence: 1 }), nameRecord(), head)).toMatchObject({
      body: { error: "stale_sequence" }
    });
    expect(validateRecoveryDescriptorSubmission(signRecovery({ sequence: 3 }), nameRecord(), null)).toMatchObject({
      body: { error: "sequence_gap" }
    });
    const badPrev = signRecovery({ sequence: 2, previousDescriptorHash: "ee".repeat(32) });
    expect(validateRecoveryDescriptorSubmission(badPrev, nameRecord(), head)).toMatchObject({
      body: { error: "predecessor_mismatch" }
    });
    const goodNext = signRecovery({ sequence: 2, previousDescriptorHash: computeRecoveryDescriptorHash(head) });
    expect(validateRecoveryDescriptorSubmission(goodNext, nameRecord(), head).ok).toBe(true);
  });
});
