// LE-RESOLVE-1 battery — the resolver's enforced name-state read firewall (projectServedNameState). Pure, total,
// fail-closed, recompute-don't-trust: it serves an indexer-produced NameStateRecord ONLY when its FULL §2a
// integrity independently re-verifies (via the same strict codec the store uses on disk) AND it is the name asked
// for; it stamps every serve not-ownership-authority. A corrupt mirror — including a buggy/hostile source that
// returns a name/leaf-valid record with malformed batchLocalIndex / anchoredRoot / anchor / firstServableHeight /
// trace — is rejected as a served-error, never served as valid-but-corrupt enforced state.
import { describe, expect, it } from "vitest";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import type { NameStateRecord, NameStateAnchorCoords, NameStateTraceStep, NameStateProofBundle } from "@ont/name-state-store";
import { projectServedNameState } from "./serve-name-state.js";

const NAME = "alice"; // canonical (lowercase)
const OWNER = "22".repeat(32); // matches the proof bundle's committed owner
const leafKeyOf = (name: string): string => sha256Hex(utf8ToBytes(name));
const ANCHORED_ROOT = "f93b90c055208630762382e331ef07f3be22df520a7ab7e4ff54707b599839b8";
const ANCHOR_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const PROOF_BUNDLE: NameStateProofBundle = {
  format: "ont-proof-bundle",
  bundleVersion: 0,
  proofSource: "accumulator_batch_claim",
  assuranceTier: "accumulator-batched",
  verificationGoal: "adapter-resolver served proof-bundle fixture",
  name: NAME,
  normalizedName: NAME,
  ownershipProof: { currentOwnerPubkey: OWNER, ownershipRef: "accumulator-leaf:alice" },
  accumulatorProof: {
    root: ANCHORED_ROOT,
    leaf: leafKeyOf(NAME),
    value: OWNER,
    siblings: [
      { level: 1, hash: "7a4ab456e0112c950c4f443951f713667438075e48fb9ec2b6613d81385ab8ca" },
      { level: 2, hash: "5530fccbd45e1da9514e57a90a83f74aafbfb7820c005a69a9688f5a3ac2c485" },
    ],
  },
  batchAnchor: { anchorTxid: ANCHOR_TXID, anchorHeight: 170 },
  bitcoinInclusion: {
    anchors: [
      {
        txid: ANCHOR_TXID,
        height: 170,
        blockHeaderHex:
          "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70",
        merkle: ["b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082"],
        pos: 1,
      },
    ],
  },
};

function proofBundle(over: Partial<NameStateProofBundle> = {}): NameStateProofBundle {
  return JSON.parse(JSON.stringify({ ...PROOF_BUNDLE, ...over })) as NameStateProofBundle;
}

function validRecord(over: Partial<NameStateRecord> = {}): NameStateRecord {
  return {
    canonicalName: NAME,
    leafKeyHex: leafKeyOf(NAME),
    owner: { kind: "owner-key", ownerPubkeyHex: OWNER },
    batchLocalIndex: 0,
    anchoredRoot: ANCHORED_ROOT,
    anchor: { txid: ANCHOR_TXID, minedHeight: 170, txIndex: 1, vout: 0 },
    firstServableHeight: 170,
    trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
    proofBundle: proofBundle(),
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
    expect(r.anchoredRoot).toBe(ANCHORED_ROOT);
    expect(r.anchor).toEqual({ txid: ANCHOR_TXID, minedHeight: 170, txIndex: 1, vout: 0 });
    expect(r.firstServableHeight).toBe(170);
    expect(r.trace).toEqual([{ step: "verdict", ok: true, reason: "batched-claim-accepted" }]);
    expect(r.proofBundle).toEqual(PROOF_BUNDLE);
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

  it("a record whose proof bundle is missing bitcoinInclusion rejects invalid-record", () => {
    const missing = proofBundle();
    delete (missing as Record<string, unknown>).bitcoinInclusion;
    expect(projectServedNameState({ name: NAME, record: validRecord({ proofBundle: missing }) })).toEqual({
      ok: false,
      reason: "invalid-record",
    });
  });

  it("a record whose proof bundle has malformed inclusion rejects invalid-record", () => {
    const malformed = proofBundle({
      bitcoinInclusion: { anchors: [{ ...(PROOF_BUNDLE.bitcoinInclusion as { anchors: Record<string, unknown>[] }).anchors[0]!, merkle: ["00".repeat(32)] }] },
    });
    expect(projectServedNameState({ name: NAME, record: validRecord({ proofBundle: malformed }) })).toEqual({
      ok: false,
      reason: "invalid-record",
    });
  });

  it("a record whose otherwise valid proof bundle is not bound to its anchoredRoot rejects invalid-record", () => {
    expect(projectServedNameState({ name: NAME, record: validRecord({ anchoredRoot: "8".repeat(64) }) })).toEqual({
      ok: false,
      reason: "invalid-record",
    });
  });

  it.each([
    ["name", { canonicalName: "bob", leafKeyHex: leafKeyOf("bob") }],
    ["owner", { owner: { kind: "owner-key" as const, ownerPubkeyHex: "33".repeat(32) } }],
    ["batch anchor txid", { anchor: { txid: "c".repeat(64), minedHeight: 170, txIndex: 1, vout: 0 } }],
    ["batch anchor height", { anchor: { txid: ANCHOR_TXID, minedHeight: 171, txIndex: 1, vout: 0 } }],
    ["bitcoin inclusion tx position", { anchor: { txid: ANCHOR_TXID, minedHeight: 170, txIndex: 2, vout: 0 } }],
  ] satisfies readonly (readonly [string, Partial<NameStateRecord>])[])(
    "a record whose otherwise valid proof bundle is not bound to its %s rejects invalid-record",
    (_label, over) => {
      expect(projectServedNameState({ name: String(over.canonicalName ?? NAME), record: validRecord(over) })).toEqual({
        ok: false,
        reason: "invalid-record",
      });
    },
  );

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
