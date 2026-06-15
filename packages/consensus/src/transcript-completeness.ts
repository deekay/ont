// Transcript completeness (T1 / T2 / T21 — canon Item 4 + the SOFTWARE_CANON L2 boundary
// rule). The kernel's transcript-completeness verdict is a PURE deterministic predicate
// over witnessed inputs only — the counted bid transcript and a B3-verified completeness
// witness — with NO actor, source, endpoint, or producer parameter (T1): no out-of-kernel
// layer can override it. It fails closed when completeness is not witnessed by a
// verifier-checkable B3 witness — absent, producer-asserted, or otherwise not
// verifier-checkable ⇒ incomplete, never certified (T2 / canon Item 4) — and rejects a
// transcript whose counted bid set is not distinct and well-formed (T21).
//
// SCOPE (B2 slice T1/T2/T21): pins purity + the fail-closed completeness posture + txid
// integrity. It DELIBERATELY DOES NOT decide:
//   - the auction winner / amount / bidder identity / bid qualification (auction
//     RESOLUTION — T7/T9, downstream with the winner-selection / settlement predicates);
//   - the concrete completeness-witness format, OR the lot's block range / soft-close
//     range semantics (B3 deliverable; the range issue is T2-neg-02, candidate-tier). The
//     witness is consumed OPAQUELY: a B3-verified witness is verifier-checkable as supplied
//     by the future B3/range witness; B2 never computes the range or the soft-close window;
//   - claim-counting / notice-deadline (T17), transcript-entry vs holdsPriority (T18),
//     reopen / bond-continuity (T22), or recovery invoke admission (T19, #50-b1).

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

/**
 * A completeness witness, consumed OPAQUELY by the kernel. It is an input data object —
 * never a callback, endpoint, actor handle, producer flag, or bare boolean. Only a
 * B3-verified, verifier-checkable witness satisfies the completeness posture; a
 * producer-asserted (self-asserted) witness is never trusted (T2). The concrete
 * verifier-checkable format and the lot's block range are a B3 deliverable; this kind
 * discriminant is a labelled placeholder for that future witness, not its format.
 */
export type CompletenessWitness =
  | { readonly kind: "b3-verified-completeness-witness" } // placeholder: a verifier-checkable B3 witness
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
// boundary; an object carrying an extra field is rejected, never silently ignored. (B3 may
// extend the witness shape deliberately when it defines the real verifier-checkable witness;
// this closes only the current B2 placeholder shapes.)
const TRANSCRIPT_KEYS = ["bids"] as const;
const COUNTED_BID_KEYS = ["txid"] as const;
const WITNESS_KEYS = ["kind"] as const;
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));

/**
 * Decide whether `transcript` is a complete, well-formed counted bid set, given a
 * `completenessWitness` (null = absent).
 *
 * Pure and deterministic (T1): the verdict is a function of (transcript, witness) only;
 * the signature carries no actor / source / endpoint / producer / evidence-layer
 * parameter, so no out-of-kernel layer can override it. Fail-closed (T2): an absent,
 * producer-asserted, or non-verifier-checkable witness yields `incomplete` — completeness
 * is never inferred from a producer's own assertion. Integrity (T21): every counted bid
 * is a distinct, well-formed L1 txid; duplicate or malformed txids are rejected, never
 * silently deduplicated.
 */
export function transcriptCompleteness(
  transcript: AuctionTranscript,
  completenessWitness: CompletenessWitness | null
): TranscriptCompletenessVerdict {
  // Fail-closed shape guards — an exported B2 verdict is TOTAL: a malformed input (non-object,
  // wrong-typed field, non-array bids) yields a rejecting verdict, never an exception. The typed
  // params document the intended shape; these guards enforce it at the runtime boundary, where a
  // caller can violate the types.
  const t = transcript as unknown;
  const w = completenessWitness as unknown;

  // T1 (field-level + shape) — the transcript must be a non-null object admitting ONLY `bids`,
  // and `bids` must be an array. A producer / source / endpoint / actor (or any other) field is
  // rejected at the boundary, closing the no-source-identity channel at runtime, not only in the type.
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

  // T2 — completeness must be witnessed by a verifier-checkable B3 witness. An absent (null or
  // undefined) or producer-asserted (self-asserted) witness fails closed; completeness is never
  // trusted from the producer. (B2 consumes the witness opaquely — it does not decide the witness
  // format or the lot's block range / soft-close window; those are B3.)
  if (w == null) {
    return reject("t2-absent-completeness-witness");
  }
  // T1 (field-level + shape) — the witness must be a non-null object admitting ONLY `kind` for the
  // current B2 placeholder variants, with a string `kind`: no producer / source / actor field rides
  // it. (B3 may extend this shape when it defines the real verifier-checkable witness.)
  if (!isObject(w)) {
    return reject("t1-witness-malformed");
  }
  if (!isClosedShape(w, WITNESS_KEYS)) {
    return reject("t1-witness-extra-field-rejected");
  }
  if (typeof w.kind !== "string") {
    return reject("t1-witness-malformed");
  }
  if (w.kind !== "b3-verified-completeness-witness") {
    return reject("t2-completeness-not-verifier-checkable");
  }

  // T21 — the counted bid set must be distinct and well-formed: each bid is a non-null object
  // admitting ONLY `txid`, whose `txid` is 32-byte lowercase hex, with no duplicate. A repeated or
  // malformed txid is a forged summary and is rejected, never silently deduplicated. (No bidder
  // identity / amount / qualification is examined — auction resolution is out of this slice.)
  const seen = new Set<string>();
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
    if (seen.has(bid.txid)) {
      return reject("t21-duplicate-bid-txid");
    }
    seen.add(bid.txid);
  }
  return accept();
}
