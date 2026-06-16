import { describe, expect, it } from "vitest";
import {
  computeRecoveryDescriptorHash,
  deriveOwnerPubkey,
  signRecoveryDescriptor,
  type SignedRecoveryDescriptor,
} from "@ont/protocol";
import {
  validateRecoveryDescriptorSubmission,
  type ValidateRecoveryDescriptorSubmissionInput,
} from "./validate-recovery-submission.js";
import type { OwnershipInterval } from "./validate-submission.js";

// B4-RESOLVE-RECOVER red battery (B4_ADAPTERS_PLAN §12.2). The append-only recovery-descriptor submission
// store-guard — the exact mirror of res-guard.* over recovery descriptors. An untrusted descriptor may be
// appended to the off-chain mirror only if it is owner-signed by the interval's CURRENT owner, on the right
// ownership interval, at the exact-next sequence, chaining to the head. The bar is "no false append" — NOT
// resolver authority over recovery. The guard imposes NO policy on descriptor fields beyond the signed digest
// (recoveryAddress/signingProfile/challengeWindowBlocks): a non-default-but-protocol-valid descriptor is
// accepted when owner/ref/sequence/predecessor are correct. RED until the guard lands (the stub rejects).

const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const OTHER_SK = "22".repeat(32);
const REF = "ab".repeat(32);
const OTHER_REF = "cd".repeat(32);
const RECOVERY_ADDRESS = "bc1qexamplerecoveryaddress00000000000000000";
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";

function descriptor(over: {
  sk?: string;
  ownershipRef?: string;
  sequence?: number;
  previousDescriptorHash?: string | null;
  recoveryAddress?: string;
  signingProfile?: string;
  challengeWindowBlocks?: number;
  issuedAt?: string;
} = {}): SignedRecoveryDescriptor {
  return signRecoveryDescriptor({
    name: "alice",
    ownerPrivateKeyHex: over.sk ?? OWNER_SK,
    ownershipRef: over.ownershipRef ?? REF,
    sequence: over.sequence ?? 1,
    previousDescriptorHash: over.previousDescriptorHash ?? null,
    recoveryAddress: over.recoveryAddress ?? RECOVERY_ADDRESS,
    signingProfile: over.signingProfile, // undefined → default "bip322"
    challengeWindowBlocks: over.challengeWindowBlocks, // undefined → default 144
    issuedAt: over.issuedAt ?? T0,
  });
}

const HEAD = descriptor({ sequence: 1, previousDescriptorHash: null }); // genesis head (seq 1)
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

function validate(over: Partial<ValidateRecoveryDescriptorSubmissionInput> & { descriptor?: SignedRecoveryDescriptor }) {
  return validateRecoveryDescriptorSubmission({ descriptor: HEAD, currentOwnership: CURRENT, existingHead: null, ...over });
}

describe("validateRecoveryDescriptorSubmission — accept (clean appends)", () => {
  it("valid genesis (seq 1, previousDescriptorHash null) → accept", () => {
    const r = validate({ descriptor: descriptor({ sequence: 1, previousDescriptorHash: null }), existingHead: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ownershipRef).toBe(REF);
    expect(r.expectedSequence).toBe(1);
    expect(r.expectedPreviousDescriptorHash).toBeNull();
  });

  it("valid successor (seq head+1, previousDescriptorHash = hash(head)) → accept", () => {
    const next = descriptor({ sequence: 2, previousDescriptorHash: computeRecoveryDescriptorHash(HEAD), issuedAt: T1 });
    const r = validate({ descriptor: next, existingHead: HEAD });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expectedSequence).toBe(2);
    expect(r.expectedPreviousDescriptorHash).toBe(computeRecoveryDescriptorHash(HEAD));
  });

  it("non-default but protocol-valid descriptor fields (signingProfile custom_1, window 288) → accept (no extra field policy)", () => {
    const nonDefault = descriptor({
      sequence: 1,
      previousDescriptorHash: null,
      signingProfile: "custom_1",
      challengeWindowBlocks: 288,
    });
    const r = validate({ descriptor: nonDefault, existingHead: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.expectedSequence).toBe(1);
    expect(r.expectedPreviousDescriptorHash).toBeNull();
  });
});

describe("validateRecoveryDescriptorSubmission — reject (no false append)", () => {
  it("invalid / tampered signature → invalid-signature (never throws)", () => {
    const forged = { ...HEAD, signature: "00".repeat(64) } as SignedRecoveryDescriptor;
    let r: ReturnType<typeof validateRecoveryDescriptorSubmission> | undefined;
    expect(() => { r = validate({ descriptor: forged, existingHead: null }); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("invalid-signature");
  });

  it("currentOwnership null → ownership-unknown", () => {
    const r = validate({ currentOwnership: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-unknown");
  });

  it("owner mismatch (self-signed by a non-owner, right ownershipRef) → owner-mismatch", () => {
    const byOther = descriptor({ sk: OTHER_SK, sequence: 1, previousDescriptorHash: null }); // valid self-sign, REF correct
    const r = validate({ descriptor: byOther, existingHead: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("owner-mismatch");
  });

  it("ownershipRef mismatch → ownership-ref-mismatch", () => {
    const wrongRef = descriptor({ ownershipRef: OTHER_REF, sequence: 1, previousDescriptorHash: null });
    const r = validate({ descriptor: wrongRef, existingHead: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-ref-mismatch");
  });

  it("stale sequence (< expected) → stale-sequence", () => {
    const r = validate({ descriptor: descriptor({ sequence: 1, previousDescriptorHash: null }), existingHead: HEAD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stale-sequence");
  });

  it("sequence gap (> expected) → sequence-gap", () => {
    const skip = descriptor({ sequence: 3, previousDescriptorHash: computeRecoveryDescriptorHash(HEAD) });
    const r = validate({ descriptor: skip, existingHead: HEAD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("sequence-gap");
  });

  it("predecessor mismatch (wrong previousDescriptorHash) → predecessor-mismatch", () => {
    const badPrev = descriptor({ sequence: 2, previousDescriptorHash: "ef".repeat(32) });
    const r = validate({ descriptor: badPrev, existingHead: HEAD });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("predecessor-mismatch");
  });
});

describe("validateRecoveryDescriptorSubmission — totality", () => {
  it("malformed wrapper / ownership / head inputs → reject (ok:false), never throws, never appends", () => {
    const nextValid = descriptor({ sequence: 2, previousDescriptorHash: computeRecoveryDescriptorHash(HEAD) });
    const cases: Array<() => ReturnType<typeof validateRecoveryDescriptorSubmission>> = [
      () => validateRecoveryDescriptorSubmission(null as unknown as ValidateRecoveryDescriptorSubmissionInput),
      () => validate({ descriptor: null as unknown as SignedRecoveryDescriptor }),
      () => validate({ currentOwnership: {} as unknown as OwnershipInterval }),
      () => validate({ descriptor: nextValid, existingHead: {} as unknown as SignedRecoveryDescriptor }),
    ];
    for (const run of cases) {
      let r: ReturnType<typeof validateRecoveryDescriptorSubmission> | undefined;
      expect(() => { r = run(); }).not.toThrow(); // never throws
      expect(r?.ok).toBe(false); // fail-closed: never a false append on malformed input
    }
  });

  it("is deterministic", () => {
    const next = descriptor({ sequence: 2, previousDescriptorHash: computeRecoveryDescriptorHash(HEAD), issuedAt: T1 });
    expect(validate({ descriptor: next, existingHead: HEAD })).toEqual(validate({ descriptor: next, existingHead: HEAD }));
  });
});
