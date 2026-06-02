import { describe, expect, it } from "vitest";

import {
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  parseSignedRecoveryDescriptor,
  parseSignedValueRecord,
  signRecoveryDescriptor,
  signValueRecord,
  verifyValueRecord
} from "./index.js";

const OWNER = "11".repeat(32);
const REF = "aa".repeat(32);

function valueRecord(overrides: Record<string, unknown> = {}) {
  return signValueRecord({
    name: "alice",
    ownerPrivateKeyHex: OWNER,
    ownershipRef: REF,
    sequence: 1,
    previousRecordHash: null,
    valueType: 0x02,
    payloadHex: "00",
    issuedAt: "2026-05-29T00:00:00.000Z",
    ...overrides
  });
}

describe("value-record boundaries", () => {
  it("requires a non-empty payload and accepts a max-size (65535-byte) one", () => {
    // The canonical hex encoding requires >= 1 byte, so an empty value is invalid.
    expect(() => valueRecord({ payloadHex: "" })).toThrow();
    expect(verifyValueRecord(valueRecord({ payloadHex: "00".repeat(65535) }))).toBe(true);
  });

  it("rejects a payload over 65535 bytes", () => {
    expect(() => valueRecord({ payloadHex: "00".repeat(65536) })).toThrow();
  });

  it("rejects non-positive / non-integer sequences", () => {
    expect(() => valueRecord({ sequence: 0 })).toThrow();
    expect(() => valueRecord({ sequence: -1 })).toThrow();
    expect(() => valueRecord({ sequence: 1.5 })).toThrow();
    expect(() => valueRecord({ sequence: Number.MAX_SAFE_INTEGER + 2 })).toThrow();
  });

  it("rejects a valueType outside one byte", () => {
    expect(() => valueRecord({ valueType: -1 })).toThrow();
    expect(() => valueRecord({ valueType: 256 })).toThrow();
  });

  it("rejects malformed hex fields", () => {
    expect(() => valueRecord({ ownershipRef: "zz".repeat(32) })).toThrow();
    expect(() => valueRecord({ ownershipRef: "aa".repeat(16) })).toThrow(); // wrong length
    expect(() => valueRecord({ ownerPrivateKeyHex: "11".repeat(16) })).toThrow();
    expect(() => valueRecord({ payloadHex: "0" })).toThrow(); // odd-length hex
  });

  it("rejects a previousRecordHash of the wrong length", () => {
    expect(() => valueRecord({ previousRecordHash: "cc".repeat(16) })).toThrow();
  });

  it("rejects parsing a record with the wrong format or version", () => {
    const rec = valueRecord();
    expect(() => parseSignedValueRecord({ ...rec, format: "not-ont" })).toThrow();
    expect(() => parseSignedValueRecord({ ...rec, recordVersion: VALUE_RECORD_VERSION + 1 })).toThrow();
    expect(() => parseSignedValueRecord("not-an-object")).toThrow();
  });

  it("round-trips a parsed record unchanged", () => {
    const rec = valueRecord();
    expect(rec.format).toBe(VALUE_RECORD_FORMAT);
    expect(parseSignedValueRecord(rec)).toEqual(rec);
  });
});

function recoveryDescriptor(overrides: Record<string, unknown> = {}) {
  return signRecoveryDescriptor({
    name: "alice",
    ownerPrivateKeyHex: OWNER,
    ownershipRef: REF,
    sequence: 1,
    previousDescriptorHash: null,
    recoveryAddress: "tb1qexampleexampleexampleexampleexample0l7k7f",
    issuedAt: "2026-05-29T00:00:00.000Z",
    ...overrides
  });
}

describe("recovery-descriptor boundaries", () => {
  it("defaults signingProfile + challengeWindowBlocks when omitted", () => {
    const d = recoveryDescriptor();
    expect(d.signingProfile).toBe("bip322");
    expect(d.challengeWindowBlocks).toBe(144);
  });

  it("round-trips a non-default challenge window", () => {
    const d = recoveryDescriptor({ challengeWindowBlocks: 1000 });
    expect(d.challengeWindowBlocks).toBe(1000);
    expect(parseSignedRecoveryDescriptor(d)).toEqual(d);
  });

  it("rejects an out-of-range challenge window", () => {
    expect(() => recoveryDescriptor({ challengeWindowBlocks: 0 })).toThrow();
    expect(() => recoveryDescriptor({ challengeWindowBlocks: 0x1_0000_0000 })).toThrow();
  });

  it("rejects an empty or oversized recovery address", () => {
    expect(() => recoveryDescriptor({ recoveryAddress: "" })).toThrow();
    expect(() => recoveryDescriptor({ recoveryAddress: "a".repeat(201) })).toThrow();
  });

  it("rejects an invalid signing profile", () => {
    expect(() => recoveryDescriptor({ signingProfile: "BAD PROFILE!" })).toThrow();
  });

  it("rejects non-positive sequences", () => {
    expect(() => recoveryDescriptor({ sequence: 0 })).toThrow();
  });

  it("rejects parsing with the wrong format or version", () => {
    const d = recoveryDescriptor();
    expect(d.format).toBe(RECOVERY_DESCRIPTOR_FORMAT);
    expect(() => parseSignedRecoveryDescriptor({ ...d, format: "nope" })).toThrow();
    expect(() => parseSignedRecoveryDescriptor({ ...d, descriptorVersion: RECOVERY_DESCRIPTOR_VERSION + 1 })).toThrow();
  });
});
