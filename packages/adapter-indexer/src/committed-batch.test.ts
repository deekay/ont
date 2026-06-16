import { describe, expect, it } from "vitest";
import { accumulatorRootOf, sha256Hex, utf8ToBytes } from "@ont/protocol";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import { enforceGateFee } from "@ont/claim-path";
import type { GateFeeSchedule } from "@ont/consensus";
import {
  buildCommittedBatchForRoot,
  type BuildCommittedBatchInput,
  type CommittedBatchEntry,
} from "./committed-batch.js";

// B4-INDEX-COMMIT red battery (B4_ADAPTERS_PLAN §9.6). The fee-critical committed-batch projection: every
// leaf is RECOMPUTED from the verified canonical name and the FULL set is bound to the anchored accumulator
// root, then piped into the REAL enforceGateFee — a lowered length / lying name / dropped leaf cannot price
// or mint. RED until the projection lands (the stub returns null).

const leafKeyOf = (name: string): string => sha256Hex(utf8ToBytes(name));

const OWNER_A = "11".repeat(32);
const OWNER_B = "33".repeat(32);
const BASE_VAL = "22".repeat(32);

// base = one pre-existing leaf; delta = the batch's two new leaves (alice + bobby), insert-only disjoint.
const baseLeaves = new Map<string, string>([[leafKeyOf("existing"), BASE_VAL]]);
const PREV_ROOT = accumulatorRootOf(baseLeaves);
const ENTRIES: readonly CommittedBatchEntry[] = [
  { name: "alice", ownerPubkey: OWNER_A },
  { name: "bobby", ownerPubkey: OWNER_B },
];
const fullLeaves = new Map<string, string>([
  ...baseLeaves,
  [leafKeyOf("alice"), OWNER_A],
  [leafKeyOf("bobby"), OWNER_B],
]);
const ANCHORED_ROOT = accumulatorRootOf(fullLeaves);

// the projection sorted by leafKeyHex (both names are 5 bytes → canonicalNameByteLength 5).
const EXPECTED_LEAVES = [
  { leafKeyHex: leafKeyOf("alice"), canonicalNameByteLength: 5 },
  { leafKeyHex: leafKeyOf("bobby"), canonicalNameByteLength: 5 },
].sort((a, b) => (a.leafKeyHex < b.leafKeyHex ? -1 : 1));

function validInput(over: Partial<BuildCommittedBatchInput> = {}): BuildCommittedBatchInput {
  return { anchoredRoot: ANCHORED_ROOT, batchSize: 2, baseLeaves, prevRoot: PREV_ROOT, batchEntries: ENTRIES, ...over };
}

// ---------- the synthetic fee-adequate anchor (I-FEE-A recipe) for the enforceGateFee pipe ----------
const DUMMY_TXID = "00".repeat(32);
function makeTx(outputs: readonly { valueSats: bigint; scriptPubKeyHex: string }[], salt: number): LegacyTransaction {
  return { version: 1, inputs: [{ prevoutTxid: DUMMY_TXID, prevoutVout: salt, scriptSigHex: "", sequence: 0xffffffff }], outputs, locktime: 0 };
}
const prevoutA = makeTx([{ valueSats: 5_000_000n, scriptPubKeyHex: "51" }], 0);
const prevoutB = makeTx([{ valueSats: 3_000_000n, scriptPubKeyHex: "51" }], 1);
const feeAnchorTx: LegacyTransaction = {
  version: 1,
  inputs: [prevoutA, prevoutB].map((p) => ({ prevoutTxid: legacyTxidOf(p)!, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff })),
  outputs: [{ valueSats: 7_000_000n, scriptPubKeyHex: "6a04deadbeef" }], // paidFee = 8M - 7M = 1M
  locktime: 0,
};
// gateOneByteSats 1M; long-name floor 100k. Two 5-byte names ⇒ Σ g = 200k ≤ 1M (adequate). A length=1
// reading would price 1M + 100k = 1.1M > 1M (underpaid) — so an admit proves the FULL length was used.
const SCHEDULE: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n };

function admitsFee(committedBatch: NonNullable<ReturnType<typeof buildCommittedBatchForRoot>>): boolean {
  const { verdict } = enforceGateFee({
    confirmedAnchor: { anchorTxid: legacyTxidOf(feeAnchorTx)!, minedHeight: 800_000, anchoredRoot: committedBatch.anchoredRoot, batchSize: committedBatch.batchSize },
    committedBatch,
    feeWitness: { anchorTx: feeAnchorTx, prevoutTxs: [prevoutA, prevoutB], schedule: SCHEDULE },
  });
  return verdict.adequate;
}

