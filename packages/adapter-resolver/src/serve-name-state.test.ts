// LE-RESOLVE-1 battery — the resolver's enforced name-state read firewall (projectServedNameState). Pure, total,
// fail-closed, recompute-don't-trust: it serves an indexer-produced NameStateRecord ONLY when its FULL §2a
// integrity independently re-verifies (via the same strict codec the store uses on disk) AND it is the name asked
// for; it stamps every serve not-ownership-authority. A corrupt mirror — including a buggy/hostile source that
// returns a name/leaf-valid record with malformed batchLocalIndex / anchoredRoot / anchor / firstServableHeight /
// trace — is rejected as a served-error, never served as valid-but-corrupt enforced state.
import { describe, expect, it } from "vitest";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import type { NameStateRecord, NameStateAnchorCoords, NameStateTraceStep } from "@ont/name-state-store";
import { projectServedNameState } from "./serve-name-state.js";

const NAME = "alice"; // canonical (lowercase)
const OWNER = "11".repeat(32); // 64-hex x-only owner pubkey
const leafKeyOf = (name: string): string => sha256Hex(utf8ToBytes(name));

function validRecord(over: Partial<NameStateRecord> = {}): NameStateRecord {
  return {
    canonicalName: NAME,
    leafKeyHex: leafKeyOf(NAME),
    owner: { kind: "owner-key", ownerPubkeyHex: OWNER },
    batchLocalIndex: 0,
    anchoredRoot: "7".repeat(64),
    anchor: { txid: "b".repeat(64), minedHeight: 170, txIndex: 0, vout: 1 },
    firstServableHeight: 170,
    trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
    ...over,
  };
}

describe("projectServedNameState (LE-RESOLVE read firewall)", () => {
  it("serves a valid enforced record with not-ownership-authority stamps and the §2a fields", () => {
    const r = projectServedNameState({ name: NAME, record: validRecord() });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.provenance).toBe("resolver-indexed-mirror");
    expect(r.authority).toBe("not-ownership-authority");
    expect(r.canonicalName).toBe(NAME);
    expect(r.owner).toEqual({ kind: "owner-key", ownerPubkeyHex: OWNER });
    expect(r.leafKeyHex).toBe(leafKeyOf(NAME));
    expect(r.batchLocalIndex).toBe(0);
    expect(r.anchoredRoot).toBe("7".repeat(64));
    expect(r.anchor).toEqual({ txid: "b".repeat(64), minedHeight: 170, txIndex: 0, vout: 1 });
    expect(r.firstServableHeight).toBe(170);
    expect(r.trace).toEqual([{ step: "verdict", ok: true, reason: "batched-claim-accepted" }]);
  });

  it("a record with an extra own-key is rejected invalid-record (closed-shape codec, not silently served)", () => {
    const withExtra = { ...validRecord(), sneaky: "x" } as unknown as NameStateRecord;
    expect(projectServedNameState({ name: NAME, record: withExtra })).toEqual({ ok: false, reason: "invalid-record" });
  });

  it("a null record (no enforced state for the name) is name-unknown", () => {
    expect(projectServedNameState({ name: NAME, record: null })).toEqual({ ok: false, reason: "name-unknown" });
  });

  it("a valid record that is not the requested name is name-mismatch (reject-don't-normalize, exact match)", () => {
    // Requested with a different case: "alice" stored, "Alice" asked — no case-fold, so it does NOT serve.
    expect(projectServedNameState({ name: "Alice", record: validRecord() })).toEqual({ ok: false, reason: "name-mismatch" });
    // A different name entirely.
    expect(projectServedNameState({ name: "bob", record: validRecord() })).toEqual({ ok: false, reason: "name-mismatch" });
  });

  // The §2a integrity recheck (defense-in-depth): a name/leaf-valid record with ANY malformed field is rejected
  // invalid-record before it can be served — a buggy/hostile LR-2/LR-3 source cannot bypass the store codec.
  const malformed: Record<string, Partial<NameStateRecord>> = {
    "non-canonical name": { canonicalName: "Alice", leafKeyHex: leafKeyOf("Alice") },
    "leaf key that does not recompute": { leafKeyHex: "0".repeat(64) },
    "owner with a short pubkey": { owner: { kind: "owner-key", ownerPubkeyHex: "11" } },
    "owner with a non-owner-key kind": { owner: { kind: "script" as unknown as "owner-key", ownerPubkeyHex: OWNER } },
    "owner that is null": { owner: null as unknown as NameStateRecord["owner"] },
    "owner with uppercase hex": { owner: { kind: "owner-key", ownerPubkeyHex: "AA".repeat(32) } },
    "a negative batchLocalIndex": { batchLocalIndex: -1 },
    "a non-hex anchoredRoot": { anchoredRoot: "nothex" },
    "a null anchor": { anchor: null as unknown as NameStateAnchorCoords },
    "an out-of-range anchor.vout": { anchor: { txid: "b".repeat(64), minedHeight: 170, txIndex: 0, vout: -1 } },
    "an Infinite firstServableHeight": { firstServableHeight: Number.POSITIVE_INFINITY },
    "an empty trace": { trace: [] },
    "a null trace step": { trace: [null as unknown as NameStateTraceStep] },
    "a trace step with a non-finite evidence value": {
      trace: [{ step: "verdict", ok: true, reason: "x", evidence: { n: Number.POSITIVE_INFINITY } }],
    },
  };
  for (const [label, over] of Object.entries(malformed)) {
    it(`rejects ${label} as invalid-record (full §2a recheck, fail-closed)`, () => {
      expect(projectServedNameState({ name: NAME, record: validRecord(over) })).toEqual({ ok: false, reason: "invalid-record" });
    });
  }

  it("is total — a structurally malformed record rejects invalid-record, never throws", () => {
    const garbage = { canonicalName: 123 } as unknown as NameStateRecord;
    expect(projectServedNameState({ name: NAME, record: garbage })).toEqual({ ok: false, reason: "invalid-record" });
  });
});
