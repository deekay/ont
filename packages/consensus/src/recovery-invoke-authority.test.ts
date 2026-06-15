// Recovery-invoke authorization/evidence-gate (#50-b1 / #67) — acceptRecoverOwner.
//
// @noble/curves schnorr is the same primitive @ont/wire verifies with (a devDependency
// test helper, not a production import — this test file is not part of the audited surface).
// BIP340 with zero aux keeps signatures deterministic, so the pure verdicts are reproducible.
//
// The battery proves: (1) a fully-consistent invoke is authorized; (2) every conjunct
// (R7/R10/R6/R3/R3'/R2/R4/R5), the §3c evidence-timing gate, and the flags path-split each
// reject in isolation; (3) totality + closed shape — every malformed input rejects, never throws,
// and no extra field (especially on the witness) is admitted; (4) the verdict is driven by the
// W_r parameter, not a baked constant (two parameterizations + a witness height that flips with W_r).

import { describe, expect, it } from "vitest";

import { schnorr } from "@noble/curves/secp256k1.js";

import {
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION_V1,
  RECOVERY_DESCRIPTOR_VERSION_V2,
  bytesToHex,
  hexToBytes,
  recoveryDescriptorDigest,
  recoverAuthDigest,
} from "@ont/wire";

import {
  acceptRecoverOwner,
  type RecoverOwnerInvokeFacts,
  type RecoveryDescriptorEvidence,
  type RecoveryNameStateFacts,
  type RecoveryParams,
} from "./recovery-invoke-authority.js";

const AUX = new Uint8Array(32);
const xonly = (privHex: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));

const OWNER_PRIV = "11".repeat(32);
const OWNER_PUB = xonly(OWNER_PRIV);
const RECOVERY_PRIV = "33".repeat(32);
const RECOVERY_PUB = xonly(RECOVERY_PRIV);
const OTHER_PRIV = "44".repeat(32);
const OTHER_PUB = xonly(OTHER_PRIV);

const REF = "aa".repeat(32);
const OTHER_REF = "bb".repeat(32);
const HEAD_TXID = "cc".repeat(32);
const OTHER_TXID = "ee".repeat(32);
const NEW_OWNER = "dd".repeat(32);
const NAME = "alice";
const T0 = "2026-01-01T00:00:00Z";
const SEQ = 3;
const CWB = 144; // challengeWindowBlocks
const W_R = 20; // recovery-evidence window (< CWB)
const H_R = 100000; // invoke mined height

interface Bundle {
  invokeFacts: RecoverOwnerInvokeFacts;
  descriptorEvidence: RecoveryDescriptorEvidence;
  nameState: RecoveryNameStateFacts;
  recoveryParams: RecoveryParams;
}

interface BuildOpts {
  descriptorOwnerPriv?: string; // signs the arming sig AND sets descriptor.ownerPubkey
  recoveryPriv?: string; // signs the invoke
  recoveryPubkey?: string; // descriptor.recoveryPubkey (R10 verifies the invoke sig against this)
  ownershipRef?: string;
  sequence?: number;
  descriptorVersion?: number;
  descriptorChallengeWindowBlocks?: number; // descriptor-committed window (default CWB = the invoke's window)
  flags?: number;
  minedHeight?: number;
  wR?: number;
  witnessedByHeight?: number; // default minedHeight + wR (the deadline, inclusive)
}

