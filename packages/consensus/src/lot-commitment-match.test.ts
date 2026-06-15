import { describe, expect, it } from "vitest";
import { computeLotCommitment } from "@ont/wire";

import { lotCommitmentMatch, type LotCommitmentBid } from "./lot-commitment-match.js";

const PREIMAGE = { auctionId: "opening-alice", name: "alice", unlockBlock: 0 };
const CORRECT = computeLotCommitment(PREIMAGE);
const bid = (overrides: Partial<LotCommitmentBid> = {}): LotCommitmentBid => ({
  claimedLotCommitment: CORRECT,
  ...PREIMAGE,
  ...overrides,
});

describe("lotCommitmentMatch — B12 WIRE §6 recompute-and-compare", () => {
  it("admits a bid whose claimed commitment matches the recomputation", () => {
    expect(lotCommitmentMatch(bid())).toEqual({ matches: true, reason: "b12-lot-commitment-match" });
  });

  it("refuses a bid whose claimed commitment binds a different lot (no parallel lot minted)", () => {
    // claimed commitment is for unlockBlock 1, but the bid's preimage says unlockBlock 0 -> mismatch.
    const claimedForDifferentUnlock = computeLotCommitment({ ...PREIMAGE, unlockBlock: 1 });
    expect(lotCommitmentMatch(bid({ claimedLotCommitment: claimedForDifferentUnlock }))).toEqual({
      matches: false,
      reason: "b12-lot-commitment-mismatch",
    });
    // a fabricated commitment also mismatches.
    expect(lotCommitmentMatch(bid({ claimedLotCommitment: "f".repeat(64) })).matches).toBe(false);
    // a different auctionId / name likewise rebinds the lot and mismatches the claimed commitment.
    expect(lotCommitmentMatch(bid({ auctionId: "opening-bob" })).matches).toBe(false);
    expect(lotCommitmentMatch(bid({ name: "bob" })).matches).toBe(false);
  });

  it("fails closed on a non-canonical name preimage (wire primitive rejects) without throwing", () => {
    expect(lotCommitmentMatch(bid({ name: "Alice" }))).toEqual({ matches: false, reason: "b12-lot-preimage-invalid" });
  });

  it("fails closed on malformed / extra-field bid input", () => {
    expect(lotCommitmentMatch(null as never).matches).toBe(false);
    expect(lotCommitmentMatch(bid({ claimedLotCommitment: "abc" })).reason).toBe("b12-claimed-commitment-malformed");
    expect(lotCommitmentMatch({ ...bid(), source: "x" } as never).reason).toBe("b12-bid-malformed");
    expect(lotCommitmentMatch(bid({ unlockBlock: -1 })).reason).toBe("b12-unlock-block-malformed");
    expect(lotCommitmentMatch(bid({ auctionId: "" })).reason).toBe("b12-auction-id-malformed");
  });

  it("is deterministic on identical inputs", () => {
    expect(lotCommitmentMatch(bid())).toEqual(lotCommitmentMatch(bid()));
  });
});
