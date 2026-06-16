import { describe, expect, it } from "vitest";
import {
  computeRecoveryDescriptorHash,
  deriveOwnerPubkey,
  signRecoveryDescriptor,
  type SignedRecoveryDescriptor,
} from "@ont/protocol";
import {
  projectServedRecoveryHistory,
  type ProjectServedRecoveryHistoryInput,
} from "./serve-recovery-history.js";
import { validateRecoveryDescriptorSubmission } from "./validate-recovery-submission.js";
import type { OwnershipInterval } from "./validate-submission.js";

// B4-RESOLVE-READ-RECOVERY red battery (B4_ADAPTERS_PLAN §12.2). The resolver's recovery-history read
// projection — the recompute-don't-trust serving firewall, exact mirror of serve-value-history.* over recovery
// descriptors. A recovery-descriptor history is served ONLY if the whole chain independently re-verifies
// against the indexed ownership interval; any break rejects the WHOLE chain (fail-closed). The served ok shape
// carries explicit not-ownership-authority provenance. The projection adds NO descriptor-field policy beyond
// verifyRecoveryDescriptor (a non-default-but-valid descriptor serves). RED until the projection lands.

const NAME = "alice";
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
  name?: string;
  ownershipRef?: string;
  sequence?: number;
  previousDescriptorHash?: string | null;
  recoveryAddress?: string;
  signingProfile?: string;
  challengeWindowBlocks?: number;
  issuedAt?: string;
} = {}): SignedRecoveryDescriptor {
  return signRecoveryDescriptor({
    name: over.name ?? NAME,
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

const GENESIS = descriptor({ sequence: 1, previousDescriptorHash: null });
const SUCCESSOR = descriptor({ sequence: 2, previousDescriptorHash: computeRecoveryDescriptorHash(GENESIS), issuedAt: T1 });
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

function project(over: Partial<ProjectServedRecoveryHistoryInput> = {}) {
  return projectServedRecoveryHistory({ name: NAME, currentOwnership: CURRENT, descriptors: [GENESIS], ...over });
}

describe("projectServedRecoveryHistory — serve (self-verifying chains)", () => {
  it("clean genesis chain → serve faithfully + not-authority provenance", () => {
    const r = project({ descriptors: [GENESIS] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe(NAME);
    expect(r.ownershipRef).toBe(REF);
    expect(r.descriptors).toEqual([GENESIS]);
    expect(r.head).toEqual(GENESIS);
    expect(r.provenance).toBe("resolver-indexed-mirror");
    expect(r.authority).toBe("not-ownership-authority");
  });

  it("clean multi-descriptor chain → serve faithfully (head = newest)", () => {
    const r = project({ descriptors: [GENESIS, SUCCESSOR] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.descriptors).toEqual([GENESIS, SUCCESSOR]);
    expect(r.head).toEqual(SUCCESSOR);
  });

  it("non-default but protocol-valid descriptor fields (signingProfile custom_1, window 288) → serve (no extra field policy)", () => {
    const nonDefault = descriptor({ sequence: 1, previousDescriptorHash: null, signingProfile: "custom_1", challengeWindowBlocks: 288 });
    const r = project({ descriptors: [nonDefault] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.head).toEqual(nonDefault);
  });

  it("a RECOVER-guard-accepted chain projects cleanly (round-trip with B4-RESOLVE-RECOVER)", () => {
    expect(validateRecoveryDescriptorSubmission({ descriptor: GENESIS, currentOwnership: CURRENT, existingHead: null }).ok).toBe(true);
    expect(validateRecoveryDescriptorSubmission({ descriptor: SUCCESSOR, currentOwnership: CURRENT, existingHead: GENESIS }).ok).toBe(true);
    const r = project({ descriptors: [GENESIS, SUCCESSOR] });
    expect(r.ok).toBe(true);
  });
});

describe("projectServedRecoveryHistory — reject (no false serve)", () => {
  it("currentOwnership null → ownership-unknown", () => {
    const r = project({ currentOwnership: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-unknown");
  });

  it("empty descriptors → empty-history", () => {
    const r = project({ descriptors: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("empty-history");
  });

  it("forged / tampered signature → invalid-signature (never throws)", () => {
    const forged = { ...GENESIS, signature: "00".repeat(64) } as SignedRecoveryDescriptor;
    let r: ReturnType<typeof projectServedRecoveryHistory> | undefined;
    expect(() => { r = project({ descriptors: [forged] }); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("invalid-signature");
  });

  it("descriptor name != requested name → name-mismatch", () => {
    const wrongName = descriptor({ name: "bob", sequence: 1, previousDescriptorHash: null }); // valid self-sign, owner correct
    const r = project({ descriptors: [wrongName] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("name-mismatch");
  });

  it("owner mismatch ANYWHERE in the chain (not just head) → owner-mismatch", () => {
    const byOther = descriptor({ sk: OTHER_SK, sequence: 2, previousDescriptorHash: computeRecoveryDescriptorHash(GENESIS) }); // valid self-sign by non-owner
    const r = project({ descriptors: [GENESIS, byOther] }); // descriptor[0] valid, descriptor[1] wrong owner
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("owner-mismatch");
  });

  it("ownershipRef mismatch → ownership-ref-mismatch", () => {
    const wrongRef = descriptor({ ownershipRef: OTHER_REF, sequence: 1, previousDescriptorHash: null });
    const r = project({ descriptors: [wrongRef] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-ref-mismatch");
  });

  it("sequence break (gap, not contiguous 1..N) → sequence-broken", () => {
    const skip = descriptor({ sequence: 3, previousDescriptorHash: computeRecoveryDescriptorHash(GENESIS) });
    const r = project({ descriptors: [GENESIS, skip] }); // [1, 3] — index 1 expects sequence 2
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("sequence-broken");
  });

  it("broken predecessor (previousDescriptorHash does not chain) → predecessor-mismatch", () => {
    const badPrev = descriptor({ sequence: 2, previousDescriptorHash: "ef".repeat(32) });
    const r = project({ descriptors: [GENESIS, badPrev] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("predecessor-mismatch");
  });
});

describe("projectServedRecoveryHistory — totality", () => {
  it("malformed wrapper / descriptors / ownership inputs → reject (ok:false), never throws, never serves", () => {
    const cases: Array<() => ReturnType<typeof projectServedRecoveryHistory>> = [
      () => projectServedRecoveryHistory(null as unknown as ProjectServedRecoveryHistoryInput),
      () => project({ descriptors: null as unknown as readonly SignedRecoveryDescriptor[] }),
      () => project({ descriptors: [null as unknown as SignedRecoveryDescriptor] }),
      () => project({ descriptors: [{} as unknown as SignedRecoveryDescriptor] }),
      () => project({ currentOwnership: {} as unknown as OwnershipInterval }),
    ];
    for (const run of cases) {
      let r: ReturnType<typeof projectServedRecoveryHistory> | undefined;
      expect(() => { r = run(); }).not.toThrow(); // never throws
      expect(r?.ok).toBe(false); // fail-closed: never a false serve on malformed input
    }
  });

  it("is deterministic", () => {
    expect(project({ descriptors: [GENESIS, SUCCESSOR] })).toEqual(project({ descriptors: [GENESIS, SUCCESSOR] }));
  });
});