// Build a fully consistent (facts, evidence, state, params) bundle; overrides are applied before
// the descriptor digest + signatures are computed, so every produced bundle is internally signed.
function buildValid(opts: BuildOpts = {}): Bundle {
  const descriptorOwnerPriv = opts.descriptorOwnerPriv ?? OWNER_PRIV;
  const recoveryPriv = opts.recoveryPriv ?? RECOVERY_PRIV;
  const recoveryPubkey = opts.recoveryPubkey ?? RECOVERY_PUB;
  const ownershipRef = opts.ownershipRef ?? REF;
  const sequence = opts.sequence ?? SEQ;
  const descriptorVersion = opts.descriptorVersion ?? RECOVERY_DESCRIPTOR_VERSION_V2;
  const flags = opts.flags ?? 0;
  const minedHeight = opts.minedHeight ?? H_R;
  const wR = opts.wR ?? W_R;
  const witnessedByHeight = opts.witnessedByHeight ?? minedHeight + wR;
  const descriptorCWB = opts.descriptorChallengeWindowBlocks ?? CWB; // invoke's window stays CWB

  const unsignedDescriptor: Record<string, unknown> = {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion,
    name: NAME,
    ownerPubkey: xonly(descriptorOwnerPriv),
    ownershipRef,
    sequence,
    previousDescriptorHash: null,
    recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
    signingProfile: "bip322",
    challengeWindowBlocks: descriptorCWB,
    issuedAt: T0,
    recoveryPubkey,
    signature: "00".repeat(64),
  };
  const descriptorDigest = recoveryDescriptorDigest(unsignedDescriptor);
  const descriptor = {
    ...unsignedDescriptor,
    signature: bytesToHex(schnorr.sign(descriptorDigest, hexToBytes(descriptorOwnerPriv), AUX)),
  };
  const descHash = bytesToHex(descriptorDigest);

  const w13 = recoverAuthDigest({
    prevStateTxid: HEAD_TXID,
    newOwnerPubkey: NEW_OWNER,
    flags,
    successorBondVout: 0,
    challengeWindowBlocks: CWB,
    recoveryDescriptorHash: descHash,
  });
  const invokeFacts: RecoverOwnerInvokeFacts = {
    prevStateTxid: HEAD_TXID,
    newOwnerPubkey: NEW_OWNER,
    flags,
    successorBondVout: 0,
    challengeWindowBlocks: CWB,
    recoveryDescriptorHash: descHash,
    signature: bytesToHex(schnorr.sign(w13, hexToBytes(recoveryPriv), AUX)),
    minedHeight,
  };

  return {
    invokeFacts,
    descriptorEvidence: {
      descriptor,
      witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight },
    },
    nameState: {
      ownerPubkey: OWNER_PUB,
      headTxid: HEAD_TXID,
      currentOwnershipRef: REF,
      recoveryDescriptorHeadHash: descHash,
      recoveryDescriptorHeadSequence: sequence,
    },
    recoveryParams: { recoveryEvidenceWindowBlocks: wR },
  };
}

const run = (b: Bundle) =>
  acceptRecoverOwner(b.invokeFacts, b.descriptorEvidence, b.nameState, b.recoveryParams);
// Loose caller for malformed-input cases (the predicate validates `unknown` internally).
const runLoose = (f: unknown, e: unknown, s: unknown, p: unknown) =>
  acceptRecoverOwner(
    f as RecoverOwnerInvokeFacts,
    e as RecoveryDescriptorEvidence,
    s as RecoveryNameStateFacts,
    p as RecoveryParams
  );

