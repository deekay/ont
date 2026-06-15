// D-PB conformance battery (B3_EVIDENCE_HARDENING.md §11 / E-PB1..E-PB5; FREE / structural,
// conforms to the kernel `verifyProofBundleStructure` / `verifyProofBundleAgainstBitcoin`).
// D-PB ASSEMBLES the `accumulator_batch_claim` bundle from already-built component witnesses
// (D-AM membership, D-BI inclusion, ownership + value-record chain) and is the verifier's
// inverse: a well-formed input round-trips GREEN through the resident verifiers, and any cheap
// assembly incoherence fails closed at build time — so the builder never emits a bundle the
// verifier would reject (§1 / E-ND1).
import {
  verifyProofBundleAgainstBitcoin,
  verifyProofBundleStructure,
  type BitcoinHeaderSource,
} from "@ont/consensus";
import {
  computeValueRecordHash,
  deriveOwnerPubkey,
  normalizeName,
  sha256Hex,
  signValueRecord,
  utf8ToBytes,
} from "@ont/protocol";
import { describe, expect, it } from "vitest";

import { buildBitcoinInclusion } from "./bitcoin-inclusion.js";
import { buildMembershipProof } from "./membership.js";
import {
  buildAccumulatorBatchClaimBundle,
  type BuildBatchClaimBundleInput,
} from "./proof-bundle-assembly.js";

// --- The real Bitcoin anchor (mainnet block 170, the first BTC payment): a real header with
// valid PoW and a real 2-tx Merkle branch. Reused from the kernel proof-bundle suite so the
// round-trip vectors verify against Bitcoin, not a mock. ---
const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const COINBASE_TXID = "b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082";
const PAYMENT_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const ANCHOR_HEIGHT = 170;

const headerSource: BitcoinHeaderSource = {
  headerHexAtHeight: (height) => (height === ANCHOR_HEIGHT ? BLOCK_170_HEADER : null),
};

// D-BI builds the inclusion from the real ordered block txids (chains D-BI → D-PB).
const inclusion = buildBitcoinInclusion({
  txid: PAYMENT_TXID,
  height: ANCHOR_HEIGHT,
  blockHeaderHex: BLOCK_170_HEADER,
  orderedBlockTxids: [COINBASE_TXID, PAYMENT_TXID],
});
const ANCHOR = { anchorTxid: PAYMENT_TXID, anchorHeight: ANCHOR_HEIGHT };

const NAME = "alice";
const LEAF = sha256Hex(utf8ToBytes(normalizeName(NAME))); // H("alice"), the membership leaf
const OWNER_SK = "11".repeat(32);
const OWNER = deriveOwnerPubkey(OWNER_SK); // real x-only pubkey, so value records sign/verify
const REF = "ab".repeat(32); // hex32 ownershipRef (required once a value-record chain attaches)
const OTHER_KEY = "aa".repeat(32);
const OTHER_VAL = "33".repeat(32);

const FULL = new Map([
  [OTHER_KEY, OTHER_VAL],
  [LEAF, OWNER],
]);
const membership = buildMembershipProof(FULL, LEAF); // rootHex, proof{keyHex:LEAF, value:OWNER, siblings}

// A 2-record value chain (CL: exercise previousRecordHash linkage, not just one record).
const rec1 = signValueRecord({
  name: NAME,
  ownerPrivateKeyHex: OWNER_SK,
  ownershipRef: REF,
  sequence: 1,
  previousRecordHash: null,
  valueType: 0,
  payloadHex: "00",
  issuedAt: "2026-06-01T00:00:00.000Z",
});
const rec2 = signValueRecord({
  name: NAME,
  ownerPrivateKeyHex: OWNER_SK,
  ownershipRef: REF,
  sequence: 2,
  previousRecordHash: computeValueRecordHash(rec1),
  valueType: 0,
  payloadHex: "01",
  issuedAt: "2026-06-02T00:00:00.000Z",
});

const baseInput = (over: Partial<BuildBatchClaimBundleInput> = {}): BuildBatchClaimBundleInput => ({
  name: NAME,
  assuranceTier: "accumulator-batched",
  verificationGoal: "Verify alice's batched accumulator claim is Bitcoin-anchored.",
  ownership: { currentOwnerPubkey: OWNER, ownershipRef: REF },
  membership,
  anchor: ANCHOR,
  inclusion,
  valueRecords: [rec1, rec2],
  ...over,
});

