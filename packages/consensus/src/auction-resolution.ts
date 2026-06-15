// Auction resolution predicates (Q/T/G). Pure, total, closed-shape verdicts for the B2
// auction surface: opening floor, bid acceptance, and winner selection.
//
// SCOPE (B2 slice Q1/Q2/Q3/Q4/Q7/Q9/Q10/T7/T9/G1):
//   - Q2 / PR-14: opening floor is a caller-supplied launch parameter surface keyed by
//     canonical name byte length: <=4 uses the short-name halving curve clamped by the
//     long-name floor; >=5 uses the flat long-name floor.
//   - Q1/Q3/Q4/Q7/Q10 / PR-19/21/#37: bid acceptance is a conjunction over floor/increment,
//     timing, lot binding, and bond facts. A non-accepted bid has no state effect.
//   - Q9/T7/T9/G1 / #37/#25: winner selection is defined only over a complete transcript,
//     selects the largest accepted bid, and resolves same-block equal-amount ties by lower txIndex.
//
// DELIBERATELY EXCLUDED: production indexer integration; concrete transcript-completeness witness
// format; positive script-class enumeration; one-bond-one-bid / replacement-chain validation
// (Q8/F13/F14/T12); and any @ont/core auction-sim or allocation-policy import. The bidder-control
// and lot-binding facts are consumed as B3-verified labelled inputs, not derived here.

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isSafeNonNegInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const isPositiveSafeInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 1;
const isNonNegBigInt = (x: unknown): x is bigint => typeof x === "bigint" && x >= 0n;
const isTxid = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
const isPubkey = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);

const safeAdd = (a: number, b: number): number | null => {
  const sum = a + b;
  return Number.isSafeInteger(sum) ? sum : null;
};

const divideCeil = (dividend: bigint, divisor: bigint): bigint => (dividend + divisor - 1n) / divisor;
const ceilPercentRaise = (amount: bigint, basisPoints: number): bigint =>
  divideCeil(amount * BigInt(10_000 + basisPoints), 10_000n);

// ---- Q2: opening floor ----

export interface OpeningFloorNameFacts {
  /** Canonical name byte length, after WIRE §2 normalization/validation upstream. */
  readonly canonicalNameByteLength: number;
}

export interface OpeningFloorParams {
  /** One-byte-name opening floor. Lengths 2..4 halve this value. */
  readonly oneCharPriceSats: bigint;
  /** Flat long-name floor and the clamp for the short-name curve. */
  readonly longNameFloorSats: bigint;
}

export interface OpeningFloorVerdict {
  readonly computed: boolean;
  readonly floorSats: bigint | null;
  readonly reason: string;
}

const floorReject = (reason: string): OpeningFloorVerdict => ({ computed: false, floorSats: null, reason });

export function openingFloor(
  nameFacts: OpeningFloorNameFacts,
  floorParams: OpeningFloorParams
): OpeningFloorVerdict {
  const n = nameFacts as unknown;
  const p = floorParams as unknown;
  if (!isObject(n)) {
    return floorReject("q2-name-facts-malformed");
  }
  if (!isClosedShape(n, ["canonicalNameByteLength"])) {
    return floorReject("q2-name-facts-extra-field");
  }
  if (!isPositiveSafeInt(n.canonicalNameByteLength)) {
    return floorReject("q2-name-byte-length-malformed");
  }
  if (!isObject(p)) {
    return floorReject("q2-floor-params-malformed");
  }
  if (!isClosedShape(p, ["oneCharPriceSats", "longNameFloorSats"])) {
    return floorReject("q2-floor-params-extra-field");
  }
  if (!isNonNegBigInt(p.oneCharPriceSats) || !isNonNegBigInt(p.longNameFloorSats)) {
    return floorReject("q2-floor-param-malformed");
  }

  if (n.canonicalNameByteLength >= 5) {
    return { computed: true, floorSats: p.longNameFloorSats, reason: "q2-long-name-flat-floor" };
  }
  const divisor = 1n << BigInt(n.canonicalNameByteLength - 1);
  const curve = p.oneCharPriceSats / divisor;
  const floor = curve > p.longNameFloorSats ? curve : p.longNameFloorSats;
  return { computed: true, floorSats: floor, reason: "q2-short-name-curve-floor" };
}

