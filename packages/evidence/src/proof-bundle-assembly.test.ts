// D-PB conformance battery (B3_EVIDENCE_HARDENING.md §11 / E-PB1..E-PB5; structural,
// conforms to the kernel `verifyProofBundleStructure` / `verifyProofBundleAgainstBitcoin`).
// D-PB ASSEMBLES the `accumulator_batch_claim` bundle from verified component witnesses
// (D-AM membership, D-BI inclusion, D-SB-avail availability) and is the verifier's inverse:
// a well-formed input round-trips GREEN, and any cross-section incoherence fails closed at
// assembly — the builder can never emit a bundle the verifier would reject (§1).
//
// Tests-first RED battery: positives fail against the slice stub (it throws the sentinel
// before returning a bundle); negatives assert the SPECIFIC fail-closed message (not the
// stub sentinel), so the whole battery is red until the assembly + gates land.
import {
  verifyProofBundleAgainstBitcoin,
  verifyProofBundleStructure,
} from "@ont/consensus";
import {
  accumulatorRootOf,
  deriveOwnerPubkey,
  normalizeName,
  sha256Hex,
  signValueRecord,
  utf8ToBytes,
} from "@ont/protocol";
import { describe, expect, it } from "vitest";

import { buildBitcoinInclusion } from "./bitcoin-inclusion.js";
import { buildMembershipProof, buildNonMembershipProof } from "./membership.js";
import { verifyAvailabilityHeight } from "./served-availability.js";
import type { ServedLeaf } from "./served-bytes.js";
import {
  assembleBatchClaimProofBundle,
  type BatchClaimProofBundleInput,
} from "./proof-bundle-assembly.js";

// --- The real Bitcoin anchor (mainnet block 170, the first BTC payment): a real header
// with valid PoW and a real 2-tx Merkle branch. Reused from the kernel proof-bundle suite
// so the round-trip green vectors verify against Bitcoin, not a mock. ---
const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const COINBASE_TXID = "b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082";
const PAYMENT_TXID = "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";
const ANCHOR_HEIGHT = 170;

// D-BI builds the inclusion from the real ordered block txids (chains D-BI → D-PB).
const inclusion = buildBitcoinInclusion({
  txid: PAYMENT_TXID,
  height: ANCHOR_HEIGHT,
  blockHeaderHex: BLOCK_170_HEADER,
  orderedBlockTxids: [COINBASE_TXID, PAYMENT_TXID],
});

const NAME = "alice";
const LEAF = sha256Hex(utf8ToBytes(normalizeName(NAME))); // H("alice"), the membership leaf
const OWNER = "22".repeat(32); // owner value commitment (arbitrary bytes; no value-record path)
const OTHER_KEY = "aa".repeat(32);
const OTHER_VAL = "11".repeat(32);

// Non-genesis batch: base = {OTHER}, this batch's delta = {alice -> OWNER}.
const BASE = new Map([[OTHER_KEY, OTHER_VAL]]);
const FULL = new Map([
  [OTHER_KEY, OTHER_VAL],
  [LEAF, OWNER],
]);
const PREV_ROOT = accumulatorRootOf(BASE);
const ANCHORED_ROOT = accumulatorRootOf(FULL);
const DELTA: ServedLeaf[] = [{ keyHex: LEAF, valueHex: OWNER }];
const BINDING = { anchorHeight: ANCHOR_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT };

// D-SB-avail mints the branded first-servable height (= confirmed anchor mined height h).
const availability = verifyAvailabilityHeight({
  baseLeaves: BASE,
  servedDelta: DELTA,
  binding: BINDING,
  confirmedAnchorMinedHeight: ANCHOR_HEIGHT,
});
// D-AM builds the membership proof folding to the anchored/served root.
const membership = buildMembershipProof(FULL, LEAF);

const baseInput = (over: Partial<BatchClaimProofBundleInput> = {}): BatchClaimProofBundleInput => ({
  name: NAME,
  assuranceTier: "accumulator-batched",
  verificationGoal: "Verify alice's batched accumulator claim is Bitcoin-anchored.",
  ownership: { currentOwnerPubkey: OWNER, ownershipRef: "accumulator-leaf:alice" },
  membership,
  inclusion,
  availability,
  ...over,
});

