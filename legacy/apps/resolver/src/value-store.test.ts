import { describe, expect, it } from "vitest";

import {
  computeValueRecordHash,
  signValueRecord
} from "@ont/protocol";
import {
  countValueRecords,
  getValueRecordChain,
  parseValueRecordStoreSnapshot
} from "./value-store.js";

describe("value record store", () => {
  it("loads contiguous value-record chains", () => {
    const first = signValueRecord({
      name: "Alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 2,
      payloadHex: Buffer.from("https://example.com/a", "utf8").toString("hex"),
      issuedAt: "2026-04-15T12:00:00.000Z"
    });
    const second = signValueRecord({
      name: "Alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 2,
      previousRecordHash: computeValueRecordHash(first),
      valueType: 2,
      payloadHex: Buffer.from("https://example.com/b", "utf8").toString("hex"),
      issuedAt: "2026-04-15T12:01:00.000Z"
    });

    const store = parseValueRecordStoreSnapshot({
      chains: [
        {
          name: "alice",
          ownershipRef: "aa".repeat(32),
          records: [first, second]
        }
      ]
    });

    const chain = getValueRecordChain(store, "alice", "aa".repeat(32));

    expect(countValueRecords(store)).toBe(2);
    expect(chain?.records).toHaveLength(2);
    expect(chain?.records[1]?.previousRecordHash).toBe(computeValueRecordHash(first));
  });

  it("rejects chains with skipped sequences", () => {
    const first = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 2,
      payloadHex: "0011",
      issuedAt: "2026-04-15T12:00:00.000Z"
    });
    const skipped = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 3,
      previousRecordHash: computeValueRecordHash(first),
      valueType: 2,
      payloadHex: "0022",
      issuedAt: "2026-04-15T12:01:00.000Z"
    });

    expect(() =>
      parseValueRecordStoreSnapshot({
        chains: [
          {
            name: "alice",
            ownershipRef: "aa".repeat(32),
            records: [first, skipped]
          }
        ]
      })
    ).toThrow(/non-contiguous sequence/);
  });

  it("rejects chains with the wrong predecessor hash", () => {
    const first = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 2,
      payloadHex: "0011",
      issuedAt: "2026-04-15T12:00:00.000Z"
    });
    const badSecond = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 2,
      previousRecordHash: "ff".repeat(32),
      valueType: 2,
      payloadHex: "0022",
      issuedAt: "2026-04-15T12:01:00.000Z"
    });

    expect(() =>
      parseValueRecordStoreSnapshot({
        chains: [
          {
            name: "alice",
            ownershipRef: "aa".repeat(32),
            records: [first, badSecond]
          }
        ]
      })
    ).toThrow(/invalid predecessor hash/);
  });

  it("returns no value for a fresh ownership interval (a transfer orphans the prior chain)", () => {
    const prior = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 2,
      payloadHex: "0011",
      issuedAt: "2026-04-15T12:00:00.000Z"
    });
    const store = parseValueRecordStoreSnapshot({
      chains: [{ name: "alice", ownershipRef: "aa".repeat(32), records: [prior] }]
    });

    // After a transfer the name's ownershipRef changes; the new owner's interval
    // has no value yet, so the current value is null (the prior chain is orphaned).
    expect(getValueRecordChain(store, "alice", "bb".repeat(32))).toBeNull();
    // ...while the prior interval's chain is still addressable under its own ref.
    expect(getValueRecordChain(store, "alice", "aa".repeat(32))?.records).toHaveLength(1);
  });

  it("keeps ownership intervals separate even when the same owner regains the name later", () => {
    const firstInterval = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "aa".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 2,
      payloadHex: "0011",
      issuedAt: "2026-04-15T12:00:00.000Z"
    });
    const regainedInterval = signValueRecord({
      name: "alice",
      ownerPrivateKeyHex: "11".repeat(32),
      ownershipRef: "bb".repeat(32),
      sequence: 1,
      previousRecordHash: null,
      valueType: 2,
      payloadHex: "0022",
      issuedAt: "2026-04-15T13:00:00.000Z"
    });

    const store = parseValueRecordStoreSnapshot({
      chains: [
        {
          name: "alice",
          ownershipRef: "aa".repeat(32),
          records: [firstInterval]
        },
        {
          name: "alice",
          ownershipRef: "bb".repeat(32),
          records: [regainedInterval]
        }
      ]
    });

    expect(countValueRecords(store)).toBe(2);
    expect(getValueRecordChain(store, "alice", "aa".repeat(32))?.records).toHaveLength(1);
    expect(getValueRecordChain(store, "alice", "bb".repeat(32))?.records).toHaveLength(1);
    expect(
      getValueRecordChain(store, "alice", "bb".repeat(32))?.records[0]?.previousRecordHash
    ).toBeNull();
  });
});
