// B2 executable vector bindings — turning ready-for-binding conformance vectors into
// executable predicate assertions (the binding lane atop the loader spine in
// b2-vector-suite.test.ts). For each ready vector this loads the conformance JSON,
// constructs predicate inputs that realize its fixture scenario, and asserts the
// resident @ont/consensus predicate returns the vector's expected verdict — giving the
// SOFTWARE_CANON doc-cite -> test -> impl traceability per vector id.
//
// Family 1 (this file, pilot): DA-verdict (includable / holdsPriority) — the ready
// vectors D3/D4/D6/D13 from da-verdict.json. The remaining ready families
// (params: A3/D9/D12/G9; value-record: V*; engine: X*) follow as their own binding
// slices. The spine's pending-predicate / pending-dk vectors are NOT bound here.
//
// The assertion checks the predicate output against the vector's own expected.verdict
// (loaded from JSON), so a binding only passes if its realization faithfully matches the
// ratified vector — not against a hand-copied expectation.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  availabilityDeadlineHeight,
  challengeDeadlineHeight,
  confirmedRootEligible,
  createDaWindowParams,
} from "./params.js";
import { holdsPriority, includable, type AnchorFacts, type ServedEvidence } from "./da-verdict.js";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION,
  SEQUENCE_BOUND,
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  bytesToHex,
  hexToBytes,
  recoveryDescriptorDigest,
  valueRecordDigest,
} from "@ont/wire";
import { valueRecordAccept, type OwnershipInterval, type ValueRecordEnvelope } from "./value-record-authority.js";
import {
  createTransferPayload,
  deriveOwnerPubkey,
  encodeTransferPayload,
  signRecoverOwnerCancelAuthorization,
  signTransferAuthorization,
  type TransferAuthorizationFields,
  type TransferEventPayload,
} from "@ont/protocol";
import type {
  BitcoinTransactionInBlock,
  BitcoinTransactionInput,
  BitcoinTransactionOutput,
} from "@ont/bitcoin";
import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  type NameRecord,
  type OntState,
} from "./engine.js";

const vectorsDir = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/core/vectors");

interface ConformanceVector {
  id: string;
  ruleId: string;
  authorityTier: string;
  kind: string;
  expected: { verdict: string; reason: string };
  status: string;
}

// A vector for a given area file lives in either the vector-now dir (docs/core/vectors)
// or the ratified provisional-origin dir (docs/core/vectors/provisional) — the same two
// roots the loader spine reads. Search both for the id.
function loadVector(file: string, id: string): ConformanceVector {
  for (const rel of [file, join("provisional", file)]) {
    let arr: ConformanceVector[];
    try {
      arr = JSON.parse(readFileSync(join(vectorsDir, rel), "utf8")) as ConformanceVector[];
    } catch {
      continue;
    }
    const vector = arr.find((entry) => entry.id === id);
    if (vector !== undefined) {
      return vector;
    }
  }
  throw new Error(`vector ${id} not found in ${file} or provisional/${file}`);
}

// The ids this file binds to a resident predicate. This MUST stay a subset of the loader
// spine's ready-for-binding set (b2-vector-suite.test.ts `readyBindingTargetById`, which
// the spine independently validates is the correct 23). Adding an id here without a real
// resident predicate would re-open the hole the spine guards against; only add an id when
// its binding lands. The spine cannot be imported for a cross-check (a non-test src/*.ts
// trips the kernel manifest; importing its .test.ts would double-run its suites), so this
// local manifest is the agreed mirror (ChatLunatique review event dab9960b).
const LOCAL_BINDING_MANIFEST = new Set<string>([
  // DA-verdict family
  "D4-neg-01",
  "D3-pos-01",
  "D6-neg-01",
  "D13-pos-01",
  // params family (DA-window construction + h+K eligibility)
  "A3-neg-01",
  "D9-neg-01",
  "D12-neg-01",
  "G9-neg-01",
  // value-record family (valueRecordAccept)
  "V1-neg-01",
  "V3-neg-01",
  "V4-neg-01",
  "V6-neg-01",
  "V7-neg-01",
  "V8-neg-01",
  "V10-neg-01",
  "V11-pos-01",
  // engine-transfer family (applyBlockTransactions)
  "X2-neg-01",
  "X6-neg-01",
  "X6-neg-02",
  "X8-pos-01",
]);

