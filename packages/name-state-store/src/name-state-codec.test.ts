import { describe, expect, it } from "vitest";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import type { NameStateRecord } from "./record.js";
import { encodeNameStateRecord, decodeNameStateRecord } from "./name-state-codec.js";

const NAME = "alice";
const LEAF = sha256Hex(utf8ToBytes(NAME)); // the §2a invariant: leafKeyHex === H(canonicalName)

const VALID: NameStateRecord = {
  canonicalName: NAME,
  leafKeyHex: LEAF,
  owner: { kind: "owner-key", ownerPubkeyHex: "1".repeat(64) },
  batchLocalIndex: 0,
  anchoredRoot: "7".repeat(64),
  anchor: { txid: "b".repeat(64), minedHeight: 170, txIndex: 0, vout: 1 },
  firstServableHeight: 170,
  trace: [
    { step: "inclusion", ok: true, reason: "ok" },
    { step: "verdict", ok: true, reason: "accept", evidence: { firstServableHeight: 170, servedCount: 1 } },
  ],
};

/** A deep clone so a test mutation never leaks into the shared VALID fixture. */
function clone(): NameStateRecord {
  return JSON.parse(JSON.stringify(VALID)) as NameStateRecord;
}

describe("name-state codec", () => {
  it("round-trips a valid record through encode→JSON→decode (incl. trace evidence)", () => {
    const onDisk = JSON.parse(JSON.stringify(encodeNameStateRecord(VALID)));
    expect(decodeNameStateRecord(onDisk)).toEqual(VALID);
  });

  it("encode produces exactly the contract fields (no extras leak to disk)", () => {
    expect(Object.keys(encodeNameStateRecord(VALID)).sort()).toEqual(
      ["anchor", "anchoredRoot", "batchLocalIndex", "canonicalName", "firstServableHeight", "leafKeyHex", "owner", "trace"],
    );
  });

  it("encode fails closed on an extra runtime key (poison record)", () => {
    const poisoned = { ...clone(), surprise: "nope" } as unknown as NameStateRecord;
    expect(() => encodeNameStateRecord(poisoned)).toThrow(/cannot encode name-state record/);
  });

  it("encode fails closed on a non-finite evidence number (poison record)", () => {
    const bad = clone();
    (bad.trace as { evidence?: Record<string, unknown> }[])[1].evidence = { servedCount: Number.POSITIVE_INFINITY };
    expect(() => encodeNameStateRecord(bad as unknown as NameStateRecord)).toThrow(/finite number/);
  });

  describe("decode fails closed", () => {
    const cases: ReadonlyArray<readonly [string, unknown]> = [
      ["not an object", 42],
      ["null", null],
      ["an array", []],
      ["a missing top-level key", (() => { const r = clone() as Record<string, unknown>; delete r.owner; return r; })()],
      ["an extra top-level key", { ...clone(), extra: 1 }],
      ["empty canonicalName", { ...clone(), canonicalName: "" }],
      ["a non-canonical name (uppercase) — reject-don't-normalize", { ...clone(), canonicalName: "Alice" }],
      ["non-hex leafKeyHex", { ...clone(), leafKeyHex: "z".repeat(64) }],
      ["a leafKeyHex that is not H(name)", { ...clone(), leafKeyHex: "b".repeat(64) }],
      ["uppercase hex anchoredRoot (reject-don't-normalize)", { ...clone(), anchoredRoot: "A".repeat(64) }],
      ["negative batchLocalIndex", { ...clone(), batchLocalIndex: -1 }],
      ["non-integer firstServableHeight", { ...clone(), firstServableHeight: 1.5 }],
      ["wrong owner.kind", { ...clone(), owner: { kind: "owner-commitment", ownerPubkeyHex: "1".repeat(64) } }],
      ["bad owner.ownerPubkeyHex", { ...clone(), owner: { kind: "owner-key", ownerPubkeyHex: "1".repeat(63) } }],
      ["anchor missing vout", { ...clone(), anchor: { txid: "b".repeat(64), minedHeight: 1, txIndex: 0 } }],
      ["anchor bad txid", { ...clone(), anchor: { txid: "x", minedHeight: 1, txIndex: 0, vout: 0 } }],
      ["trace not an array", { ...clone(), trace: {} }],
      ["empty trace", { ...clone(), trace: [] }],
      ["trace step missing reason", { ...clone(), trace: [{ step: "inclusion", ok: true }] }],
      ["trace step extra key", { ...clone(), trace: [{ step: "x", ok: true, reason: "r", junk: 1 }] }],
      ["trace step ok not boolean", { ...clone(), trace: [{ step: "x", ok: "yes", reason: "r" }] }],
      ["evidence not an object", { ...clone(), trace: [{ step: "x", ok: true, reason: "r", evidence: [] }] }],
      ["evidence value not string|number", { ...clone(), trace: [{ step: "x", ok: true, reason: "r", evidence: { k: true } }] }],
      ["evidence value null (a non-finite number serialized through JSON)", { ...clone(), trace: [{ step: "x", ok: true, reason: "r", evidence: { k: null } }] }],
    ];
    for (const [label, value] of cases) {
      it(`rejects ${label}`, () => {
        expect(() => decodeNameStateRecord(value)).toThrow(/invalid encoded name-state record/);
      });
    }
  });
});
