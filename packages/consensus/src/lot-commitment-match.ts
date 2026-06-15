// B2 lot-commitment-match predicate (B12 / WIRE §6). A PURE, total, closed-shape verdict: a bid's
// claimed lot commitment is accepted only if it equals the WIRE §6 recomputation over the bid's
// (auctionId, name, unlockBlock). A mismatch is refused — so an attacker cannot mint a parallel lot
// for a single name by binding a fabricated commitment.
//
// It rides the audited B1 @ont/wire `computeLotCommitment` primitive
// (sha256(lenPrefix("ont-auction-lot") ‖ lenPrefix(text(auctionId)) ‖ lenPrefix(name) ‖
// lenPrefix(decimal(unlockBlock)))) — the same authority the wire encoder uses — rather than a
// re-stated hash. No legacy @ont/protocol normalization is imported.
//
// SCOPE: this is ONLY the recompute-and-compare check (B12). The auctionId GRAMMAR
// (opening-{name} / reopen-{name}-after-{r}, PR-28) is NOT validated here — `computeLotCommitment`
// treats auctionId as opaque preimage text per WIRE §6; broader lot-witness / indexer integration and
// the release-anchor matching (reopen #70 / S9) stay their own slices. The name preimage must be
// canonical (computeLotCommitment rides the same isCanonicalName as #75); a non-canonical name fails
// the recomputation and rejects.
//
// Total / fail-closed + closed-shape (the #63-#77 discipline): a malformed bid (non-hex32 claimed
// commitment, non-string auctionId/name, non-integer unlockBlock, extra field) rejects, and the wire
// primitive — which THROWS on a non-canonical name / out-of-range unlockBlock / bad text — is wrapped
// so any throw becomes a fail-closed reject, never an exception.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md B12; docs/spec/WIRE_FORMAT.md §6 Auction commitments.

import { computeLotCommitment } from "@ont/wire";

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isHex32 = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);

export interface LotCommitmentBid {
  /** The bid's on-chain auctionLotCommitment field (32-byte lowercase hex). */
  readonly claimedLotCommitment: string;
  /** The lot preimage fields (WIRE §6): the auctionId is opaque preimage text (grammar is B3/PR-28). */
  readonly auctionId: string;
  /** The canonical name preimage. */
  readonly name: string;
  /** The unlockBlock preimage (u32). */
  readonly unlockBlock: number;
}

export interface LotCommitmentVerdict {
  /** True iff the claimed commitment equals the WIRE §6 recomputation over the preimage. */
  readonly matches: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const BID_KEYS = ["claimedLotCommitment", "auctionId", "name", "unlockBlock"] as const;
const reject = (reason: string): LotCommitmentVerdict => ({ matches: false, reason });

/**
 * Decide whether `bid.claimedLotCommitment` equals the WIRE §6 lot commitment recomputed from
 * `(auctionId, name, unlockBlock)` (B12). Pure and total — a malformed bid or a preimage the wire
 * primitive rejects fails closed and never throws. A mismatch refuses (no parallel lot for the name).
 */
export function lotCommitmentMatch(bid: LotCommitmentBid): LotCommitmentVerdict {
  const b = bid as unknown;
  if (!isObject(b) || !isClosedShape(b, BID_KEYS)) {
    return reject("b12-bid-malformed");
  }
  if (!isHex32(b.claimedLotCommitment)) {
    return reject("b12-claimed-commitment-malformed");
  }
  if (typeof b.auctionId !== "string" || b.auctionId.length === 0) {
    return reject("b12-auction-id-malformed");
  }
  if (typeof b.name !== "string") {
    return reject("b12-name-malformed");
  }
  if (!isSafeNonNegInt(b.unlockBlock)) {
    return reject("b12-unlock-block-malformed");
  }

  let recomputed: string;
  try {
    recomputed = computeLotCommitment({ auctionId: b.auctionId, name: b.name, unlockBlock: b.unlockBlock });
  } catch {
    // The wire primitive rejects a non-canonical name / out-of-range unlockBlock / bad preimage text.
    return reject("b12-lot-preimage-invalid");
  }
  if (recomputed !== b.claimedLotCommitment) {
    // The recomputed commitment does not match the claimed lot — no parallel lot is minted.
    return reject("b12-lot-commitment-mismatch");
  }
  return { matches: true, reason: "b12-lot-commitment-match" };
}