describe("acceptRecoverOwner — recovery-invoke authorization + evidence gate (#67)", () => {
  it("authorizes a fully consistent non-cancel invoke (all conjuncts + §3c hold)", () => {
    const v = run(buildValid());
    expect(v).toEqual({ accepted: true, reason: "recovery-invoke-authorized" });
  });

  // ---- conjunct-by-conjunct negatives (each in isolation) ----

  it("R7: a descriptorVersion-1 descriptor is not invokable", () => {
    const b = buildValid();
    const v = runLoose(
      b.invokeFacts,
      { ...b.descriptorEvidence, descriptor: { ...b.descriptorEvidence.descriptor, descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V1 } },
      b.nameState,
      b.recoveryParams
    );
    expect(v).toEqual({ accepted: false, reason: "descriptor-not-invokable-version" });
  });

  it("R6: the invoke's recoveryDescriptorHash must equal the descriptor digest", () => {
    const b = buildValid();
    const v = run({ ...b, invokeFacts: { ...b.invokeFacts, recoveryDescriptorHash: "ab".repeat(32) } });
    expect(v).toEqual({ accepted: false, reason: "recovery-descriptor-hash-mismatch" });
  });

  it("R8/T19: a descriptor committing a different challengeWindowBlocks than the invoke is rejected", () => {
    // descriptor commits 200; the invoke signs W13 with CWB (144) and names this descriptor's digest,
    // so R6 still passes — but the window-equality conjunct rejects (the T19/R8 battery).
    const b = buildValid({ descriptorChallengeWindowBlocks: 200 });
    expect(b.invokeFacts.challengeWindowBlocks).toBe(CWB);
    expect(b.descriptorEvidence.descriptor.challengeWindowBlocks).toBe(200);
    expect(run(b)).toEqual({ accepted: false, reason: "challenge-window-mismatch" });
  });

  it("R3: the descriptor must be the name's current armed head (hash fact)", () => {
    const b = buildValid();
    const v = run({ ...b, nameState: { ...b.nameState, recoveryDescriptorHeadHash: "ab".repeat(32) } });
    expect(v).toEqual({ accepted: false, reason: "descriptor-not-current-head" });
  });

  it("R3 companion: the head sequence must agree (sequence is not a substitute for the head hash)", () => {
    const b = buildValid();
    const v = run({ ...b, nameState: { ...b.nameState, recoveryDescriptorHeadSequence: SEQ + 1 } });
    expect(v).toEqual({ accepted: false, reason: "descriptor-head-sequence-mismatch" });
  });

  it("R4: an old-interval descriptor (ownershipRef != current interval) is rejected — anti-replay", () => {
    const b = buildValid();
    const v = run({ ...b, nameState: { ...b.nameState, currentOwnershipRef: OTHER_REF } });
    expect(v).toEqual({ accepted: false, reason: "descriptor-ownership-ref-not-current-interval" });
  });

  it("R5: the invoke must build on the current state head", () => {
    const b = buildValid();
    const v = run({ ...b, nameState: { ...b.nameState, headTxid: OTHER_TXID } });
    expect(v).toEqual({ accepted: false, reason: "prev-state-txid-not-head" });
  });

  it("R2: the arming signature must verify against the CURRENT owner, not the descriptor's self-claimed owner", () => {
    // descriptor self-claims OTHER as owner and is self-signed by OTHER (verifyRecoveryDescriptor would pass);
    // but the name's current owner is OWNER, so the arming check against nameState.ownerPubkey fails.
    const b = buildValid({ descriptorOwnerPriv: OTHER_PRIV });
    expect(b.descriptorEvidence.descriptor.ownerPubkey).toBe(OTHER_PUB);
    expect(b.nameState.ownerPubkey).toBe(OWNER_PUB);
    const v = run(b);
    expect(v).toEqual({ accepted: false, reason: "owner-arming-signature-invalid" });
  });

  it("R10: an invoke signature by the wrong recovery key is rejected", () => {
    // descriptor.recoveryPubkey is OTHER_PUB; the invoke is signed by RECOVERY_PRIV → mismatch.
    const b = buildValid({ recoveryPubkey: OTHER_PUB, recoveryPriv: RECOVERY_PRIV });
    const v = run(b);
    expect(v).toEqual({ accepted: false, reason: "invoke-signature-invalid" });
  });

  it("R10: a replayed arming signature presented in the invoke slot does not authorize", () => {
    const b = buildValid();
    const armingSig = b.descriptorEvidence.descriptor.signature as string;
    const v = run({ ...b, invokeFacts: { ...b.invokeFacts, signature: armingSig } });
    expect(v).toEqual({ accepted: false, reason: "invoke-signature-invalid" });
  });

  it("path split: a CANCEL-flagged (flags=1) event presented as an invoke fails closed", () => {
    const b = buildValid({ flags: 1 });
    expect(run(b)).toEqual({ accepted: false, reason: "non-invoke-flags" });
  });

  it("path split: any nonzero flag (flags=2) presented as an invoke fails closed", () => {
    const b = buildValid({ flags: 2 });
    expect(run(b)).toEqual({ accepted: false, reason: "non-invoke-flags" });
  });

  // ---- §3c evidence-timing gate ----

  it("§3c: descriptor evidence witnessed exactly at h_r + W_r is in time (inclusive)", () => {
    expect(run(buildValid({ witnessedByHeight: H_R + W_R })).accepted).toBe(true);
  });

  it("§3c: descriptor evidence witnessed one block past h_r + W_r forfeits (fail closed)", () => {
    const v = run(buildValid({ witnessedByHeight: H_R + W_R + 1 }));
    expect(v).toEqual({ accepted: false, reason: "descriptor-evidence-witnessed-too-late" });
  });

  // ---- W_r is a real parameter, not a baked constant (amendment 1) ----

  it("W_r drives the verdict: a witness at h_r+40 forfeits under W_r=20 but is in time under W_r=50", () => {
    const late = H_R + 40;
    expect(run(buildValid({ wR: 20, witnessedByHeight: late })).reason).toBe("descriptor-evidence-witnessed-too-late");
    expect(run(buildValid({ wR: 50, witnessedByHeight: late })).accepted).toBe(true);
  });

  it("W_r must be an integer in [1, challengeWindowBlocks]", () => {
    expect(run(buildValid({ wR: 0 })).reason).toBe("recovery-evidence-window-out-of-range");
    expect(run(buildValid({ wR: CWB + 1, witnessedByHeight: H_R + 1 })).reason).toBe("recovery-evidence-window-out-of-range");
    const b = buildValid();
    expect(runLoose(b.invokeFacts, b.descriptorEvidence, b.nameState, { recoveryEvidenceWindowBlocks: 2.5 }).reason)
      .toBe("recovery-evidence-window-out-of-range");
  });

  // ---- totality + closed shape (never throws; no extra field is authority) ----

  it("is total over malformed top-level inputs (rejects, never throws)", () => {
    const b = buildValid();
    for (const bad of [null, undefined, 7, "x", [], true]) {
      expect(runLoose(bad, b.descriptorEvidence, b.nameState, b.recoveryParams).accepted).toBe(false);
      expect(runLoose(b.invokeFacts, bad, b.nameState, b.recoveryParams).accepted).toBe(false);
      expect(runLoose(b.invokeFacts, b.descriptorEvidence, bad, b.recoveryParams).accepted).toBe(false);
      expect(runLoose(b.invokeFacts, b.descriptorEvidence, b.nameState, bad).accepted).toBe(false);
    }
  });

  it("rejects an extra field on each owned input object (closed shape)", () => {
    const b = buildValid();
    expect(runLoose({ ...b.invokeFacts, extra: 1 }, b.descriptorEvidence, b.nameState, b.recoveryParams).reason)
      .toBe("invoke-facts-malformed");
    expect(runLoose(b.invokeFacts, { ...b.descriptorEvidence, extra: 1 }, b.nameState, b.recoveryParams).reason)
      .toBe("descriptor-evidence-malformed");
    expect(runLoose(b.invokeFacts, b.descriptorEvidence, { ...b.nameState, extra: 1 }, b.recoveryParams).reason)
      .toBe("name-state-malformed");
    expect(runLoose(b.invokeFacts, b.descriptorEvidence, b.nameState, { ...b.recoveryParams, extra: 1 }).reason)
      .toBe("recovery-params-malformed");
  });

  it("rejects a malformed / asserted descriptor-evidence witness (the height is never bare authority)", () => {
    const b = buildValid();
    const withWitness = (witness: unknown) =>
      runLoose(b.invokeFacts, { ...b.descriptorEvidence, witness }, b.nameState, b.recoveryParams).reason;
    expect(withWitness(null)).toBe("descriptor-witness-malformed");
    expect(withWitness({ witnessedByHeight: H_R })).toBe("descriptor-witness-malformed"); // bare, no kind
    expect(withWitness({ kind: "producer-asserted", witnessedByHeight: H_R })).toBe("descriptor-witness-malformed");
    expect(withWitness({ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: H_R, source: "x" }))
      .toBe("descriptor-witness-malformed"); // extra field
    expect(withWitness({ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: -1 }))
      .toBe("descriptor-witness-malformed");
    expect(withWitness({ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: "100" }))
      .toBe("descriptor-witness-malformed");
  });

  it("rejects a non-object / malformed descriptor without throwing (wire digest guarded)", () => {
    const b = buildValid();
    const withDescriptor = (descriptor: unknown) =>
      runLoose(b.invokeFacts, { ...b.descriptorEvidence, descriptor }, b.nameState, b.recoveryParams);
    expect(withDescriptor(null).reason).toBe("descriptor-malformed");
    expect(withDescriptor("x").reason).toBe("descriptor-malformed");
    // v2 descriptor whose recoveryPubkey is malformed → recoveryDescriptorDigest throws → guarded reject.
    expect(withDescriptor({ ...b.descriptorEvidence.descriptor, recoveryPubkey: "zz" }).accepted).toBe(false);
  });

  it("rejects malformed invoke-facts fields (bad hex / non-integer) without throwing", () => {
    const b = buildValid();
    for (const bad of [
      { prevStateTxid: "zz" },
      { signature: "00".repeat(63) }, // wrong length
      { flags: -1 },
      { minedHeight: 1.5 },
      { recoveryDescriptorHash: 123 as unknown as string },
      { minedHeight: 0x1_0000_0000 }, // exceeds u32
      { challengeWindowBlocks: 0x1_0000_0000 }, // exceeds u32
      { successorBondVout: 256 }, // exceeds byte
      { flags: 256 }, // exceeds byte (caught as malformed before the path-split check)
    ]) {
      expect(runLoose({ ...b.invokeFacts, ...bad }, b.descriptorEvidence, b.nameState, b.recoveryParams).reason)
        .toBe("invoke-facts-malformed");
    }
  });

  it("rejects an extra field on the descriptor envelope (closed shape, #67 / blocker 2)", () => {
    const b = buildValid();
    const withExtra = (extra: object) =>
      runLoose(
        b.invokeFacts,
        { ...b.descriptorEvidence, descriptor: { ...b.descriptorEvidence.descriptor, ...extra } },
        b.nameState,
        b.recoveryParams
      ).reason;
    expect(withExtra({ source: "resolver" })).toBe("descriptor-extra-field");
    expect(withExtra({ producer: "x" })).toBe("descriptor-extra-field");
  });

  it("rejects uppercase (non-canonical) hex — canonical hex is lowercase-only", () => {
    const b = buildValid();
    expect(runLoose({ ...b.invokeFacts, prevStateTxid: b.invokeFacts.prevStateTxid.toUpperCase() }, b.descriptorEvidence, b.nameState, b.recoveryParams).reason)
      .toBe("invoke-facts-malformed");
    expect(runLoose(b.invokeFacts, b.descriptorEvidence, { ...b.nameState, ownerPubkey: b.nameState.ownerPubkey.toUpperCase() }, b.recoveryParams).reason)
      .toBe("name-state-malformed");
  });

  it("rejects malformed name-state fields without throwing", () => {
    const b = buildValid();
    for (const bad of [
      { ownerPubkey: "zz" },
      { headTxid: 5 as unknown as string },
      { currentOwnershipRef: "ab".repeat(10) },
      { recoveryDescriptorHeadSequence: -2 },
    ]) {
      expect(runLoose(b.invokeFacts, b.descriptorEvidence, { ...b.nameState, ...bad }, b.recoveryParams).reason)
        .toBe("name-state-malformed");
    }
  });
});
