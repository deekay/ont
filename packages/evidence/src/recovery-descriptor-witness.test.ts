// D-RC recovery descriptor-evidence timing witness red battery (B3; ratified #86 / O1). Recompute-
// don't-trust: D-RC mints witnessedByHeight = h_r ONLY when the presented descriptor's
// recoveryDescriptorDigest reconstructs the invoke-committed hash. Authorization (R2/R3/R4/R7 + closed
// descriptor shape) stays the kernel's acceptRecoverOwner — D-RC does not re-check it (narrowed seam).
//
// RED PHASE: verifyRecoveryDescriptorWitness is stubbed to reject ("rc-pending-green-impl"); every
// assertion below is therefore red until the green impl lands.
import { describe, expect, it } from "vitest";

import {
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION_V1,
  RECOVERY_DESCRIPTOR_VERSION_V2,
  bytesToHex,
  recoveryDescriptorDigest,
} from "@ont/wire";

import {
  verifyRecoveryDescriptorWitness,
  type VerifyRecoveryDescriptorWitnessInput,
} from "./recovery-descriptor-witness.js";

const H_R = 100_000;

// A well-formed v2 descriptor (mirrors the kernel test fixture shape); the signature is not part of the
// digest preimage, so a placeholder is fine.
function v2Descriptor(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V2,
    name: "alice",
    ownerPubkey: "11".repeat(32),
    ownershipRef: "aa".repeat(32),
    sequence: 3,
    previousDescriptorHash: null,
    recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
    signingProfile: "bip322",
    challengeWindowBlocks: 144,
    issuedAt: "2026-01-01T00:00:00Z",
    recoveryPubkey: "33".repeat(32),
    signature: "00".repeat(64),
    ...over,
  };
}

// A well-formed v1 descriptor (no recoveryPubkey — v1 rejects it).
function v1Descriptor(): Record<string, unknown> {
  return {
    format: RECOVERY_DESCRIPTOR_FORMAT,
    descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V1,
    name: "alice",
    ownerPubkey: "11".repeat(32),
    ownershipRef: "aa".repeat(32),
    sequence: 3,
    previousDescriptorHash: null,
    recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
    signingProfile: "bip322",
    challengeWindowBlocks: 144,
    issuedAt: "2026-01-01T00:00:00Z",
    signature: "00".repeat(64),
  };
}

const hashOf = (descriptor: Record<string, unknown>): string => bytesToHex(recoveryDescriptorDigest(descriptor));

