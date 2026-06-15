// Settlement consequences (S5 / S15). Two narrow, pure predicates — deliberately NOT one
// combined "settlement verdict", so neither implies maturity-height computation nor full
// settlement materialization.
//
// SCOPE (B2 slice S5/S15). These pin two cited rules and nothing more:
//   - S5 (#12 + WIRE §4.3): a winning bid's settlementLockBlocks commitment must equal the
//     protocol maturity parameter; the per-bid field is a validated commitment, never a
//     bidder-chosen maturity override.
//   - S15 (#37): ownership materializes ONLY from an actual accepted winning bid; zero bids /
//     a settled phase with no valid accepted winner yields no owner.
// They DELIBERATELY EXCLUDE: auction RESOLUTION / winner selection (→ Q, candidate — the
// accepted winner is an INPUT here, never computed); the full NameRecord construction
// (ownerPubkey, bond outpoint, amount, maturity height — S15 is the materialize-or-not GATE,
// not the record's contents); maturityHeight computation / the maturity anchor (S3); the
// settlement-bond-continuity rule (#56, engine-side); and recovery (#50). maturityBlocks is a
// launch-freeze PARAMETER supplied to S5; B2 does not fix its value.
//
// Total / fail-closed + closed-shape (the #63/#64 discipline): malformed inputs (non-object,
// extra fields, non-integer/negative values) yield a rejecting verdict, never an exception, and
// no source/catalog/phase field on an input object is silently admitted as authority.

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isNonNegInteger = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

// ---- S5: settlement lock commitment matches the protocol maturity parameter ----

/** The winning bid's lock commitment — its closed S5 field set is exactly `settlementLockBlocks`. */
export interface SettlementLockCommitment {
  /** The per-bid `settlementLockBlocks` (WIRE §4.3, u32) — a commitment, validated against the param. */
  readonly settlementLockBlocks: number;
}

export interface SettlementLockVerdict {
  readonly matches: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const lockReject = (reason: string): SettlementLockVerdict => ({ matches: false, reason });

/**
 * S5: decide whether `lockCommitment.settlementLockBlocks` equals the protocol `maturityBlocks`
 * (#12 + WIRE §4.3). It validates ONLY this equality — it does not compute a maturity height,
 * choose the maturity anchor, validate the winning bid, or settle a record. `maturityBlocks` is a
 * launch-freeze parameter. Pure and total: a malformed commitment / non-integer / negative value
 * does not match and never throws; an extra field on the commitment is rejected (closed shape).
 */
export function settlementLockMatchesMaturity(
  lockCommitment: SettlementLockCommitment,
  maturityBlocks: number
): SettlementLockVerdict {
  const commitment = lockCommitment as unknown;
  if (!isObject(commitment)) {
    return lockReject("s5-malformed-lock-commitment");
  }
  if (!isClosedShape(commitment, ["settlementLockBlocks"])) {
    return lockReject("s5-lock-commitment-extra-field");
  }
  if (!isNonNegInteger(commitment.settlementLockBlocks)) {
    return lockReject("s5-malformed-settlement-lock-blocks");
  }
  if (!isNonNegInteger(maturityBlocks)) {
    return lockReject("s5-malformed-maturity-blocks");
  }
  // The commitment must equal the protocol parameter — a shortened (or any differing) maturity
  // override does not settle.
  if (commitment.settlementLockBlocks !== maturityBlocks) {
    return lockReject("s5-settlement-lock-blocks-mismatch");
  }
  return { matches: true, reason: "settlement-lock-matches-maturity" };
}

// ---- S15: ownership materializes only from an actual accepted winning bid ----

/**
 * An accepted winning bid, consumed OPAQUELY as the input from winner selection (Q). Its closed S15
 * shape is exactly `kind`: a labelled placeholder for the winner Q supplies — B2 does not resolve
 * which bid wins, and no catalog / phase / source field is admitted as settlement authority.
 */
export type AcceptedWinningBid = { readonly kind: "accepted-winning-bid" };

export interface SettlementMaterializationVerdict {
  readonly materializes: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const matReject = (reason: string): SettlementMaterializationVerdict => ({ materializes: false, reason });

/**
 * S15: the materialization GATE — ownership materializes only from an actual accepted winning bid
 * (#37). `null` (no winner / zero bids / a settled phase with no accepted winner) yields no owner.
 * The accepted winner is an INPUT from winner selection (Q); B2 does not resolve it. This is the
 * materialize-or-not gate only — it does NOT construct the NameRecord. Pure and total: a malformed
 * or extra-field accepted-winner object does not materialize and never throws (so a catalog / phase
 * / source field can never silently become settlement authority).
 */
export function settlementMaterializes(
  acceptedWinningBid: AcceptedWinningBid | null
): SettlementMaterializationVerdict {
  const winner = acceptedWinningBid as unknown;
  if (winner == null) {
    return matReject("s15-no-accepted-winning-bid");
  }
  if (!isObject(winner)) {
    return matReject("s15-malformed-accepted-winning-bid");
  }
  if (!isClosedShape(winner, ["kind"])) {
    return matReject("s15-accepted-winning-bid-extra-field");
  }
  if (winner.kind !== "accepted-winning-bid") {
    return matReject("s15-not-a-valid-accepted-winning-bid");
  }
  return { materializes: true, reason: "settlement-materializes-from-accepted-winning-bid" };
}