// ---- Q1/Q3/Q4/Q7/Q10: bid acceptance ----

export type AuctionLotBinding = { readonly kind: "b3-verified-auction-lot-binding" };

export interface AuctionBidFacts {
  readonly bidAmountSats: bigint;
  readonly minedHeight: number;
  /** The same-transaction bond output index the bid references. */
  readonly bondVout: number;
  /** Opaque B3-verified fact that the bid is bound to the intended lot. */
  readonly lotBinding: AuctionLotBinding;
}

export type AuctionBondOutputKind =
  | "b3-verified-bidder-controlled-payment"
  | "op_return"
  | "provably-unspendable"
  | "unknown"
  | "missing";

export interface AuctionBondFacts {
  readonly kind: AuctionBondOutputKind;
  readonly valueSats: bigint | null;
}

export interface PriorAuctionState {
  /** The opening floor for this lot, computed by openingFloor / launch params. */
  readonly openingFloorSats: bigint;
  /** Null means no accepted bid yet. */
  readonly currentLeaderAmountSats: bigint | null;
  /** Null iff no accepted bid has opened the auction yet. */
  readonly currentCloseHeight: number | null;
}

export interface AuctionParams {
  readonly baseWindowBlocks: number;
  readonly softCloseWindowBlocks: number;
  readonly minRaiseSats: bigint;
  readonly minRaiseBasisPoints: number;
  readonly softCloseMinRaiseSats: bigint;
  readonly softCloseMinRaiseBasisPoints: number;
}

export type AuctionBidStateEffect = "none" | "opens-auction" | "updates-leading-bid";

export interface AuctionBidAcceptanceVerdict {
  readonly accepted: boolean;
  readonly reason: string;
  readonly stateEffect: AuctionBidStateEffect;
  readonly requiredMinimumBidSats: bigint | null;
  readonly nextLeaderAmountSats: bigint | null;
  readonly nextCloseHeight: number | null;
}

const bidReject = (
  reason: string,
  prior: PriorAuctionState | null = null,
  requiredMinimumBidSats: bigint | null = null
): AuctionBidAcceptanceVerdict => ({
  accepted: false,
  reason,
  stateEffect: "none",
  requiredMinimumBidSats,
  nextLeaderAmountSats: prior?.currentLeaderAmountSats ?? null,
  nextCloseHeight: prior?.currentCloseHeight ?? null,
});

const BID_KEYS = ["bidAmountSats", "minedHeight", "bondVout", "lotBinding"] as const;
const LOT_BINDING_KEYS = ["kind"] as const;
const BOND_KEYS = ["kind", "valueSats"] as const;
const PRIOR_KEYS = ["openingFloorSats", "currentLeaderAmountSats", "currentCloseHeight"] as const;
const PARAM_KEYS = [
  "baseWindowBlocks",
  "softCloseWindowBlocks",
  "minRaiseSats",
  "minRaiseBasisPoints",
  "softCloseMinRaiseSats",
  "softCloseMinRaiseBasisPoints",
] as const;

function validLotBinding(binding: unknown): boolean {
  return (
    isObject(binding) &&
    isClosedShape(binding, LOT_BINDING_KEYS) &&
    binding.kind === "b3-verified-auction-lot-binding"
  );
}

function validateBidInput(input: unknown): input is AuctionBidFacts {
  return (
    isObject(input) &&
    isClosedShape(input, BID_KEYS) &&
    isNonNegBigInt(input.bidAmountSats) &&
    isSafeNonNegInt(input.minedHeight) &&
    isSafeNonNegInt(input.bondVout) &&
    input.bondVout <= 255 &&
    validLotBinding(input.lotBinding)
  );
}

