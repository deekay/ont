// Transcript completeness (T1 / T2 / T21 — canon Item 4 + the SOFTWARE_CANON L2 boundary
// rule) + D-CW lot block / soft-close range (B3 §13; ratified PR-19 / PR-29 via #66). The
// kernel's transcript-completeness verdict is a PURE deterministic predicate over witnessed
// inputs only — the counted bid transcript and a B3-verified completeness witness — with NO
// actor, source, endpoint, or producer parameter (T1): no out-of-kernel layer can override
// it. It fails closed when completeness is not witnessed by a verifier-checkable B3 witness
// — absent, producer-asserted, or otherwise not verifier-checkable ⇒ incomplete, never
// certified (T2 / canon Item 4) — and rejects a transcript whose counted bid set is not
// distinct and well-formed (T21).
//
// D-CW (B3 §13): the completeness witness is now CONCRETE — it carries the lot's opening floor
// + auction params and the enumerated L1 lot bids' full bid/bond facts. The kernel RECOMPUTES
// acceptance by folding the resident `acceptAuctionBid` over the bids in canonical
// (minedHeight, txIndex) order — soft-close extension is acceptance-only (PR-19), so the final
// close (and thus the in-range set) falls out of the fold. It does NOT trust a B3-supplied
// `effect`; a supplied `effect` is treated as asserted and fails closed on mismatch. Completeness
// = symmetric set-equality of the counted txid set vs the witnessed in-range lot bids
// (`[openHeight, finalClose]`, accepted + rejected). This recomputes acceptance EFFECTS only
// (consensus law under PR-19/PR-29); it does NOT select a winner (T7/T9).
//
// SCOPE: pins purity + the fail-closed completeness posture + txid integrity + the lot block /
// soft-close range. It DELIBERATELY DOES NOT decide the auction winner / amount / bidder
// identity (T7/T9), claim-counting / notice-deadline (T17), reopen / bond-continuity (T22), or
// recovery invoke admission (T19, #50-b1).
import {
  acceptAuctionBid,
  type AuctionBidFacts,
  type AuctionBidStateEffect,
  type AuctionBondFacts,
  type AuctionParams,
  type PriorAuctionState,
} from "./auction-resolution.js";

/**
 * One counted bid in the transcript: its L1 transaction id only (T21). There is no
 * bidder identity, amount, qualification, or source field — those belong to auction
 * resolution (T7/T9), not completeness.
 */
export interface CountedBid {
  /** The bid's L1 transaction id — 32-byte lowercase hex. */
  readonly txid: string;
}

/** The counted bid transcript whose completeness is under test. Identity-free and source-free. */
export interface AuctionTranscript {
  /** The counted bid set — must be distinct and well-formed (T21). */
  readonly bids: readonly CountedBid[];
}

/** One enumerated L1 lot bid in the witness, with the full facts `acceptAuctionBid` recomputes over. */
export interface CompletenessWitnessBid {
  /** The bid's L1 txid — 32-byte lowercase hex (the counted-transcript key). */
  readonly txid: string;
  /** Canonical same-height ordering index (deterministic fold order). */
  readonly txIndex: number;
  /** The bid facts `acceptAuctionBid` consumes (amount / minedHeight / bondVout / lotBinding). */
  readonly bidFacts: AuctionBidFacts;
  /** The bond facts `acceptAuctionBid` consumes (output kind + value). */
  readonly bondFacts: AuctionBondFacts;
  /**
   * OPTIONAL asserted effect, for fixture readability. The kernel does NOT trust it: it is
   * cross-checked against the recomputed `stateEffect` and fails closed on mismatch.
   */
  readonly effect?: AuctionBidStateEffect;
}

/** The lot's opening floor + auction params (launch-freeze inputs) the fold needs. */
export interface CompletenessWitnessLot {
  readonly openingFloorSats: bigint;
  readonly params: AuctionParams;
  /** OPTIONAL cross-check: if present, must equal the recomputed opening-bid height. */
  readonly openHeight?: number;
}

