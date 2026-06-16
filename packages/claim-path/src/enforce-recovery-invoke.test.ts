import { describe, expect, it } from "vitest";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION_V2,
  bytesToHex,
  hexToBytes,
  recoveryDescriptorDigest,
  recoverAuthDigest,
} from "@ont/wire";
import {
  enforceRecoveryInvoke,
  type ConfirmedRecoverOwnerInvoke,
  type RecoveryInvokeInput,
} from "./enforce-recovery-invoke.js";

// I-REC red battery (B3_INTEGRATION_PLAN §8). Fixtures mirror the kernel acceptRecoverOwner test's
// buildValid recipe (owner-signed v2 descriptor → recoveryDescriptorDigest; recovery-key-signed invoke
// over recoverAuthDigest), restructured into the verified ConfirmedRecoverOwnerInvoke seam fact. The
// witness is MINTED by D-RC at h_r — never producer-supplied — so the kernel's witnessed-too-late path
// is unreachable here (a producer height/witness channel is rejected by closed-shape instead).
// @noble/curves schnorr is a test helper (not a production import); BIP340 zero-aux keeps it deterministic.

const AUX = new Uint8Array(32);
const xonly = (privHex: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));

const OWNER_PRIV = "11".repeat(32);
const OWNER_PUB = xonly(OWNER_PRIV);
const RECOVERY_PRIV = "33".repeat(32);
const RECOVERY_PUB = xonly(RECOVERY_PRIV);

const REF = "aa".repeat(32);
const OTHER_REF = "bb".repeat(32);
const HEAD_TXID = "cc".repeat(32);
const NEW_OWNER = "dd".repeat(32);
const INVOKE_TXID = "0a".repeat(32);
const OTHER_HASH = "ef".repeat(32);
const NAME = "alice";
const T0 = "2026-01-01T00:00:00Z";
const SEQ = 3;
const CWB = 144;
const W_R = 20;
const H_R = 100000;

interface BuildOpts {
  flags?: number;
  ownershipRef?: string;
  sequence?: number;
  minedHeight?: number;
  wR?: number;
}

