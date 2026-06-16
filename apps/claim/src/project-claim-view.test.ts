import { describe, expect, it } from "vitest";
import { deriveOwnerPubkey, signValueRecord, type SignedValueRecord } from "@ont/protocol";
import { projectServedValueHistory, type OwnershipInterval } from "@ont/adapter-resolver";
import { projectClaimView } from "./project-claim-view.js";

// B5-CLAIM red battery — claim view-model projection. Folds a REAL resolver served-history read into the page
// view-model, PRESERVING the not-ownership-authority / resolver-indexed-mirror stamps; never presents the
// convenience data as authority; unavailable when the read is rejected. RED until the core lands (stub).

const NAME = "alice";
const OWNER_SK = "11".repeat(32);
const OWNER_PUB = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const CURRENT: OwnershipInterval = { currentOwnerPubkey: OWNER_PUB, ownershipRef: REF };

function record(sequence: number, previousRecordHash: string | null): SignedValueRecord {
  return signValueRecord({
    name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence,
    previousRecordHash, valueType: 0, payloadHex: "00", issuedAt: "2026-01-01T00:00:00.000Z",
  });
}

// A genuine served-ok result from the real resolver read (single-record genesis chain).
const SERVED_OK = projectServedValueHistory({ name: NAME, currentOwnership: CURRENT, records: [record(1, null)] });

describe("projectClaimView — serve", () => {
  it("served-ok → view carries the resolver's not-authority stamps verbatim", () => {
    expect(SERVED_OK.ok).toBe(true); // guard the fixture
    const r = projectClaimView(SERVED_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.name).toBe(NAME);
    expect(r.view.status).toBe("served");
    expect(r.view.recordCount).toBe(1);
    expect(r.view.provenance).toBe("resolver-indexed-mirror");
    expect(r.view.authority).toBe("not-ownership-authority");
  });
});

describe("projectClaimView — unavailable", () => {
  it("served-rejected → unavailable (no fabricated state)", () => {
    const rejected = projectServedValueHistory({ name: NAME, currentOwnership: null, records: [] });
    expect(rejected.ok).toBe(false); // guard the fixture
    const r = projectClaimView(rejected);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unavailable");
  });

  it("malformed served → unavailable (never throws)", () => {
    let r: ReturnType<typeof projectClaimView> | undefined;
    expect(() => { r = projectClaimView(null as unknown as typeof SERVED_OK); }).not.toThrow();
    expect(r?.ok).toBe(false);
  });
});

describe("projectClaimView — determinism", () => {
  it("is deterministic", () => {
    expect(projectClaimView(SERVED_OK)).toEqual(projectClaimView(SERVED_OK));
  });
});