function validateBondInput(input: unknown): input is AuctionBondFacts {
  return (
    isObject(input) &&
    isClosedShape(input, BOND_KEYS) &&
    typeof input.kind === "string" &&
    ["b3-verified-bidder-controlled-payment", "op_return", "provably-unspendable", "unknown", "missing"].includes(
      input.kind
    ) &&
    (input.valueSats === null || isNonNegBigInt(input.valueSats))
  );
}

function validatePriorState(input: unknown): input is PriorAuctionState {
  if (!isObject(input) || !isClosedShape(input, PRIOR_KEYS) || !isNonNegBigInt(input.openingFloorSats)) {
    return false;
  }
  if (input.currentLeaderAmountSats !== null && !isNonNegBigInt(input.currentLeaderAmountSats)) {
    return false;
  }
  if (input.currentCloseHeight !== null && !isSafeNonNegInt(input.currentCloseHeight)) {
    return false;
  }
  return (input.currentLeaderAmountSats === null) === (input.currentCloseHeight === null);
}

function validateAuctionParams(input: unknown): input is AuctionParams {
  return (
    isObject(input) &&
    isClosedShape(input, PARAM_KEYS) &&
    isPositiveSafeInt(input.baseWindowBlocks) &&
    isSafeNonNegInt(input.softCloseWindowBlocks) &&
    isNonNegBigInt(input.minRaiseSats) &&
    isSafeNonNegInt(input.minRaiseBasisPoints) &&
    isNonNegBigInt(input.softCloseMinRaiseSats) &&
    isSafeNonNegInt(input.softCloseMinRaiseBasisPoints)
  );
}

function bondClauseVerdict(bid: AuctionBidFacts, bond: AuctionBondFacts): string | null {
  if (bond.kind === "missing" || bond.valueSats === null) {
    return "q3-bond-output-missing";
  }
  if (bond.kind !== "b3-verified-bidder-controlled-payment") {
    return "q4-non-returnable-bond-output-rejected";
  }
  // PR-21: the bond value must be at least the bid amount. Over-bonding is allowed.
  if (bond.valueSats < bid.bidAmountSats) {
    return "q3-underbonded-output-rejected";
  }
  return null;
}

function requiredMinimumBid(
  currentLeaderAmountSats: bigint,
  params: Pick<AuctionParams, "minRaiseSats" | "minRaiseBasisPoints">
): bigint {
  const absoluteMinimum = currentLeaderAmountSats + params.minRaiseSats;
  const percentageMinimum = ceilPercentRaise(currentLeaderAmountSats, params.minRaiseBasisPoints);
  return absoluteMinimum > percentageMinimum ? absoluteMinimum : percentageMinimum;
}

function isInSoftCloseWindow(bidHeight: number, currentCloseHeight: number, softCloseWindowBlocks: number): boolean {
  return (
    softCloseWindowBlocks > 0 &&
    bidHeight >= currentCloseHeight - softCloseWindowBlocks &&
    bidHeight <= currentCloseHeight
  );
}