describe("D-PB proof-bundle assembly (B3; structural, conforms to the kernel verifier)", () => {
  it("E-PB1: the assembled bundle round-trips green through structure + against-Bitcoin", () => {
    const bundle = assembleBatchClaimProofBundle(baseInput());
    expect(verifyProofBundleStructure(bundle).valid).toBe(true);
    const report = verifyProofBundleAgainstBitcoin(bundle);
    expect(report.valid).toBe(true);
    expect(report.failedCheckCount).toBe(0);
    // the cited batch anchor has a verified Bitcoin inclusion (PoW + Merkle).
    expect(report.checks.some((c) => c.id === "btc.cited.0.verified" && c.status === "passed")).toBe(true);
  });

  it("E-PB2: the stamped anchor height IS the branded VerifiedAvailabilityHeight (the §5.2 tightening)", () => {
    const bundle = assembleBatchClaimProofBundle(baseInput());
    // The ONLY height that reaches the bundle is the D-SB-avail-minted one...
    expect(bundle.batchAnchor.anchorHeight).toBe(availability.firstServableHeight);
    expect(bundle.batchAnchor.anchorHeight).toBe(ANCHOR_HEIGHT);
    // ...and the D-BI inclusion + cited anchor are for that SAME anchor.
    expect(bundle.bitcoinInclusion.anchors[0]!.height).toBe(availability.firstServableHeight);
    expect(bundle.batchAnchor.anchorTxid).toBe(inclusion.txid);
  });

  it("E-PB2: a D-BI inclusion for a different anchor height than the minted height fails closed", () => {
    // The served bytes minted h=170, but the supplied inclusion is for a different anchor —
    // the builder must not stitch a mismatched inclusion onto the minted height.
    const otherInclusion = { ...inclusion, height: 171 };
    expect(() => assembleBatchClaimProofBundle(baseInput({ inclusion: otherInclusion }))).toThrow(
      /height|anchor|inclusion/,
    );
  });

  it("E-PB3: a membership proof whose root is not the anchored/served root fails closed", () => {
    // A proof against a DIFFERENT committed set (different root) does not bind to this batch.
    const otherFull = new Map([
      [OTHER_KEY, OTHER_VAL],
      [LEAF, OWNER],
      ["cc".repeat(32), "33".repeat(32)],
    ]);
    const otherMembership = buildMembershipProof(otherFull, LEAF); // root != ANCHORED_ROOT
    expect(() => assembleBatchClaimProofBundle(baseInput({ membership: otherMembership }))).toThrow(
      /root|anchoredRoot|served/,
    );
  });

  it("E-PB3: a membership value that does not commit to the claimed owner fails closed", () => {
    // The proof commits value=OWNER, but the bundle claims a different owner — assembling
    // it would bless an owner the proof does not prove (no-false-accept).
    expect(() =>
      assembleBatchClaimProofBundle(
        baseInput({ ownership: { currentOwnerPubkey: "33".repeat(32), ownershipRef: "accumulator-leaf:alice" } }),
      ),
    ).toThrow(/owner|value|commit/);
  });

  it("E-PB3: a non-membership proof (no member value) cannot back an ownership claim", () => {
    const absentLeaf = sha256Hex(utf8ToBytes(normalizeName("bob")));
    const nonMember = buildNonMembershipProof(FULL, absentLeaf); // value === null
    expect(() => assembleBatchClaimProofBundle(baseInput({ membership: nonMember }))).toThrow(
      /non-membership|member|value|absent/,
    );
  });

  it("E-PB3: a membership proof bound to the wrong name leaf fails closed", () => {
    // Both leaves commit to OWNER, so owner-coherence holds and ONLY the leaf-binding gate
    // can fire: the supplied proof is for OTHER_KEY, not H("alice").
    const sameOwnerFull = new Map([
      [LEAF, OWNER],
      [OTHER_KEY, OWNER],
    ]);
    const wrongLeaf = buildMembershipProof(sameOwnerFull, OTHER_KEY); // leaf = OTHER_KEY != H("alice")
    const sameOwnerAvail = verifyAvailabilityHeight({
      baseLeaves: new Map([[LEAF, OWNER]]),
      servedDelta: [{ keyHex: OTHER_KEY, valueHex: OWNER }],
      binding: {
        anchorHeight: ANCHOR_HEIGHT,
        prevRoot: accumulatorRootOf(new Map([[LEAF, OWNER]])),
        anchoredRoot: accumulatorRootOf(sameOwnerFull),
      },
      confirmedAnchorMinedHeight: ANCHOR_HEIGHT,
    });
    expect(() =>
      assembleBatchClaimProofBundle(baseInput({ membership: wrongLeaf, availability: sameOwnerAvail })),
    ).toThrow(/leaf|name|bind/);
  });

  // --- E-PB4: value-record chain placement (FLAGGED design point — see §11). The builder
  // places already-signed records (it NEVER signs), computing each recordHash, and gates
  // owner / ref coherence. Uses a real key so the kernel's signature + hash recompute pass. ---
  const VR_SK = "11".repeat(32);
  const VR_OWNER = deriveOwnerPubkey(VR_SK); // real x-only pubkey
  const VR_REF = "ab".repeat(32); // hex32 ownershipRef (required once a chain is attached)
  const VR_FULL = new Map([
    [OTHER_KEY, OTHER_VAL],
    [LEAF, VR_OWNER],
  ]);
  const vrMembership = buildMembershipProof(VR_FULL, LEAF);
  const vrAvailability = verifyAvailabilityHeight({
    baseLeaves: BASE,
    servedDelta: [{ keyHex: LEAF, valueHex: VR_OWNER }],
    binding: { anchorHeight: ANCHOR_HEIGHT, prevRoot: PREV_ROOT, anchoredRoot: accumulatorRootOf(VR_FULL) },
    confirmedAnchorMinedHeight: ANCHOR_HEIGHT,
  });
  const vrRecord = signValueRecord({
    name: NAME,
    ownerPrivateKeyHex: VR_SK,
    ownershipRef: VR_REF,
    sequence: 1,
    previousRecordHash: null,
    valueType: 0,
    payloadHex: "00",
    issuedAt: "2026-06-01T00:00:00.000Z",
  });
  const vrInput = (over: Partial<BatchClaimProofBundleInput> = {}): BatchClaimProofBundleInput => ({
    name: NAME,
    assuranceTier: "accumulator-batched",
    verificationGoal: "Verify alice's batched accumulator claim with its value-record chain.",
    ownership: { currentOwnerPubkey: VR_OWNER, ownershipRef: VR_REF },
    membership: vrMembership,
    inclusion,
    availability: vrAvailability,
    valueRecords: [vrRecord],
    ...over,
  });

  it("E-PB4: a bundle assembled WITH a signed value-record chain round-trips green", () => {
    const bundle = assembleBatchClaimProofBundle(vrInput());
    expect(bundle.valueRecordChain?.records.length).toBe(1);
    expect(verifyProofBundleStructure(bundle).valid).toBe(true);
    expect(verifyProofBundleAgainstBitcoin(bundle).valid).toBe(true);
  });

  it("E-PB4: a value record whose owner key is not the claimed owner fails closed", () => {
    const foreign = signValueRecord({
      name: NAME,
      ownerPrivateKeyHex: "22".repeat(32),
      ownershipRef: VR_REF,
      sequence: 1,
      previousRecordHash: null,
      valueType: 0,
      payloadHex: "00",
      issuedAt: "2026-06-01T00:00:00.000Z",
    });
    expect(() => assembleBatchClaimProofBundle(vrInput({ valueRecords: [foreign] }))).toThrow(/owner|record/);
  });

  it("E-PB5: hostile equivalence — a bundle the builder refuses to assemble still fails the verifier (no false accept)", () => {
    // The owner/value mismatch the builder fails closed on (E-PB3) is ALSO rejected by the
    // kernel when hand-forged past assembly: forged evidence ≡ no-witness, fail-closed (§1).
    const forged = {
      format: "ont-proof-bundle",
      bundleVersion: 0,
      proofSource: "accumulator_batch_claim",
      assuranceTier: "accumulator-batched",
      verificationGoal: "forged: claim a different owner than the proof commits",
      name: NAME,
      normalizedName: NAME,
      ownershipProof: { currentOwnerPubkey: "33".repeat(32), ownershipRef: "accumulator-leaf:alice" },
      accumulatorProof: {
        root: membership.rootHex,
        leaf: membership.proof.keyHex,
        value: membership.proof.value, // commits OWNER, not the claimed "33..." owner
        siblings: membership.proof.siblings,
      },
      batchAnchor: { anchorTxid: inclusion.txid, anchorHeight: ANCHOR_HEIGHT },
      bitcoinInclusion: { anchors: [inclusion] },
    };
    const report = verifyProofBundleAgainstBitcoin(forged);
    expect(report.valid).toBe(false);
    expect(report.checks).toContainEqual({
      id: "accumulator.value.bindsOwner",
      status: "failed",
      message: "owner value commitment equals the claimed current owner pubkey",
    });
  });
});