describe("buildCommittedBatchForRoot — firewall-positive (verified projection feeds the REAL enforceGateFee)", () => {
  it("a valid base + batch → the recomputed projection, which enforceGateFee ADMITS", () => {
    const r = buildCommittedBatchForRoot(validInput());
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r).toEqual({ anchoredRoot: ANCHORED_ROOT, batchSize: 2, leaves: EXPECTED_LEAVES });
    expect(admitsFee(r)).toBe(true);
  });

  it("canonicalNameByteLength is recomputed from the verified name — a riding side-channel field is ignored", () => {
    // an entry carrying a fee-looking canonicalNameByteLength: 1 must NOT be read; the projected length is 5.
    const entries = [
      { name: "alice", ownerPubkey: OWNER_A, canonicalNameByteLength: 1 } as unknown as CommittedBatchEntry,
      { name: "bobby", ownerPubkey: OWNER_B },
    ];
    const r = buildCommittedBatchForRoot(validInput({ batchEntries: entries }));
    expect(r).not.toBeNull();
    if (r === null) return;
    const alice = r.leaves.find((l) => l.leafKeyHex === leafKeyOf("alice"));
    expect(alice?.canonicalNameByteLength).toBe(5); // recomputed, not the side-channel 1
    expect(admitsFee(r)).toBe(true); // priced at the FULL length (length-1 would underpay → reject)
  });

  it("projection is deterministic + order-independent (input permutation → byte-identical)", () => {
    const a = buildCommittedBatchForRoot(validInput());
    const b = buildCommittedBatchForRoot(validInput({ batchEntries: [...ENTRIES].reverse() }));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });
});

describe("buildCommittedBatchForRoot — firewall-negatives (no projection)", () => {
  it("non-canonical name bytes (W3: mixed-case) → null, not a projection for the lowercased name", () => {
    const r = buildCommittedBatchForRoot(validInput({ batchEntries: [{ name: "Alice", ownerPubkey: OWNER_A }, { name: "bobby", ownerPubkey: OWNER_B }] }));
    expect(r).toBeNull();
  });

  it("a lying name (H(name) not in the anchored accumulator) → root mismatch → null", () => {
    const r = buildCommittedBatchForRoot(validInput({ batchEntries: [{ name: "alice", ownerPubkey: OWNER_A }, { name: "carol", ownerPubkey: OWNER_B }] }));
    expect(r).toBeNull();
  });

  it("wrong batchSize (delta.size !== batchSize) → null (#52: Σ g over the FULL set)", () => {
    expect(buildCommittedBatchForRoot(validInput({ batchSize: 3 }))).toBeNull();
  });

  it("a base that does not verify to prevRoot → null (no trust of an unverified base)", () => {
    expect(buildCommittedBatchForRoot(validInput({ prevRoot: "ab".repeat(32) }))).toBeNull();
  });

  it("a non-32-byte / non-lowercase-hex ownerPubkey → null (no case-normalized mint)", () => {
    const upper = buildCommittedBatchForRoot(validInput({ batchEntries: [{ name: "alice", ownerPubkey: "AA".repeat(32) }, { name: "bobby", ownerPubkey: OWNER_B }] }));
    const short = buildCommittedBatchForRoot(validInput({ batchEntries: [{ name: "alice", ownerPubkey: "11".repeat(16) }, { name: "bobby", ownerPubkey: OWNER_B }] }));
    expect(upper).toBeNull();
    expect(short).toBeNull();
  });

  it("malformed base material (bad hex) → null, never an exception", () => {
    let r: ReturnType<typeof buildCommittedBatchForRoot> | undefined;
    expect(() => { r = buildCommittedBatchForRoot(validInput({ baseLeaves: new Map([["nothex", "alsobad"]]), prevRoot: "ab".repeat(32) })); }).not.toThrow();
    expect(r).toBeNull();
  });

  it("a delta leaf already in the base (non-disjoint) → null (insert-only)", () => {
    const r = buildCommittedBatchForRoot(validInput({ batchEntries: [{ name: "existing", ownerPubkey: OWNER_A }, { name: "alice", ownerPubkey: OWNER_B }] }));
    expect(r).toBeNull();
  });

  it("an internally duplicated committed name → null (internal uniqueness)", () => {
    const r = buildCommittedBatchForRoot(validInput({ batchEntries: [{ name: "alice", ownerPubkey: OWNER_A }, { name: "alice", ownerPubkey: OWNER_B }] }));
    expect(r).toBeNull();
  });

  it("never throws on bogus input", () => {
    expect(() => buildCommittedBatchForRoot(null as unknown as BuildCommittedBatchInput)).not.toThrow();
    expect(() => buildCommittedBatchForRoot(validInput({ baseLeaves: null as unknown as ReadonlyMap<string, string> }))).not.toThrow();
  });
});
