// LE-RESOLVE-1 battery — the resolver's enforced name-state read firewall (projectServedNameState). Pure, total,
// fail-closed, recompute-don't-trust: it serves an indexer-produced NameStateRecord ONLY when the §2a integrity
// bindings independently re-verify, and stamps every serve not-ownership-authority. A corrupt mirror is rejected
// as a served-error, never served as valid-but-corrupt enforced state.
import { describe, expect, it } from "vitest";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import type { NameStateRecord } from "@ont/name-state-store";
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

  it("a null record (no enforced state for the name) is name-unknown", () => {
    expect(projectServedNameState({ name: NAME, record: null })).toEqual({ ok: false, reason: "name-unknown" });
  });

  it("a non-canonical stored name fails closed (never case-folded) — non-canonical-name", () => {
    const rec = validRecord({ canonicalName: "Alice", leafKeyHex: leafKeyOf("Alice") });
    expect(projectServedNameState({ name: "Alice", record: rec })).toEqual({ ok: false, reason: "non-canonical-name" });
  });

  it("a stored name that differs from the requested name is name-mismatch (reject-don't-normalize, exact match)", () => {
    // Requested with a different case: "alice" stored, "Alice" asked — no case-fold, so it does NOT serve.
    expect(projectServedNameState({ name: "Alice", record: validRecord() })).toEqual({ ok: false, reason: "name-mismatch" });
    // A different name entirely.
    expect(projectServedNameState({ name: "bob", record: validRecord() })).toEqual({ ok: false, reason: "name-mismatch" });
  });

  it("a leaf key that does not recompute from the canonical name is leaf-key-mismatch (§2a binding broken)", () => {
    const rec = validRecord({ leafKeyHex: "0".repeat(64) });
    expect(projectServedNameState({ name: NAME, record: rec })).toEqual({ ok: false, reason: "leaf-key-mismatch" });
  });

  it("a malformed owner (wrong kind / bad-length pubkey / missing) is invalid-owner", () => {
    const shortKey = validRecord({ owner: { kind: "owner-key", ownerPubkeyHex: "11" } });
    expect(projectServedNameState({ name: NAME, record: shortKey })).toEqual({ ok: false, reason: "invalid-owner" });
    const wrongKind = validRecord({ owner: { kind: "script" as unknown as "owner-key", ownerPubkeyHex: OWNER } });
    expect(projectServedNameState({ name: NAME, record: wrongKind })).toEqual({ ok: false, reason: "invalid-owner" });
    const noOwner = validRecord({ owner: null as unknown as NameStateRecord["owner"] });
    expect(projectServedNameState({ name: NAME, record: noOwner })).toEqual({ ok: false, reason: "invalid-owner" });
    const upperHex = validRecord({ owner: { kind: "owner-key", ownerPubkeyHex: "AA".repeat(32) } });
    expect(projectServedNameState({ name: NAME, record: upperHex })).toEqual({ ok: false, reason: "invalid-owner" });
  });

  it("an empty trace is empty-trace (a served record must carry its enforcement evidence path)", () => {
    expect(projectServedNameState({ name: NAME, record: validRecord({ trace: [] }) })).toEqual({ ok: false, reason: "empty-trace" });
  });

  it("is total — a structurally malformed record rejects, never throws", () => {
    const garbage = { canonicalName: 123 } as unknown as NameStateRecord;
    const r = projectServedNameState({ name: NAME, record: garbage });
    expect(r.ok).toBe(false);
  });
});