// A binding may only execute a vector that is (a) locked, (b) required-tier
// (normative/ratified, never candidate/DK-gated), AND (c) in this file's binding manifest
// — so a required-but-pending-predicate vector (e.g. R1/B1/T1/Q10: ratified but with no
// resident predicate) can never execute just because it is ratified.
function assertBindable(vector: ConformanceVector): void {
  expect(vector.status, `${vector.id} must be locked`).toBe("locked");
  expect(["normative", "ratified"], `${vector.id} must be required-tier, not DK-gated`).toContain(
    vector.authorityTier
  );
  expect(
    LOCAL_BINDING_MANIFEST.has(vector.id),
    `${vector.id} is not in LOCAL_BINDING_MANIFEST — only ready-for-binding vectors (resident predicate) may execute`
  ).toBe(true);
}

const accepts = (vector: ConformanceVector): boolean => vector.expected.verdict === "accept";

// Maps a construction attempt to the vector's verdict vocabulary so the primary scenario
// is checked against the vector's OWN expected.verdict (not just `toThrow`): a triple that
// constructs is "accept", one that throws at construction is "reject".
function expectConstructionVerdict(vector: ConformanceVector, construct: () => unknown): void {
  let constructed = true;
  try {
    construct();
  } catch {
    constructed = false;
  }
  expect(constructed, `${vector.id}: construction outcome must equal expected.verdict`).toBe(accepts(vector));
}

// (K, W, C) = (6, 2, 3): availability deadline h+W = h+2, challenge deadline h+W+C = h+5.
const params = createDaWindowParams({ K: 6, W: 2, C: 3 });
const H = 1000;
const anchor: AnchorFacts = { minedHeight: H, anchoredRoot: "abcd", batchSize: 4 };
const servedAt = (firstServableHeight: number): ServedEvidence => ({
  anchorHeight: H,
  anchoredRoot: "abcd",
  batchSize: 4,
  firstServableHeight,
});

describe("B2 vector bindings — DA-verdict family (includable / holdsPriority)", () => {
  it("D4-neg-01: absent or commitment-mismatched served evidence is excluded (fail closed)", () => {
    const vector = loadVector("da-verdict.json", "D4-neg-01");
    assertBindable(vector);
    // Realize the fixture: (caseA) no evidence at all, and (caseB) evidence present but
    // not bound to the anchored (root, batchSize) commitment. Both must fail closed.
    expect(includable(anchor, null, params)).toBe(accepts(vector)); // accepts=false -> excluded
    const mismatched: ServedEvidence = { anchorHeight: H, anchoredRoot: "ffff", batchSize: 4, firstServableHeight: H };
    expect(includable(anchor, mismatched, params)).toBe(false);
  });

  it("D3-pos-01: served at the availability deadline h+W holds priority (inclusive)", () => {
    const vector = loadVector("da-verdict.json", "D3-pos-01");
    assertBindable(vector);
    expect(holdsPriority(anchor, servedAt(H + 2), params)).toBe(accepts(vector)); // h+W=1002, inclusive -> accept
  });

  it("D6-neg-01: served one block past h+W forfeits priority while staying includable", () => {
    const vector = loadVector("da-verdict.json", "D6-neg-01");
    assertBindable(vector);
    const evidence = servedAt(H + 3); // h+W+1 = 1003, inside (h+W, h+W+C]
    expect(holdsPriority(anchor, evidence, params)).toBe(accepts(vector)); // accepts=false -> forfeits
    expect(includable(anchor, evidence, params)).toBe(true); // but still includable
  });

  it("D13-pos-01: both h+W (priority) and h+W+C (inclusion) are inclusive boundaries", () => {
    const vector = loadVector("da-verdict.json", "D13-pos-01");
    assertBindable(vector);
    const accept = accepts(vector);
    expect(holdsPriority(anchor, servedAt(H + 2), params)).toBe(accept); // h+W inclusive
    expect(includable(anchor, servedAt(H + 5), params)).toBe(accept); // h+W+C inclusive
  });
});

