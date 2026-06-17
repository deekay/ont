import { describe, expect, it } from "vitest";
import { signValueRecord, verifyValueRecord } from "@ont/protocol";

import {
  deriveOwnerPubkey,
  payloadUtf8ToHex,
  signBrowserValueRecord,
  verifyBrowserValueRecord
} from "../src/browser-value-record.js";

describe("browser value record helpers", () => {
  it("derives the same x-only owner pubkey as the protocol signer", () => {
    const ownerPrivateKeyHex = "0000000000000000000000000000000000000000000000000000000000000001";

    expect(deriveOwnerPubkey(ownerPrivateKeyHex)).toBe(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"
    );
  });

  it("matches the protocol signer for utf8 payloads", () => {
    const input = {
      name: "alice",
      ownerPrivateKeyHex: "0000000000000000000000000000000000000000000000000000000000000001",
      ownershipRef: "aa".repeat(32),
      sequence: 3,
      previousRecordHash: "bb".repeat(32),
      valueType: 0x02,
      payloadHex: payloadUtf8ToHex("https://example.com/alice"),
      issuedAt: "2026-03-29T16:00:00.000Z"
    };

    const browserRecord = signBrowserValueRecord(input);
    const protocolRecord = signValueRecord(input);

    expect({
      ...browserRecord,
      signature: undefined
    }).toEqual({
      ...protocolRecord,
      signature: undefined
    });
    expect(verifyValueRecord(browserRecord)).toBe(true);
    expect(verifyValueRecord(protocolRecord)).toBe(true);
    expect(verifyBrowserValueRecord(browserRecord)).toBe(true);
  });

  it("matches the protocol signer for raw hex payloads", () => {
    const input = {
      name: "bob",
      ownerPrivateKeyHex: "0000000000000000000000000000000000000000000000000000000000000002",
      ownershipRef: "cc".repeat(32),
      sequence: 7,
      previousRecordHash: "dd".repeat(32),
      valueType: 0xff,
      payloadHex: "deadbeef",
      issuedAt: "2026-03-29T16:00:00.000Z"
    };

    const browserRecord = signBrowserValueRecord(input);
    const protocolRecord = signValueRecord(input);

    expect({
      ...browserRecord,
      signature: undefined
    }).toEqual({
      ...protocolRecord,
      signature: undefined
    });
    expect(verifyValueRecord(browserRecord)).toBe(true);
    expect(verifyValueRecord(protocolRecord)).toBe(true);
    expect(verifyBrowserValueRecord(browserRecord)).toBe(true);
  });
});