describe("D-PB proof-bundle assembly (B3; structural, conforms to the kernel verifier)", () => {
  it("pb.assembles-valid (E-PB1): the assembled bundle round-trips green through structure + against-Bitcoin", () => {
    const bundle = buildAccumulatorBatchClaimBundle(baseInput());
    expect(bundle.valueRecordChain?.records.length).toBe(2); // 2-record chain placed

    const structure = verifyProofBundleStructure(bundle);
    expect(structure.valid).toBe(true);
    expect(structure.failedCheckCount).toBe(0);

    const report = verifyProofBundleAgainstBitcoin(bundle, { headerSource });
    expect(report.valid).toBe(true);
    expect(report.failedCheckCount).toBe(0);
    expect(report.checks.some((c) => c.id === "btc.cited.0.verified" && c.status === "passed")).toBe(true);
  });

  it("pb.leaf-binds-name-owner (E-PB2): the assembled leaf is H(name) and value is the owner; mismatches fail closed", () => {
    const bundle = buildAccumulatorBatchClaimBundle(baseInput());
    expect(bundle.accumulatorProof.leaf).toBe(LEAF);
    expect(bundle.accumulatorProof.value).toBe(OWNER);

    // A proof bound to a different key than H("alice") cannot be assembled into alice's bundle.
    const wrongLeaf = buildMembershipProof(FULL, OTHER_KEY); // keyHex = OTHER_KEY != H("alice")
    expect(() => buildAccumulatorBatchClaimBundle(baseInput({ membership: wrongLeaf }))).toThrow(
      /leaf|name|bind/,
    );

    // A claim whose owner is not the value the proof commits fails closed (no-false-accept).
    expect(() =>
      buildAccumulatorBatchClaimBundle(
        baseInput({ ownership: { currentOwnerPubkey: "44".repeat(32), ownershipRef: REF } }),
      ),
    ).toThrow(/owner|value|commit/);
  });

  it("pb.anchor-coherence (E-PB2): the cited anchor txid AND height must both match the embedded inclusion", () => {
    // Wrong height (the resident structure check only requires anchorHeight to EXIST).
    expect(() =>
      buildAccumulatorBatchClaimBundle(baseInput({ anchor: { anchorTxid: PAYMENT_TXID, anchorHeight: 171 } })),
    ).toThrow(/height|anchor|inclusion/);
    // Wrong txid (against-Bitcoin cites the anchor by txid).
    expect(() =>
      buildAccumulatorBatchClaimBundle(baseInput({ anchor: { anchorTxid: "ab".repeat(32), anchorHeight: ANCHOR_HEIGHT } })),
    ).toThrow(/txid|anchor|inclusion/);
  });

  it("pb.structure-vs-bitcoin (E-PB3): a bundle assembled without an inclusion is structural-only, not Bitcoin-settled", () => {
    const bundle = buildAccumulatorBatchClaimBundle(baseInput({ inclusion: undefined }));
    expect(bundle.bitcoinInclusion).toBeUndefined();
    expect(verifyProofBundleStructure(bundle).valid).toBe(true); // structurally valid

    const report = verifyProofBundleAgainstBitcoin(bundle);
    expect(report.valid).toBe(false); // but not Bitcoin-settled
    expect(report.checks).toContainEqual({
      id: "btc.inclusion.present",
      status: "failed",
      message: "bundle carries Bitcoin inclusion proofs (bitcoinInclusion.anchors)",
    });
  });

  it("pb.tamper-fails-right-check (E-PB4): tampering the assembled bundle flips the targeted check to failed (E-ND1)", () => {
    // Hostile assembly ≡ no-witness acceptance effect: tamper a built bundle and the verifier
    // rejects it. Assert valid=false and that the TARGETED check is AMONG the failures —
    // diagnostics may cascade (an owner-value tamper can also break related checks).
    const ownerTamper = JSON.parse(JSON.stringify(buildAccumulatorBatchClaimBundle(baseInput()))) as Record<
      string,
      unknown
    >;
    (ownerTamper.accumulatorProof as Record<string, unknown>).value = "55".repeat(32); // != claimed owner
    const ownerReport = verifyProofBundleStructure(ownerTamper);
    expect(ownerReport.valid).toBe(false);
    expect(ownerReport.checks.some((c) => c.id === "accumulator.value.bindsOwner" && c.status === "failed")).toBe(true);

    const merkleTamper = JSON.parse(JSON.stringify(buildAccumulatorBatchClaimBundle(baseInput()))) as Record<
      string,
      unknown
    >;
    const anchors = (merkleTamper.bitcoinInclusion as { anchors: Record<string, unknown>[] }).anchors;
    anchors[0]!.merkle = ["00".repeat(32)]; // break the Merkle branch
    const merkleReport = verifyProofBundleAgainstBitcoin(merkleTamper, { headerSource });
    expect(merkleReport.valid).toBe(false);
    expect(merkleReport.checks.some((c) => c.id === "btc.0.inclusion" && c.status === "failed")).toBe(true);
  });

  it("pb.value-record-coherence (E-PB5): value records must belong to the claimed owner and chain in order", () => {
    // A record signed by a different key than the claimed owner fails closed at assembly.
    const foreign = signValueRecord({
      name: NAME,
      ownerPrivateKeyHex: "22".repeat(32),
      ownershipRef: REF,
      sequence: 1,
      previousRecordHash: null,
      valueType: 0,
      payloadHex: "00",
      issuedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(() => buildAccumulatorBatchClaimBundle(baseInput({ valueRecords: [foreign] }))).toThrow(/owner|record/);

    // A second record whose previousRecordHash does not chain to the first fails closed.
    const badChain = signValueRecord({
      name: NAME,
      ownerPrivateKeyHex: OWNER_SK,
      ownershipRef: REF,
      sequence: 2,
      previousRecordHash: "00".repeat(32), // not H(rec1)
      valueType: 0,
      payloadHex: "01",
      issuedAt: "2026-06-02T00:00:00.000Z",
    });
    expect(() => buildAccumulatorBatchClaimBundle(baseInput({ valueRecords: [rec1, badChain] }))).toThrow(
      /chain|previousRecordHash|previous/,
    );
  });
});