/**
 * A completeness witness, consumed as an input data object — never a callback, endpoint, actor
 * handle, producer flag, or bare boolean. Only a B3-verified, verifier-checkable witness (the
 * concrete enumeration below) satisfies the completeness posture; a producer-asserted witness is
 * never trusted (T2). The bare placeholder is RETIRED (D-CW): a verifier-checkable witness IS the
 * enumeration, so `lot` + `bids` are required.
 */
export type CompletenessWitness =
  | {
      readonly kind: "b3-verified-completeness-witness";
      readonly lot: CompletenessWitnessLot;
      readonly bids: readonly CompletenessWitnessBid[];
    }
  | { readonly kind: "producer-asserted" }; // self-asserted completeness — never trusted (T2)

export interface TranscriptCompletenessVerdict {
  readonly complete: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const reject = (reason: string): TranscriptCompletenessVerdict => ({ complete: false, reason });
const accept = (): TranscriptCompletenessVerdict => ({ complete: true, reason: "transcript-complete" });

/** A well-formed L1 txid is 32-byte lowercase hex (T21). */
const isWellFormedTxid = (txid: string): boolean => /^[0-9a-f]{64}$/.test(txid);

// T1 field-level no-source/identity guarantee, enforced at RUNTIME (not only in the type):
// each B2 object admits exactly its closed key set, so no producer / source / endpoint /
// actor field — nor any auction-resolution field (bidder, amount, …) — can ride the exported
// boundary; an object carrying an extra field is rejected, never silently ignored.
const TRANSCRIPT_KEYS = ["bids"] as const;
const COUNTED_BID_KEYS = ["txid"] as const;
const PRODUCER_WITNESS_KEYS = ["kind"] as const;
const B3_WITNESS_KEYS = ["kind", "lot", "bids"] as const;
const WITNESS_LOT_KEYS = ["openingFloorSats", "params", "openHeight"] as const;
const WITNESS_BID_KEYS = ["txid", "txIndex", "bidFacts", "bondFacts", "effect"] as const;
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/**
 * Decide whether `transcript` is a complete, well-formed counted bid set, given a
 * `completenessWitness` (null = absent).
 *
 * Pure and deterministic (T1); fail-closed (T2); txid integrity (T21); and — D-CW — the counted
 * set must equal the witnessed in-range lot bids over the recomputed `[openHeight, finalClose]`
 * soft-close range. Never throws.
 */
export function transcriptCompleteness(
  transcript: AuctionTranscript,
  completenessWitness: CompletenessWitness | null
): TranscriptCompletenessVerdict {
  const t = transcript as unknown;
  const w = completenessWitness as unknown;

  // T1 — the transcript must be a non-null object admitting ONLY `bids` (an array).
  if (!isObject(t)) {
    return reject("t1-transcript-malformed");
  }
  if (!isClosedShape(t, TRANSCRIPT_KEYS)) {
    return reject("t1-transcript-extra-field-rejected");
  }
  const bids = t.bids;
  if (!Array.isArray(bids)) {
    return reject("t1-transcript-bids-not-array");
  }

  // T2 — completeness must be witnessed by a verifier-checkable B3 witness. Absent or
  // producer-asserted fails closed.
  if (w == null) {
    return reject("t2-absent-completeness-witness");
  }
  if (!isObject(w) || typeof w.kind !== "string") {
    return reject("t1-witness-malformed");
  }
  if (w.kind === "producer-asserted") {
    if (!isClosedShape(w, PRODUCER_WITNESS_KEYS)) {
      return reject("t1-witness-extra-field-rejected");
    }
    return reject("t2-completeness-not-verifier-checkable");
  }
  if (w.kind !== "b3-verified-completeness-witness") {
    return reject("t2-completeness-not-verifier-checkable");
  }
  // T1 (witness shape) — the b3-verified witness admits ONLY {kind, lot, bids}.
  if (!isClosedShape(w, B3_WITNESS_KEYS)) {
    return reject("t1-witness-extra-field-rejected");
  }

  // T21 — the counted bid set must be distinct and well-formed (this runs before the range so a
  // forged transcript summary is rejected regardless of the witness).
  const counted = new Set<string>();
  for (const bid of bids) {
    if (!isObject(bid)) {
      return reject("t1-bid-malformed");
    }
    if (!isClosedShape(bid, COUNTED_BID_KEYS)) {
      return reject("t1-bid-extra-field-rejected");
    }
    if (typeof bid.txid !== "string" || !isWellFormedTxid(bid.txid)) {
      return reject("t21-malformed-bid-txid");
    }
    if (counted.has(bid.txid)) {
      return reject("t21-duplicate-bid-txid");
    }
    counted.add(bid.txid);
  }

  // D-CW — recompute the soft-close range + check completeness over the concrete witness.
  return completenessOverRange(w, counted);
}

// --- D-CW: lot block / soft-close range + symmetric set-equality (B3 §13). -------------------
const isNonNegBigInt = (x: unknown): x is bigint => typeof x === "bigint" && x >= 0n;
const isCompletenessWitnessLot = (x: unknown): x is CompletenessWitnessLot =>
  isObject(x) &&
  isClosedShape(x, WITNESS_LOT_KEYS) &&
  isNonNegBigInt(x.openingFloorSats) &&
  (x.openHeight === undefined || isSafeNonNegInt(x.openHeight));

// acceptAuctionBid reasons that mean the INPUT is malformed (vs a legitimate "none" rejection). A
// malformed bid/bond/param or an overflowing close height is a malformed witness, not an outcome.
const CW_FOLD_MALFORMED_REASONS = new Set<string>([
  "q1-bid-facts-malformed",
  "q3-bond-facts-malformed",
  "q1-prior-auction-state-malformed",
  "q1-auction-params-malformed",
  "q1-auction-close-height-overflow",
  "q7-soft-close-height-overflow",
]);
const CW_EFFECTS = new Set<AuctionBidStateEffect>(["none", "opens-auction", "updates-leading-bid"]);
const WITNESS_BID_REQUIRED = ["txid", "txIndex", "bidFacts", "bondFacts"] as const;

interface FoldBid {
  readonly txid: string;
  readonly minedHeight: number;
  readonly txIndex: number;
  readonly bidFacts: AuctionBidFacts;
  readonly bondFacts: AuctionBondFacts;
  readonly effect?: AuctionBidStateEffect;
}

/**
 * D-CW: recompute the lot block / soft-close range over the witness and check completeness. Validate
 * the witness envelope totally (closed-shape, txid/txIndex/bid/bond shapes, no duplicate txid or
 * chain position) BEFORE any fold; sort by (minedHeight, txIndex); fold the resident
 * `acceptAuctionBid` (which computes the acceptance-only close) threading prior state; cross-check a
 * supplied `effect` against the recomputation; require exactly one opener; then symmetric
 * set-equality of the counted txids vs the witnessed in-range bids over [openHeight, finalClose].
 */
function completenessOverRange(
  witness: Record<string, unknown>,
  counted: ReadonlySet<string>,
): TranscriptCompletenessVerdict {
  const lot = witness.lot;
  if (!isCompletenessWitnessLot(lot) || !Array.isArray(witness.bids)) {
    return reject("cw-witness-malformed");
  }
  // D-CW-strict: softCloseWindow MUST be > 0 (acceptAuctionBid only requires >= 0). Other param
  // malformations (non-positive base window, overflow, wrong types) are caught by the fold below.
  const params = lot.params as unknown;
  if (isObject(params) && typeof params.softCloseWindowBlocks === "number" && params.softCloseWindowBlocks <= 0) {
    return reject("cw-witness-malformed");
  }

  // Total fail-closed validation of every witness-bid envelope, before the fold.
  const parsed: FoldBid[] = [];
  for (const b of witness.bids) {
    if (
      !isObject(b) ||
      !isClosedShape(b, WITNESS_BID_KEYS) ||
      !WITNESS_BID_REQUIRED.every((k) => Object.prototype.hasOwnProperty.call(b, k)) ||
      typeof b.txid !== "string" ||
      !isWellFormedTxid(b.txid) ||
      !isSafeNonNegInt(b.txIndex) ||
      !isObject(b.bidFacts) ||
      !isSafeNonNegInt(b.bidFacts.minedHeight) ||
      !isObject(b.bondFacts) ||
      (b.effect !== undefined && !CW_EFFECTS.has(b.effect as AuctionBidStateEffect))
    ) {
      return reject("cw-witness-malformed");
    }
    parsed.push({
      txid: b.txid,
      minedHeight: b.bidFacts.minedHeight,
      txIndex: b.txIndex,
      bidFacts: b.bidFacts as unknown as AuctionBidFacts,
      bondFacts: b.bondFacts as unknown as AuctionBondFacts,
      ...(b.effect !== undefined ? { effect: b.effect as AuctionBidStateEffect } : {}),
    });
  }

  // Duplicate txid + duplicate (minedHeight, txIndex), before sort/fold (ordering must be determined).
  const seenTxid = new Set<string>();
  const seenPosition = new Set<string>();
  for (const b of parsed) {
    if (seenTxid.has(b.txid)) return reject("cw-duplicate-witness-txid");
    seenTxid.add(b.txid);
    const position = JSON.stringify([b.minedHeight, b.txIndex]);
    if (seenPosition.has(position)) return reject("cw-duplicate-chain-position");
    seenPosition.add(position);
  }

  // Canonical fold order: (minedHeight, txIndex).
  const ordered = [...parsed].sort((a, b) => a.minedHeight - b.minedHeight || a.txIndex - b.txIndex);

  // Fold acceptAuctionBid, recomputing every effect; never trust a supplied `effect`.
  let prior: PriorAuctionState = {
    openingFloorSats: lot.openingFloorSats,
    currentLeaderAmountSats: null,
    currentCloseHeight: null,
  };
  let openHeight: number | null = null;
  let openerCount = 0;
  for (const b of ordered) {
    const v = acceptAuctionBid(b.bidFacts, b.bondFacts, prior, lot.params);
    if (CW_FOLD_MALFORMED_REASONS.has(v.reason)) {
      return reject("cw-witness-malformed");
    }
    if (b.effect !== undefined && b.effect !== v.stateEffect) {
      return reject("cw-effect-forgery");
    }
    if (v.stateEffect === "opens-auction") {
      openerCount += 1;
      openHeight = b.minedHeight;
    }
    if (v.accepted) {
      prior = {
        openingFloorSats: lot.openingFloorSats,
        currentLeaderAmountSats: v.nextLeaderAmountSats,
        currentCloseHeight: v.nextCloseHeight,
      };
    }
  }
  if (openerCount === 0 || openHeight === null) return reject("cw-no-opener");
  if (openerCount > 1) return reject("cw-two-openers");
  if (lot.openHeight !== undefined && lot.openHeight !== openHeight) return reject("cw-open-height-mismatch");
  const finalClose = prior.currentCloseHeight;
  if (finalClose === null) return reject("cw-no-opener");

  // Symmetric set-equality: counted txids === witnessed in-range bids over [openHeight, finalClose].
  const inRange = new Set<string>();
  for (const b of parsed) {
    if (b.minedHeight >= openHeight && b.minedHeight <= finalClose) inRange.add(b.txid);
  }
  for (const txid of inRange) {
    if (!counted.has(txid)) return reject("cw-incomplete");
  }
  for (const txid of counted) {
    if (!inRange.has(txid)) return reject("cw-padded");
  }
  return accept();
}