export function acceptAuctionBid(
  bidFacts: AuctionBidFacts,
  bondFacts: AuctionBondFacts,
  priorAuctionState: PriorAuctionState,
  auctionParams: AuctionParams
): AuctionBidAcceptanceVerdict {
  const b = bidFacts as unknown;
  const bond = bondFacts as unknown;
  const priorUnknown = priorAuctionState as unknown;
  const paramsUnknown = auctionParams as unknown;
  if (!validateBidInput(b)) {
    return bidReject("q1-bid-facts-malformed");
  }
  if (!validateBondInput(bond)) {
    return bidReject("q3-bond-facts-malformed");
  }
  if (!validatePriorState(priorUnknown)) {
    return bidReject("q1-prior-auction-state-malformed");
  }
  const prior = priorUnknown;
  if (!validateAuctionParams(paramsUnknown)) {
    return bidReject("q1-auction-params-malformed", prior);
  }
  const params = paramsUnknown;

  const bondRejectReason = bondClauseVerdict(b, bond);
  if (bondRejectReason !== null) {
    return bidReject(bondRejectReason, prior);
  }

  if (prior.currentLeaderAmountSats === null) {
    const required = prior.openingFloorSats;
    if (b.bidAmountSats < required) {
      return bidReject("q10-non-qualifying-bid-null-effect", prior, required);
    }
    const closeHeight = safeAdd(b.minedHeight, params.baseWindowBlocks);
    if (closeHeight === null) {
      return bidReject("q1-auction-close-height-overflow", prior, required);
    }
    return {
      accepted: true,
      reason: "q1-opening-bid-accepted",
      stateEffect: "opens-auction",
      requiredMinimumBidSats: required,
      nextLeaderAmountSats: b.bidAmountSats,
      nextCloseHeight: closeHeight,
    };
  }

  const currentCloseHeight = prior.currentCloseHeight;
  if (currentCloseHeight === null) {
    return bidReject("q1-prior-auction-state-malformed", prior);
  }
  if (b.minedHeight > currentCloseHeight) {
    return bidReject("q1-auction-closed", prior);
  }

  const softClose = isInSoftCloseWindow(b.minedHeight, currentCloseHeight, params.softCloseWindowBlocks);
  const required = requiredMinimumBid(prior.currentLeaderAmountSats, {
    minRaiseSats: softClose ? params.softCloseMinRaiseSats : params.minRaiseSats,
    minRaiseBasisPoints: softClose ? params.softCloseMinRaiseBasisPoints : params.minRaiseBasisPoints,
  });
  if (b.bidAmountSats <= prior.currentLeaderAmountSats || b.bidAmountSats < required) {
    return bidReject("q10-non-qualifying-bid-null-effect", prior, required);
  }

  let nextCloseHeight = currentCloseHeight;
  if (softClose) {
    const extended = safeAdd(b.minedHeight, params.softCloseWindowBlocks);
    if (extended === null) {
      return bidReject("q7-soft-close-height-overflow", prior, required);
    }
    nextCloseHeight = Math.max(currentCloseHeight, extended);
  }
  return {
    accepted: true,
    reason: softClose ? "q7-accepted-bid-extends-soft-close" : "q1-higher-bid-accepted",
    stateEffect: "updates-leading-bid",
    requiredMinimumBidSats: required,
    nextLeaderAmountSats: b.bidAmountSats,
    nextCloseHeight,
  };
}

// ---- Q9/T7/T9/G1: winner selection ----

export interface AuctionTranscriptCompleteness {
  readonly complete: boolean;
  readonly reason: string;
}

export interface AuctionTranscriptBid {
  readonly txid: string;
  readonly bondVout: number;
  readonly bidderPubkey: string;
  readonly bidAmountSats: bigint;
  readonly accepted: boolean;
  readonly blockHeight: number;
  readonly txIndex: number;
}

export interface AuctionResolutionTranscript {
  readonly bids: readonly AuctionTranscriptBid[];
}

export interface DeclaredAuctionWinner {
  readonly txid: string;
  readonly bondVout: number;
}

export interface AcceptedAuctionWinner {
  readonly txid: string;
  readonly bondVout: number;
  readonly bidderPubkey: string;
  readonly bidAmountSats: bigint;
  readonly blockHeight: number;
  readonly txIndex: number;
}

export interface AuctionWinnerSelectionVerdict {
  readonly selected: boolean;
  readonly winner: AcceptedAuctionWinner | null;
  readonly reason: string;
}

const winnerReject = (reason: string): AuctionWinnerSelectionVerdict => ({ selected: false, winner: null, reason });
const COMPLETENESS_KEYS = ["complete", "reason"] as const;
const TRANSCRIPT_KEYS = ["bids"] as const;
const TRANSCRIPT_BID_KEYS = ["txid", "bondVout", "bidderPubkey", "bidAmountSats", "accepted", "blockHeight", "txIndex"] as const;
const DECLARED_WINNER_KEYS = ["txid", "bondVout"] as const;