describe("B2 vector bindings — params family (DA-window construction + h+K eligibility)", () => {
  // A second valid parameterization, distinct from the module-level (6, 2, 3): (10, 3, 4)
  // gives availability deadline h+3 and challenge deadline h+7 — used to detect a kernel
  // that has baked the (6, 2, 3) constants.
  const altParams = createDaWindowParams({ K: 10, W: 3, C: 4 });

  it("D9-neg-01: a weak-form triple K < W+C is rejected at kernel construction (#49 S6 strong form)", () => {
    const vector = loadVector("da-verdict.json", "D9-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: a weak-form triple's construction outcome is the verdict.
    expectConstructionVerdict(vector, () => createDaWindowParams({ K: 4, W: 2, C: 3 })); // K=4 < W+C=5 -> reject
    expect(() => createDaWindowParams({ K: 5, W: 2, C: 3 })).not.toThrow(); // companion: K=W+C boundary is valid
  });

  it("D12-neg-01: invalid params are rejected; the predicate is total at two distinct parameterizations (no baked constant)", () => {
    const vector = loadVector("da-verdict.json", "D12-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: an invalid triple's construction outcome is the verdict.
    expectConstructionVerdict(vector, () => createDaWindowParams({ K: 2, W: 2, C: 3 })); // K < W+C -> reject
    expect(() => createDaWindowParams({ K: 6.5, W: 2, C: 3 })).toThrow(); // companion: non-integer also rejected
    // companion (no baked constant): a (6,2,3)-baked deadline cannot also be correct at (10,3,4).
    expect(challengeDeadlineHeight(H, params)).toBe(H + 5); // (6,2,3)
    expect(challengeDeadlineHeight(H, altParams)).toBe(H + 7); // (10,3,4)
  });

  it("G9-neg-01: a true parametric kernel produces different windows per parameterization (baked default would fail the second)", () => {
    const vector = loadVector("kernel-wide-glue.json", "G9-neg-01");
    assertBindable(vector);
    // Primary -> expected.verdict: the rejected realization is a baked default — one that
    // returns identical windows across both parameterizations. A true parametric kernel does
    // not, so `bakedDefaultAccepted` is false, matching the vector's reject verdict.
    const bakedDefaultAccepted =
      availabilityDeadlineHeight(H, params) === availabilityDeadlineHeight(H, altParams) &&
      challengeDeadlineHeight(H, params) === challengeDeadlineHeight(H, altParams);
    expect(bakedDefaultAccepted).toBe(accepts(vector)); // false === reject
    // companions: the actual windows differ per parameterization.
    expect(availabilityDeadlineHeight(H, params)).not.toBe(availabilityDeadlineHeight(H, altParams)); // h+2 vs h+3
    expect(challengeDeadlineHeight(H, params)).not.toBe(challengeDeadlineHeight(H, altParams)); // h+5 vs h+7
  });

  it("A3-neg-01: an anchor at tip = h+K-1 is not yet eligible (inclusive boundary at h+K)", () => {
    const vector = loadVector("anchor-acceptance.json", "A3-neg-01");
    assertBindable(vector);
    expect(confirmedRootEligible(H, H + params.K - 1, params)).toBe(accepts(vector)); // h+K-1 -> not eligible (accepts=false)
    expect(confirmedRootEligible(H, H + params.K, params)).toBe(true); // companion: eligible exactly at h+K
    expect(() => createDaWindowParams({ K: 4, W: 2, C: 3 })).toThrow(); // S6 companion: K<W+C can't be constructed
  });
});

// Value-record fixtures. Records are signed over the B1 §8.1 wire v1 digest with @noble
// (the same primitive @ont/wire verifies with), mirroring value-record-authority.test.ts.
const VR_PRIV = "11".repeat(32);
const VR_AUX = new Uint8Array(32); // deterministic BIP340 aux -> reproducible signatures
const vrXonly = (privHex: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));
const VR_PUB = vrXonly(VR_PRIV);
const VR_REF_1 = "aa".repeat(32);
const VR_REF_2 = "bb".repeat(32);
const VR_NAME = "alice";
const VR_T0 = "2026-06-01T00:00:00Z";
const vrIntervalA: OwnershipInterval = { ownerPubkey: VR_PUB, ownershipRef: VR_REF_1 };

function vrSign(opts: {
  priv?: string;
  name?: string;
  ownershipRef?: string;
  sequence: number;
  previousRecordHash?: string | null;
  payloadHex?: string;
  issuedAt?: string;
}): ValueRecordEnvelope {
  const priv = opts.priv ?? VR_PRIV;
  const unsigned: ValueRecordEnvelope = {
    format: VALUE_RECORD_FORMAT,
    recordVersion: VALUE_RECORD_VERSION,
    name: opts.name ?? VR_NAME,
    ownerPubkey: vrXonly(priv),
    ownershipRef: opts.ownershipRef ?? VR_REF_1,
    sequence: opts.sequence,
    previousRecordHash: opts.previousRecordHash ?? null,
    valueType: 1,
    payloadHex: opts.payloadHex ?? "00",
    issuedAt: opts.issuedAt ?? VR_T0,
    signature: "00".repeat(64),
  };
  const digest = valueRecordDigest(unsigned as unknown as Record<string, unknown>);
  return { ...unsigned, signature: bytesToHex(schnorr.sign(digest, hexToBytes(priv), VR_AUX)) };
}

const vrHeadHash = (head: ValueRecordEnvelope): string =>
  bytesToHex(valueRecordDigest(head as unknown as Record<string, unknown>));

describe("B2 vector bindings — value-record family (valueRecordAccept)", () => {
  it("V6-neg-01: a first record must be sequence 1 with a null previous hash", () => {
    const vector = loadVector("value-record-authority.json", "V6-neg-01");
    assertBindable(vector);
    expect(valueRecordAccept(vrSign({ sequence: 2 }), vrIntervalA, null).accepted).toBe(accepts(vector)); // first record at seq 2 -> reject
    expect(valueRecordAccept(vrSign({ sequence: 1 }), vrIntervalA, null).accepted).toBe(true); // companion: valid first record accepts
  });

  it("V7-neg-01: a chain at the max sequence bound cannot extend (fail-closed)", () => {
    const vector = loadVector("value-record-authority.json", "V7-neg-01");
    assertBindable(vector);
    const maxHead = vrSign({ sequence: SEQUENCE_BOUND });
    expect(
      valueRecordAccept(vrSign({ sequence: 5, previousRecordHash: vrHeadHash(maxHead) }), vrIntervalA, maxHead).accepted
    ).toBe(accepts(vector)); // no head+1 is a safe integer at the bound -> reject
    // companions: stale (<=head) and gap (>head+1) sequences also reject.
    const head = vrSign({ sequence: 1 });
    expect(valueRecordAccept(vrSign({ sequence: 1, previousRecordHash: vrHeadHash(head) }), vrIntervalA, head).reason).toBe(
      "v7-stale-or-duplicate-sequence"
    );
    expect(valueRecordAccept(vrSign({ sequence: 3, previousRecordHash: vrHeadHash(head) }), vrIntervalA, head).reason).toBe(
      "v7-sequence-gap"
    );
  });

  it("V8-neg-01: the previous-record hash is recomputed, never trusted as declared", () => {
    const vector = loadVector("value-record-authority.json", "V8-neg-01");
    assertBindable(vector);
    const head = vrSign({ sequence: 1 });
    expect(
      valueRecordAccept(vrSign({ sequence: 2, previousRecordHash: "dd".repeat(32) }), vrIntervalA, head).accepted
    ).toBe(accepts(vector)); // wrong previousRecordHash -> reject
    expect(
      valueRecordAccept(vrSign({ sequence: 2, previousRecordHash: vrHeadHash(head) }), vrIntervalA, head).accepted
    ).toBe(true); // companion: linking the recomputed head hash accepts
  });

  it("V3-neg-01: a recovery-descriptor signature presented as a value-record signature is rejected (domain separation)", () => {
    const vector = loadVector("value-record-authority.json", "V3-neg-01");
    assertBindable(vector);
    // A valid BIP340 signature by owner A, but over the 'ont-recovery-descriptor' digest of the
    // structurally-identical prefix — only the domain label differs, so it cannot authorize a value record.
    const descriptor = {
      format: RECOVERY_DESCRIPTOR_FORMAT,
      descriptorVersion: RECOVERY_DESCRIPTOR_VERSION,
      name: VR_NAME,
      ownerPubkey: VR_PUB,
      ownershipRef: VR_REF_1,
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
      signingProfile: "bip322",
      challengeWindowBlocks: 144,
      issuedAt: VR_T0,
      signature: "00".repeat(64),
    };
    const descSig = bytesToHex(schnorr.sign(recoveryDescriptorDigest(descriptor), hexToBytes(VR_PRIV), VR_AUX));
    const crossContext = { ...vrSign({ sequence: 1 }), signature: descSig };
    expect(valueRecordAccept(crossContext, vrIntervalA, null).accepted).toBe(accepts(vector)); // reject
  });

  it("V4-neg-01: a record validly signed for name A does not validate for name B (the §8.1 digest binds the name)", () => {
    const vector = loadVector("value-record-authority.json", "V4-neg-01");
    assertBindable(vector);
    const recA = vrSign({ name: "alice", sequence: 1 });
    const replayedAsB = { ...recA, name: "bob" }; // keep A's signature, relabel the name (sibling names share ownershipRef)
    expect(valueRecordAccept(replayedAsB, vrIntervalA, null).accepted).toBe(accepts(vector)); // reject: digest binds name
  });

  it("V10-neg-01: a transfer is non-preserving — an old-interval record is rejected under the new interval", () => {
    const vector = loadVector("value-record-authority.json", "V10-neg-01");
    assertBindable(vector);
    const newInterval: OwnershipInterval = { ownerPubkey: VR_PUB, ownershipRef: VR_REF_2 };
    expect(valueRecordAccept(vrSign({ ownershipRef: VR_REF_1, sequence: 1 }), newInterval, null).accepted).toBe(
      accepts(vector)
    ); // old-interval ref under the post-transfer interval -> reject
    expect(valueRecordAccept(vrSign({ ownershipRef: VR_REF_2, sequence: 1 }), newInterval, null).accepted).toBe(true); // companion: fresh seq-1/null-prev under the new ref accepts
    // NOTE: the unassigned-"preserve"-flag-bit aspect of V10 is engine/Transfer-side (X-area); valueRecordAccept
    // only ever sees the post-transfer interval the engine supplies (new ref, null head) — a companion concern.
  });

  it("V11-pos-01: issuedAt never orders the chain — an earlier-issuedAt successor on valid linkage is accepted", () => {
    const vector = loadVector("value-record-authority.json", "V11-pos-01");
    assertBindable(vector);
    const head = vrSign({ sequence: 1, issuedAt: "2026-06-01T00:00:00Z" });
    const earlier = vrSign({ sequence: 2, previousRecordHash: vrHeadHash(head), issuedAt: "2026-01-01T00:00:00Z" });
    expect(valueRecordAccept(earlier, vrIntervalA, head).accepted).toBe(accepts(vector)); // earlier issuedAt + valid linkage -> accept
    // companion: a LATER issuedAt with a stale sequence is still rejected (recency confers nothing).
    const laterStale = vrSign({ sequence: 1, previousRecordHash: vrHeadHash(head), issuedAt: "2027-01-01T00:00:00Z" });
    expect(valueRecordAccept(laterStale, vrIntervalA, head).reason).toBe("v7-stale-or-duplicate-sequence");
  });

  it("V1-neg-01: the verdict never compares issuedAt to a host clock (purity probe)", () => {
    const vector = loadVector("value-record-authority.json", "V1-neg-01");
    assertBindable(vector);
    // A structurally-rejected record (first record at seq 2 -> v6), evaluated at a far-future and a
    // far-past issuedAt: the verdict must be identical, proving issuedAt is never compared to "now".
    const future = valueRecordAccept(vrSign({ sequence: 2, issuedAt: "2999-01-01T00:00:00Z" }), vrIntervalA, null);
    const past = valueRecordAccept(vrSign({ sequence: 2, issuedAt: "1999-01-01T00:00:00Z" }), vrIntervalA, null);
    expect(future.accepted).toBe(accepts(vector)); // reject regardless of issuedAt
    expect(future).toEqual(past); // companion: byte-identical verdict at any host clock
  });
});

// Engine-transfer fixtures (mirror engine.test.ts): seed an owned NameRecord, build a
// Transfer as an OP_RETURN-carrying Bitcoin tx, apply it through the engine, and read the
// transfer event's provenance verdict — "applied" maps to accept, "ignored" to reject.
const ET_OWNER_PRIV = "01".repeat(32);
const ET_OWNER_PUB = deriveOwnerPubkey(ET_OWNER_PRIV);
const ET_NEW_OWNER_PRIV = "02".repeat(32);
const ET_NEW_OWNER_PUB = deriveOwnerPubkey(ET_NEW_OWNER_PRIV);
const ET_STRANGER_PRIV = "03".repeat(32);
const ET_OLD_BOND_TXID = "cc".repeat(32);
const ET_OLD_BOND_VOUT = 0;
const ET_OLD_HEAD_TXID = "dd".repeat(32);

function etSeed(state: OntState, overrides: Partial<NameRecord> & { name: string }): NameRecord {
  const record: NameRecord = {
    status: "immature",
    currentOwnerPubkey: ET_OWNER_PUB,
    claimCommitTxid: "a1".repeat(32),
    claimRevealTxid: "b1".repeat(32),
    claimHeight: 100,
    maturityHeight: 1000,
    requiredBondSats: 50_000n,
    currentBondTxid: ET_OLD_BOND_TXID,
    currentBondVout: ET_OLD_BOND_VOUT,
    currentBondValueSats: 50_000n,
    lastStateTxid: ET_OLD_HEAD_TXID,
    lastStateHeight: 100,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
    ...overrides,
  };
  state.names.set(record.name, record);
  return record;
}
const etOpReturn = (payload: TransferEventPayload): BitcoinTransactionOutput => ({
  valueSats: 0n,
  scriptType: "op_return",
  dataHex: bytesToHex(encodeTransferPayload(payload)),
});
const etPayment = (valueSats: bigint): BitcoinTransactionOutput => ({ valueSats, scriptType: "payment" });
const etBondInput = (txid: string, vout: number): BitcoinTransactionInput => ({ txid, vout, coinbase: false });
const etSignedTransfer = (fields: TransferAuthorizationFields, signerPriv: string): TransferEventPayload =>
  createTransferPayload({ ...fields, signature: signTransferAuthorization({ ...fields, ownerPrivateKeyHex: signerPriv }) });
function etBlock(input: {
  txid: string;
  blockHeight: number;
  payload: TransferEventPayload;
  inputs?: readonly BitcoinTransactionInput[];
  extraOutputs?: readonly BitcoinTransactionOutput[]; // outputs[0] is always the OP_RETURN
}): BitcoinTransactionInBlock {
  return {
    tx: { txid: input.txid, inputs: input.inputs ?? [], outputs: [etOpReturn(input.payload), ...(input.extraOutputs ?? [])] },
    blockHeight: input.blockHeight,
    txIndex: 0,
  };
}
function etApplyVerdict(state: OntState, tx: BitcoinTransactionInBlock): "applied" | "ignored" | undefined {
  return applyBlockTransactionsWithProvenance(state, [tx], 0).flatMap((record) => record.events)[0]?.validationStatus;
}

describe("B2 vector bindings — engine-transfer family (applyBlockTransactions)", () => {
  const baseFields: TransferAuthorizationFields = {
    prevStateTxid: ET_OLD_HEAD_TXID,
    newOwnerPubkey: ET_NEW_OWNER_PUB,
    flags: 0,
    successorBondVout: 1,
  };
  const matureFields: TransferAuthorizationFields = { ...baseFields, successorBondVout: 0 };

  it("X2-neg-01: only the current owner key over the §5 transfer digest authorizes a transfer", () => {
    const vector = loadVector("transfer-authority.json", "X2-neg-01");
    assertBindable(vector);
    // primary: a transfer signed by a non-owner (stranger) key authorizes nothing (mature path).
    const state = createEmptyState();
    etSeed(state, { name: "alice", maturityHeight: 1000 });
    const applied =
      etApplyVerdict(state, etBlock({ txid: "e0".repeat(32), blockHeight: 2000, payload: etSignedTransfer(matureFields, ET_STRANGER_PRIV) })) ===
      "applied";
    expect(applied).toBe(accepts(vector)); // accepts=false -> ignored
    // companion (caseA): a recover-owner-domain signature presented as a transfer signature also authorizes nothing.
    const recoverSig = signRecoverOwnerCancelAuthorization({
      ...matureFields,
      challengeWindowBlocks: 144,
      recoveryDescriptorHash: "ee".repeat(32),
      ownerPrivateKeyHex: ET_OWNER_PRIV,
    });
    const crossState = createEmptyState();
    etSeed(crossState, { name: "alice", maturityHeight: 1000 });
    const crossPayload = createTransferPayload({ ...matureFields, signature: recoverSig });
    expect(etApplyVerdict(crossState, etBlock({ txid: "e1".repeat(32), blockHeight: 2000, payload: crossPayload }))).toBe("ignored");
    // companion (caseB): the incoming/recipient owner self-signing authorizes nothing — it must
    // verify against the current owner key, not the key being transferred to.
    const recipientState = createEmptyState();
    etSeed(recipientState, { name: "alice", maturityHeight: 1000 });
    expect(
      etApplyVerdict(recipientState, etBlock({ txid: "e8".repeat(32), blockHeight: 2000, payload: etSignedTransfer(matureFields, ET_NEW_OWNER_PRIV) }))
    ).toBe("ignored");
  });

  it("X6-neg-01: a pre-maturity successor bond below the required amount is rejected — at two distinct required values (no baked constant)", () => {
    const vector = loadVector("transfer-authority.json", "X6-neg-01");
    assertBindable(vector);
    // The threshold tracks the per-name requiredBondSats, exercised at two distinct
    // non-coincident values: a kernel with a baked 50,000 constant would WRONGLY apply the
    // 123,455-sat successor under the 123,456 requirement.
    const transferVerdict = (
      requiredBondSats: bigint,
      successorSats: bigint,
      txid: string
    ): "applied" | "ignored" | undefined => {
      const state = createEmptyState();
      etSeed(state, { name: "alice", maturityHeight: 1000, requiredBondSats });
      return etApplyVerdict(state, etBlock({
        txid,
        blockHeight: 500, // pre-maturity, spends the current bond
        payload: etSignedTransfer(baseFields, ET_OWNER_PRIV),
        inputs: [etBondInput(ET_OLD_BOND_TXID, ET_OLD_BOND_VOUT)],
        extraOutputs: [etPayment(successorSats)],
      }));
    };
    // primary -> expected.verdict, at a non-placeholder required value: 1 sat short rejects.
    expect(transferVerdict(123_456n, 123_455n, "e2".repeat(32)) === "applied").toBe(accepts(vector));
    // companions: the same required value applies exactly, and the threshold tracks a SECOND value.
    expect(transferVerdict(123_456n, 123_456n, "e3".repeat(32))).toBe("applied"); // exact = required applies
    expect(transferVerdict(50_000n, 49_999n, "e6".repeat(32))).toBe("ignored"); // tracks a different value
    expect(transferVerdict(50_000n, 50_000n, "e7".repeat(32))).toBe("applied");
  });

  it("X6-neg-02: a successorBondVout beyond the u8 ceiling is unrepresentable and rejected at the wire", () => {
    const vector = loadVector("transfer-authority.json", "X6-neg-02");
    assertBindable(vector);
    // primary -> expected.verdict: an out-of-range (>255) successorBondVout cannot be encoded.
    expectConstructionVerdict(vector, () =>
      createTransferPayload({ ...baseFields, successorBondVout: 256, signature: "00".repeat(64) })
    );
    // companion: the same transfer with an in-range vout designating an adequate output applies.
    const ok = createEmptyState();
    etSeed(ok, { name: "alice", maturityHeight: 1000, requiredBondSats: 50_000n });
    expect(
      etApplyVerdict(ok, etBlock({
        txid: "e4".repeat(32),
        blockHeight: 500,
        payload: etSignedTransfer(baseFields, ET_OWNER_PRIV),
        inputs: [etBondInput(ET_OLD_BOND_TXID, ET_OLD_BOND_VOUT)],
        extraOutputs: [etPayment(50_000n)],
      }))
    ).toBe("applied");
  });

  it("X8-pos-01: a mature transfer ignores the bond byte and applies with no bond inputs/outputs", () => {
    const vector = loadVector("transfer-authority.json", "X8-pos-01");
    assertBindable(vector);
    const state = createEmptyState();
    etSeed(state, { name: "alice", maturityHeight: 1000 });
    // primary: comfortably past maturity (h=5000 >> 1000), arbitrary successorBondVout, no bond -> applied.
    const applied =
      etApplyVerdict(state, etBlock({
        txid: "e5".repeat(32),
        blockHeight: 5000,
        payload: etSignedTransfer({ ...baseFields, successorBondVout: 255 }, ET_OWNER_PRIV),
      })) === "applied";
    expect(applied).toBe(accepts(vector)); // accepts=true -> applied
    expect(state.names.get("alice")?.currentBondTxid).toBe(ET_OLD_BOND_TXID); // companion: bond fields untouched on the mature path
  });
});
