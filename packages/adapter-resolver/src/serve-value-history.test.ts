import { describe, expect, it } from "vitest";
import {
  computeValueRecordHash,
  deriveOwnerPubkey,
  signValueRecord,
  type SignedValueRecord,
} from "@ont/protocol";
import {
  projectServedValueHistory,
  type ProjectServedValueHistoryInput,
} from "./serve-value-history.js";
import { validateValueRecordSubmission, type OwnershipInterval } from "./validate-submission.js";

// B4-RESOLVE-READ red battery (B4_ADAPTERS_PLAN §12.2). The resolver's value-history read projection — the
// recompute-don't-trust serving firewall. A value-record history is served ONLY if the whole chain
// independently re-verifies against the indexed ownership interval; any break (forged sig, wrong owner/ref/name
// anywhere, sequence break, broken predecessor) rejects the WHOLE chain (fail-closed). The served ok shape
// carries explicit not-ownership-authority provenance. RED until the projection lands (the stub rejects).

const NAME = "alice";
const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const OTHER_SK = "22".repeat(32);
const REF = "ab".repeat(32);
const OTHER_REF = "cd".repeat(32);
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";

function record(over: {
  sk?: string;
  name?: string;
  ownershipRef?: string;
  sequence?: number;
  previousRecordHash?: string | null;
  payloadHex?: string;
  issuedAt?: string;
} = {}): SignedValueRecord {
  return signValueRecord({
    name: over.name ?? NAME,
    ownerPrivateKeyHex: over.sk ?? OWNER_SK,
    ownershipRef: over.ownershipRef ?? REF,
    sequence: over.sequence ?? 1,
    previousRecordHash: over.previousRecordHash ?? null,
    valueType: 0,
    payloadHex: over.payloadHex ?? "00",
    issuedAt: over.issuedAt ?? T0,
  });
}

const GENESIS = record({ sequence: 1, previousRecordHash: null });
const SUCCESSOR = record({ sequence: 2, previousRecordHash: computeValueRecordHash(GENESIS), payloadHex: "01", issuedAt: T1 });
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

function project(over: Partial<ProjectServedValueHistoryInput> = {}) {
  return projectServedValueHistory({ name: NAME, currentOwnership: CURRENT, records: [GENESIS], ...over });
}

describe("projectServedValueHistory — serve (self-verifying chains)", () => {
  it("clean genesis chain → serve faithfully + not-authority provenance", () => {
    const r = project({ records: [GENESIS] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toBe(NAME);
    expect(r.ownershipRef).toBe(REF);
    expect(r.records).toEqual([GENESIS]);
    expect(r.head).toEqual(GENESIS);
    expect(r.provenance).toBe("resolver-indexed-mirror");
    expect(r.authority).toBe("not-ownership-authority");
  });

  it("clean multi-record chain → serve faithfully (head = newest)", () => {
    const r = project({ records: [GENESIS, SUCCESSOR] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.records).toEqual([GENESIS, SUCCESSOR]);
    expect(r.head).toEqual(SUCCESSOR);
  });

  it("a GUARD-accepted chain projects cleanly (round-trip with B4-RESOLVE-GUARD)", () => {
    // Each record is accepted by the append store-guard in sequence; the resulting chain must project.
    expect(validateValueRecordSubmission({ record: GENESIS, currentOwnership: CURRENT, existingHead: null }).ok).toBe(true);
    expect(validateValueRecordSubmission({ record: SUCCESSOR, currentOwnership: CURRENT, existingHead: GENESIS }).ok).toBe(true);
    const r = project({ records: [GENESIS, SUCCESSOR] });
    expect(r.ok).toBe(true);
  });
});

describe("projectServedValueHistory — reject (no false serve)", () => {
  it("currentOwnership null → ownership-unknown", () => {
    const r = project({ currentOwnership: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-unknown");
  });

  it("empty records → empty-history", () => {
    const r = project({ records: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("empty-history");
  });

  it("forged / tampered signature → invalid-signature (never throws)", () => {
    const forged = { ...GENESIS, signature: "00".repeat(64) } as SignedValueRecord;
    let r: ReturnType<typeof projectServedValueHistory> | undefined;
    expect(() => { r = project({ records: [forged] }); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("invalid-signature");
  });

  it("record name != requested name → name-mismatch", () => {
    const wrongName = record({ name: "bob", sequence: 1, previousRecordHash: null }); // valid self-sign, owner correct
    const r = project({ records: [wrongName] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("name-mismatch");
  });

  it("owner mismatch ANYWHERE in the chain (not just head) → owner-mismatch", () => {
    const byOther = record({ sk: OTHER_SK, sequence: 2, previousRecordHash: computeValueRecordHash(GENESIS) }); // valid self-sign by non-owner
    const r = project({ records: [GENESIS, byOther] }); // record[0] valid, record[1] wrong owner
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("owner-mismatch");
  });

  it("ownershipRef mismatch → ownership-ref-mismatch", () => {
    const wrongRef = record({ ownershipRef: OTHER_REF, sequence: 1, previousRecordHash: null });
    const r = project({ records: [wrongRef] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ownership-ref-mismatch");
  });

  it("sequence break (gap, not contiguous 1..N) → sequence-broken", () => {
    const skip = record({ sequence: 3, previousRecordHash: computeValueRecordHash(GENESIS) });
    const r = project({ records: [GENESIS, skip] }); // [1, 3] — index 1 expects sequence 2
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("sequence-broken");
  });

  it("broken predecessor (previousRecordHash does not chain) → predecessor-mismatch", () => {
    const badPrev = record({ sequence: 2, previousRecordHash: "ef".repeat(32) });
    const r = project({ records: [GENESIS, badPrev] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("predecessor-mismatch");
  });
});

describe("projectServedValueHistory — totality", () => {
  it("malformed wrapper / records inputs → reject (ok:false), never throws, never serves", () => {
    const cases: Array<() => ReturnType<typeof projectServedValueHistory>> = [
      () => projectServedValueHistory(null as unknown as ProjectServedValueHistoryInput),
      () => project({ records: null as unknown as readonly SignedValueRecord[] }),
      () => project({ records: [null as unknown as SignedValueRecord] }),
      () => project({ records: [{} as unknown as SignedValueRecord] }),
    ];
    for (const run of cases) {
      let r: ReturnType<typeof projectServedValueHistory> | undefined;
      expect(() => { r = run(); }).not.toThrow(); // never throws
      expect(r?.ok).toBe(false); // fail-closed: never a false serve on malformed input
    }
  });

  it("is deterministic", () => {
    expect(project({ records: [GENESIS, SUCCESSOR] })).toEqual(project({ records: [GENESIS, SUCCESSOR] }));
  });
});