function validateCompleteness(input: unknown): input is AuctionTranscriptCompleteness {
  return (
    isObject(input) &&
    isClosedShape(input, COMPLETENESS_KEYS) &&
    typeof input.complete === "boolean" &&
    typeof input.reason === "string"
  );
}

function validateTranscriptBid(input: unknown): input is AuctionTranscriptBid {
  return (
    isObject(input) &&
    isClosedShape(input, TRANSCRIPT_BID_KEYS) &&
    isTxid(input.txid) &&
    isSafeNonNegInt(input.bondVout) &&
    input.bondVout <= 255 &&
    isPubkey(input.bidderPubkey) &&
    isNonNegBigInt(input.bidAmountSats) &&
    typeof input.accepted === "boolean" &&
    isSafeNonNegInt(input.blockHeight) &&
    isSafeNonNegInt(input.txIndex)
  );
}

function validateDeclaredWinner(input: unknown): input is DeclaredAuctionWinner {
  return (
    isObject(input) &&
    isClosedShape(input, DECLARED_WINNER_KEYS) &&
    isTxid(input.txid) &&
    isSafeNonNegInt(input.bondVout) &&
    input.bondVout <= 255
  );
}

function winnerFromBid(bid: AuctionTranscriptBid): AcceptedAuctionWinner {
  return {
    txid: bid.txid,
    bondVout: bid.bondVout,
    bidderPubkey: bid.bidderPubkey,
    bidAmountSats: bid.bidAmountSats,
    blockHeight: bid.blockHeight,
    txIndex: bid.txIndex,
  };
}

function compareWinnerCandidate(a: AuctionTranscriptBid, b: AuctionTranscriptBid): number {
  if (a.bidAmountSats !== b.bidAmountSats) {
    return a.bidAmountSats > b.bidAmountSats ? -1 : 1;
  }
  if (a.blockHeight !== b.blockHeight) {
    return a.blockHeight < b.blockHeight ? -1 : 1;
  }
  if (a.txIndex !== b.txIndex) {
    return a.txIndex < b.txIndex ? -1 : 1;
  }
  if (a.txid !== b.txid) {
    return a.txid < b.txid ? -1 : 1;
  }
  return a.bondVout - b.bondVout;
}

export function selectAuctionWinner(
  transcript: AuctionResolutionTranscript,
  completenessVerdict: AuctionTranscriptCompleteness,
  declaredWinner: DeclaredAuctionWinner | null = null
): AuctionWinnerSelectionVerdict {
  const t = transcript as unknown;
  const c = completenessVerdict as unknown;
  const d = declaredWinner as unknown;
  if (!validateCompleteness(c) || c.complete !== true) {
    return winnerReject("q9-incomplete-transcript-no-selection");
  }
  if (!isObject(t) || !isClosedShape(t, TRANSCRIPT_KEYS) || !Array.isArray(t.bids)) {
    return winnerReject("q9-transcript-malformed");
  }
  if (d !== null && !validateDeclaredWinner(d)) {
    return winnerReject("t9-declared-winner-malformed");
  }

  const accepted: AuctionTranscriptBid[] = [];
  for (const bid of t.bids) {
    if (!validateTranscriptBid(bid)) {
      return winnerReject("q9-transcript-bid-malformed");
    }
    if (bid.accepted) {
      accepted.push(bid);
    }
  }
  if (accepted.length === 0) {
    return winnerReject(d === null ? "t7-zero-accepted-bids-no-owner" : "t9-phantom-winner-rejected");
  }

  accepted.sort(compareWinnerCandidate);
  const selected = accepted[0] as AuctionTranscriptBid;
  if (d !== null && (selected.txid !== d.txid || selected.bondVout !== d.bondVout)) {
    const declaredAccepted = accepted.some((bid) => bid.txid === d.txid && bid.bondVout === d.bondVout);
    return winnerReject(declaredAccepted ? "t9-lower-declared-winner-rejected" : "t9-phantom-winner-rejected");
  }
  return { selected: true, winner: winnerFromBid(selected), reason: "q9-largest-accepted-bid-wins" };
}
