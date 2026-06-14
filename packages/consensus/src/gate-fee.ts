// Gate-fee validation (F8 / ONT_ISSUANCE_FEE_MECHANICS §5). The kernel's gate-fee
// verdict is a PURE deterministic predicate over witnessed inputs only — the anchor
// facts, the committed batch contents, and the fee — with NO publisher-identity,
// endpoint, or source parameter in its signature. Because there is no source-identity
// channel, an N=1 self-posted anchor and a publisher-batched anchor validate by the
// identical rule: the I5 censorship-resistance floor (fee mechanics §5; SOFTWARE_CANON
// L2 boundary rule — "pure predicate over witnessed inputs; No DB, no network, no
// clock, no UI; no adapter/source judgment may enter").
//
// SCOPE (B2 structural slice, F8-pos-01): this pins the boundary SHAPE and the
// structurally-derivable fail-closed checks. It DELIBERATELY EXCLUDES the g(name) fee
// schedule, the fee-amount economics (fee >= Σ g), and batchSize-vs-leaf-count
// reconciliation — those are B3 (the schedule is filled at the production layer; the
// predicate signature is stable now). A fee that is structurally well-formed and bound
// to the anchor's commitment passes this B2 gate; amount adequacy against g(name) is a
// later B3 conjunct that enters this same signature without a source-identity channel.

/** The witnessed facts of the anchor whose batch the fee gates (F8 input 1). */
export interface GateFeeAnchorFacts {
  /** `h` — the anchor's mined block height (witnessed from Bitcoin). */
  readonly minedHeight: number;
  /** The root the anchor commits to. */
  readonly anchoredRoot: string;
  /** The leaf count the root commits to. */
  readonly batchSize: number;
}

/** The committed batch contents the fee gates (F8 input 2). */
export interface CommittedBatchContents {
  /** The root the committed batch verifies against — must equal the anchor's. */
  readonly anchoredRoot: string;
  /** The leaf count the committed batch verifies against — must equal the anchor's. */
  readonly batchSize: number;
}

/** The fee paid for the batch (F8 input 3); the §5 sink is miners, witnessed from Bitcoin. */
export interface GateFee {
  /** The fee in satoshis. */
  readonly amountSats: bigint;
}

export interface GateFeeVerdict {
  readonly accepted: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const reject = (reason: string): GateFeeVerdict => ({ accepted: false, reason });
const accept = (): GateFeeVerdict => ({ accepted: true, reason: "gate-fee-structurally-valid" });

/**
 * Decide whether `fee` is a structurally valid gate fee for `anchor`'s `batch`.
 *
 * Pure and deterministic: the verdict is a function of (anchor facts, committed batch
 * contents, fee) ONLY. The signature carries no publisher identity, endpoint, or source
 * parameter, so the verdict cannot vary with who posted the anchor — an N=1 self-posted
 * anchor and a publisher-batched anchor validate by the identical rule (I5). The g(name)
 * fee schedule and amount economics are out of scope here (B3); see the module header.
 */
export function gateFeeValidation(
  anchor: GateFeeAnchorFacts,
  batch: CommittedBatchContents,
  fee: GateFee
): GateFeeVerdict {
  // Fail-closed structural well-formedness (no economics): the fee is a non-negative
  // amount of satoshis. A negative amount is rejected, never normalized.
  if (fee.amountSats < 0n) {
    return reject("f8-malformed-fee-amount");
  }
  // The committed batch must bind to the anchor's commitment (root + batchSize): a batch
  // that does not verify against the anchor's (anchoredRoot, batchSize) is not this
  // anchor's committed batch. Structural (witnessed-fact consistency), not economic.
  if (batch.anchoredRoot !== anchor.anchoredRoot || batch.batchSize !== anchor.batchSize) {
    return reject("f8-batch-not-bound-to-anchor");
  }
  // The amount-adequacy conjunct (fee >= Σ g(name), the g(name) schedule) is B3; this B2
  // gate accepts a structurally valid, anchor-bound fee. No source-identity channel exists.
  return accept();
}