/** A fully consistent { confirmedInvoke, descriptor, nameState, recoveryParams } I-REC input. */
function buildValid(opts: BuildOpts = {}): RecoveryInvokeInput {
  const flags = opts.flags ?? 0;
  const ownershipRef = opts.ownershipRef ?? REF;
  const sequence = opts.sequence ?? SEQ;
  const minedHeight = opts.minedHeight ?? H_R;
  const wR = opts.wR ?? W_R;

  const unsignedDescriptor: Record<string, unknown> = {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V2,
    name: NAME,
    ownerPubkey: OWNER_PUB,
    ownershipRef,
    sequence,
    previousDescriptorHash: null,
    recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
    signingProfile: "bip322",
    challengeWindowBlocks: CWB,
    issuedAt: T0,
    recoveryPubkey: RECOVERY_PUB,
    signature: "00".repeat(64),
  };
  const descriptorDigest = recoveryDescriptorDigest(unsignedDescriptor);
  const descriptor = {
    ...unsignedDescriptor,
    signature: bytesToHex(schnorr.sign(descriptorDigest, hexToBytes(OWNER_PRIV), AUX)),
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
  const confirmedInvoke: ConfirmedRecoverOwnerInvoke = {
    txid: INVOKE_TXID,
    minedHeight,
    recoveryDescriptorHash: descHash,
    invokeFields: {
      prevStateTxid: HEAD_TXID,
      newOwnerPubkey: NEW_OWNER,
      flags,
      successorBondVout: 0,
      challengeWindowBlocks: CWB,
      recoveryDescriptorHash: descHash,
      signature: bytesToHex(schnorr.sign(w13, hexToBytes(RECOVERY_PRIV), AUX)),
    },
  };

  return {
    confirmedInvoke,
    descriptor,
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

describe("enforceRecoveryInvoke — happy path (authorization verdict, no mutation)", () => {
  it("authorizes a fully-consistent invoke", () => {
    const b = buildValid();
    const { trace, verdict } = enforceRecoveryInvoke(b);
    expect(verdict.authorized).toBe(true);
    if (!verdict.authorized) return;
    expect(verdict.kind).toBe("recovery-invoke-authorized");
    expect(verdict.proposedOwnerPubkey).toBe(NEW_OWNER);
    expect(verdict.challengeWindowBlocks).toBe(CWB);
    expect(verdict.recoveryDescriptorHash).toBe(b.confirmedInvoke.recoveryDescriptorHash);
    expect(trace.map((s) => `${s.stage}:${s.ok}`)).toEqual([
      "cross-bind:true",
      "witness:true",
      "authority:true",
    ]);
  });

  it("emits NO state mutation (no owner / new-bond / pendingRecovery delta)", () => {
    const { verdict, ...rest } = enforceRecoveryInvoke(buildValid());
    expect(verdict.authorized).toBe(true);
    // The verdict is an admission, not a delta: only the authorization fields, nothing else.
    expect(Object.keys(verdict).sort()).toEqual([
      "authorized",
      "challengeWindowBlocks",
      "kind",
      "proposedOwnerPubkey",
      "recoveryDescriptorHash",
    ]);
    expect(Object.keys(rest)).toEqual(["trace"]);
  });

  it("is deterministic", () => {
    const b = buildValid();
    expect(enforceRecoveryInvoke(b)).toEqual(enforceRecoveryInvoke(b));
  });
});

describe("enforceRecoveryInvoke — cross-bind + witness", () => {
  it("rejects when invokeFields hash != confirmed invoke hash (before witness/kernel)", () => {
    const b = buildValid();
    const bad: RecoveryInvokeInput = {
      ...b,
      confirmedInvoke: {
        ...b.confirmedInvoke,
        invokeFields: { ...b.confirmedInvoke.invokeFields, recoveryDescriptorHash: OTHER_HASH },
      },
    };
    const { trace, verdict } = enforceRecoveryInvoke(bad);
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("rec-cross-bind-mismatch");
    expect(trace.every((s) => s.stage !== "witness" && s.stage !== "authority")).toBe(true);
  });

  it("routes a descriptor-digest mismatch through D-RC (rc-descriptor-hash-mismatch, no witness)", () => {
    // Cross-bind passes (both hashes OTHER_HASH) but the descriptor digests to descHash != OTHER_HASH.
    const b = buildValid();
    const bad: RecoveryInvokeInput = {
      ...b,
      confirmedInvoke: {
        ...b.confirmedInvoke,
        recoveryDescriptorHash: OTHER_HASH,
        invokeFields: { ...b.confirmedInvoke.invokeFields, recoveryDescriptorHash: OTHER_HASH },
      },
    };
    const { verdict } = enforceRecoveryInvoke(bad);
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("rc-descriptor-hash-mismatch");
  });

  it("uses the confirmed height as the only height — no producer witness channel", () => {
    // A witness / witnessedByHeight smuggled into invokeFields is rejected by closed-shape, so the
    // minted witness height can only be confirmedInvoke.minedHeight.
    const b = buildValid();
    const bad = {
      ...b,
      confirmedInvoke: {
        ...b.confirmedInvoke,
        invokeFields: { ...b.confirmedInvoke.invokeFields, witnessedByHeight: H_R + W_R },
      },
    } as unknown as RecoveryInvokeInput;
    const { verdict } = enforceRecoveryInvoke(bad);
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("rec-input-malformed");
  });
});

describe("enforceRecoveryInvoke — kernel rejects surfaced in the trace", () => {
  it("surfaces non-cancel flags (non-invoke-flags)", () => {
    const { trace, verdict } = enforceRecoveryInvoke(buildValid({ flags: 1 }));
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("non-invoke-flags");
    expect(trace.find((s) => s.stage === "authority")?.ok).toBe(false);
  });

  it("surfaces a wrong ownershipRef (descriptor-ownership-ref-not-current-interval)", () => {
    const b = buildValid();
    const { verdict } = enforceRecoveryInvoke({
      ...b,
      nameState: { ...b.nameState, currentOwnershipRef: OTHER_REF },
    });
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("descriptor-ownership-ref-not-current-interval");
  });

  it("surfaces a stale descriptor head (descriptor-head-sequence-mismatch)", () => {
    const b = buildValid();
    const { verdict } = enforceRecoveryInvoke({
      ...b,
      nameState: { ...b.nameState, recoveryDescriptorHeadSequence: SEQ + 1 },
    });
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("descriptor-head-sequence-mismatch");
  });
});

describe("enforceRecoveryInvoke — input validation + totality", () => {
  it("rejects an invokeFields carrying an extra minedHeight (closed-shape)", () => {
    const b = buildValid();
    const bad = {
      ...b,
      confirmedInvoke: {
        ...b.confirmedInvoke,
        invokeFields: { ...b.confirmedInvoke.invokeFields, minedHeight: H_R },
      },
    } as unknown as RecoveryInvokeInput;
    const { verdict } = enforceRecoveryInvoke(bad);
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("rec-input-malformed");
  });

  it("rejects a confirmedInvoke missing a key", () => {
    const b = buildValid();
    const { recoveryDescriptorHash, ...partial } = b.confirmedInvoke;
    void recoveryDescriptorHash;
    const bad = { ...b, confirmedInvoke: partial } as unknown as RecoveryInvokeInput;
    const { verdict } = enforceRecoveryInvoke(bad);
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("rec-input-malformed");
  });

  it("rejects a non-object descriptor", () => {
    const b = buildValid();
    const bad = { ...b, descriptor: "nope" } as unknown as RecoveryInvokeInput;
    const { verdict } = enforceRecoveryInvoke(bad);
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("rec-input-malformed");
  });

  it("fails closed on malformed nameState / params (kernel reason surfaced)", () => {
    const b = buildValid();
    const a = enforceRecoveryInvoke({ ...b, nameState: {} as unknown as RecoveryInvokeInput["nameState"] });
    const c = enforceRecoveryInvoke({ ...b, recoveryParams: {} as unknown as RecoveryInvokeInput["recoveryParams"] });
    expect(a.verdict.authorized).toBe(false);
    expect(c.verdict.authorized).toBe(false);
  });

  it("never throws on bogus input", () => {
    expect(() => enforceRecoveryInvoke(null as unknown as RecoveryInvokeInput)).not.toThrow();
    expect(() =>
      enforceRecoveryInvoke({ confirmedInvoke: 1, descriptor: 2 } as unknown as RecoveryInvokeInput),
    ).not.toThrow();
  });
});