describe("D-RC recovery descriptor witness — verifyRecoveryDescriptorWitness (#86 / O1)", () => {
  it("mints { witnessedByHeight: h_r } when the presented descriptor reconstructs the committed hash", () => {
    const descriptor = v2Descriptor();
    const input: VerifyRecoveryDescriptorWitnessInput = {
      descriptor,
      committedDescriptorHash: hashOf(descriptor),
      confirmedInvokeMinedHeight: H_R,
    };
    expect(verifyRecoveryDescriptorWitness(input)).toEqual({
      ok: true,
      witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: H_R },
    });
  });

  it("the minted height is h_r itself, not a resolver time (O1) — witnessedByHeight tracks the invoke height", () => {
    const descriptor = v2Descriptor();
    const result = verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: hashOf(descriptor),
      confirmedInvokeMinedHeight: 543_210,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.witness.witnessedByHeight).toBe(543_210);
    // §3c composition: witnessedByHeight = h_r ⇒ the kernel's `<= h_r + W_r` holds for any W_r >= 0.
    expect(result.witness.witnessedByHeight).toBeLessThanOrEqual(543_210 + 1);
    expect(result.witness.kind).toBe("b3-verified-recovery-descriptor-witness");
  });

  it("does NOT gate on descriptor version (R7 stays the kernel's) — a v1 descriptor still mints on match", () => {
    const descriptor = v1Descriptor();
    expect(verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: hashOf(descriptor),
      confirmedInvokeMinedHeight: H_R,
    })).toEqual({
      ok: true,
      witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: H_R },
    });
  });

  it("rejects a descriptor whose fingerprint does not match the committed hash", () => {
    const descriptor = v2Descriptor();
    expect(verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: "12".repeat(32),
      confirmedInvokeMinedHeight: H_R,
    })).toEqual({ ok: false, reason: "rc-descriptor-hash-mismatch" });
  });

  it("rejects a malformed descriptor (digest throws) — fail closed, never throws", () => {
    expect(verifyRecoveryDescriptorWitness({
      descriptor: v2Descriptor({ ownerPubkey: "not-hex" }),
      committedDescriptorHash: hashOf(v2Descriptor()),
      confirmedInvokeMinedHeight: H_R,
    }).reason).toBe("rc-descriptor-malformed");
  });

  it("treats a non-object descriptor as a top-level shape fault (rc-input-malformed, not descriptor-malformed)", () => {
    expect(verifyRecoveryDescriptorWitness({
      descriptor: null as never,
      committedDescriptorHash: hashOf(v2Descriptor()),
      confirmedInvokeMinedHeight: H_R,
    }).reason).toBe("rc-input-malformed");
  });

  it("rejects missing required top-level keys (descriptor / committedDescriptorHash / confirmedInvokeMinedHeight)", () => {
    const descriptor = v2Descriptor();
    const hash = hashOf(descriptor);
    expect(verifyRecoveryDescriptorWitness({ committedDescriptorHash: hash, confirmedInvokeMinedHeight: H_R } as never).reason).toBe("rc-input-malformed");
    expect(verifyRecoveryDescriptorWitness({ descriptor, confirmedInvokeMinedHeight: H_R } as never).reason).toBe("rc-input-malformed");
    expect(verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash: hash } as never).reason).toBe("rc-input-malformed");
  });

  it("still mints when the descriptor carries an INTERNAL extra field (envelope closed-shape is the kernel's, not D-RC's)", () => {
    // recoveryDescriptorDigest ignores unknown fields, so a `source`/`servedAt` inside the descriptor
    // does NOT change the digest — D-RC mints on the match; the kernel rejects the extra (descriptor-extra-field).
    const descriptor = v2Descriptor({ source: "resolver-x" });
    expect(verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: hashOf(descriptor),
      confirmedInvokeMinedHeight: H_R,
    })).toEqual({ ok: true, witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: H_R } });
  });

  it("still mints with a wrong/malformed owner arming signature (R2 stays the kernel's; the digest excludes the signature)", () => {
    const descriptor = v2Descriptor({ signature: "ff".repeat(64) }); // valid hex, cryptographically wrong
    expect(verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: hashOf(descriptor),
      confirmedInvokeMinedHeight: H_R,
    })).toEqual({ ok: true, witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: H_R } });
  });

  it("is total on a malformed/null top-level input — never throws", () => {
    expect(verifyRecoveryDescriptorWitness(null as never)).toEqual({ ok: false, reason: "rc-input-malformed" });
  });

  it("rejects an extra source/timestamp channel on the input (closed shape)", () => {
    const descriptor = v2Descriptor();
    expect(verifyRecoveryDescriptorWitness({
      descriptor,
      committedDescriptorHash: hashOf(descriptor),
      confirmedInvokeMinedHeight: H_R,
      servedAt: 12_345,
    } as never).reason).toBe("rc-input-malformed");
  });

  it("rejects a malformed committed hash (not 32-byte lowercase hex)", () => {
    const descriptor = v2Descriptor();
    expect(verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash: "ab", confirmedInvokeMinedHeight: H_R }).reason).toBe("rc-input-malformed");
    expect(verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash: "AB".repeat(32), confirmedInvokeMinedHeight: H_R }).reason).toBe("rc-input-malformed");
  });

  it("rejects a malformed invoke height (negative / non-integer / non-number)", () => {
    const descriptor = v2Descriptor();
    const hash = hashOf(descriptor);
    expect(verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash: hash, confirmedInvokeMinedHeight: -1 }).reason).toBe("rc-input-malformed");
    expect(verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash: hash, confirmedInvokeMinedHeight: 1.5 }).reason).toBe("rc-input-malformed");
    expect(verifyRecoveryDescriptorWitness({ descriptor, committedDescriptorHash: hash, confirmedInvokeMinedHeight: "100000" as never }).reason).toBe("rc-input-malformed");
  });
});
