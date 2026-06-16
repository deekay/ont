// Gate-fee validation (F8 / ONT_ISSUANCE_FEE_MECHANICS §5; D-GF, B3 §14). The kernel's
// gate-fee verdict is a PURE deterministic predicate over witnessed inputs only — the anchor
// facts, the committed batch contents (the full leaf set), and the fee witness — with NO
// publisher-identity, endpoint, or source parameter in its signature. Because there is no
// source-identity channel, an N=1 self-posted anchor and a publisher-batched anchor validate by
// the identical rule: the I5 censorship-resistance floor (fee mechanics §5; SOFTWARE_CANON L2
// boundary rule — "pure predicate over witnessed inputs; No DB, no network, no clock, no UI; no
// adapter/source judgment may enter").
//
// RECOMPUTE, DON'T TRUST (D-GF, B3 §14 update 2). Nothing self-declared is trusted:
//   - `paidFee` is NOT a witness field; it is recomputed as Σ(spent prevout values) − Σ(anchor
//     outputs). A bare `paidFee` (or a bare `prevoutValueSats`) is forgeable, so neither exists.
//   - The fee witness carries the COMPLETE anchor tx + the complete prevout tx of every anchor
//     input. The kernel recomputes `legacyTxidOf(anchorTx) === anchor.anchorTxid` (binds the anchor
//     tx to the confirmed-chain fact) and `legacyTxidOf(prevoutTxs[i]) === anchorTx.inputs[i]
//     .prevoutTxid` (binds each spent output). A matched txid pins inputs AND outputs exactly, so
//     neither an omitted output nor a fake input can inflate the recomputed fee.
//   - `requiredFee = Σ over the FULL committed leaf set of g(canonicalNameByteLength)` (#52: a
//     later-dropped or DA-excluded valid leaf STILL counts; the Σ is regardless of drops). The
//     `g(name)` schedule is the closed `GateFeeSchedule` launch-freeze param (§5.1), curve-shaped.
// Accept iff `paidFee >= requiredFee`. Fail closed on every malformed / unbound / underpaid case.
import type { LegacyTransaction } from "@ont/bitcoin";

/** The witnessed facts of the anchor whose batch the fee gates (F8 input 1). */
export interface GateFeeAnchorFacts {
  /** `h` — the anchor's mined block height (witnessed from Bitcoin). */
  readonly minedHeight: number;
  /** The root the anchor commits to. */
  readonly anchoredRoot: string;
  /** The leaf count the root commits to. */
  readonly batchSize: number;
  /** The anchor transaction's own txid (display hex) — the fee tx IS the anchor tx (Q3 bind). */
  readonly anchorTxid: string;
}

/** One committed leaf the fee gates: its commitment key + the canonical byte length g() reads. */
export interface CommittedLeaf {
  /** `H(name)` commitment key (validated upstream); a duplicate committed name = duplicate key. */
  readonly leafKeyHex: string;
  /** Canonical name byte length (WIRE §2), the sole input to g(name). */
  readonly canonicalNameByteLength: number;
}

/** The committed batch contents the fee gates (F8 input 2): the FULL committed leaf set (Σ g basis). */
export interface CommittedBatchContents {
  /** The root the committed batch verifies against — must equal the anchor's. */
  readonly anchoredRoot: string;
  /** The leaf count the committed batch verifies against — must equal the anchor's. */
  readonly batchSize: number;
  /** The full committed leaf set; `leaves.length === batchSize`. Σ g is over ALL of these (#52). */
  readonly leaves: readonly CommittedLeaf[];
}

/**
 * The closed gate-fee schedule (launch-freeze §5.1). Gate-specific names, positive bigint values,
 * closed shape — no market / source / publisher channel. Curve-shaped like the auction opening floor
 * (reuse of the MATH, not the auction type): 1-byte = full price; lengths 2..4 halve; ≥5 = flat floor.
 */
export interface GateFeeSchedule {
  /** One-byte-name gate price. Lengths 2..4 halve this value, clamped at the long-name floor. */
  readonly gateOneByteSats: bigint;
  /** Flat long-name (≥5) gate floor and the clamp for the short-name curve. */
  readonly gateLongNameFloorSats: bigint;
}

/**
 * The verified fee witness (F8 input 3; D-GF, §14 update 2). Carries the COMPLETE anchor tx and the
 * complete prevout tx of every anchor input (in input order) so the kernel can recompute every txid
 * and every spent value. No bare `paidFee` / `prevoutValueSats` — both are forgeable, so absent.
 */
export interface GateFeeWitness {
  /** The complete anchor tx; `legacyTxidOf(anchorTx)` must equal `anchor.anchorTxid`. */
  readonly anchorTx: LegacyTransaction;
  /** The complete prevout tx of each anchor input, in input order; one per `anchorTx.inputs`. */
  readonly prevoutTxs: readonly LegacyTransaction[];
  /** The closed gate-fee schedule. */
  readonly schedule: GateFeeSchedule;
}

export interface GateFeeVerdict {
  readonly accepted: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

/**
 * Decide whether `fee` is an adequate, anchor-bound gate fee for `anchor`'s committed `batch`.
 *
 * Pure and deterministic: the verdict is a function of (anchor facts, committed batch contents, fee
 * witness) ONLY. The signature carries no publisher identity, endpoint, or source parameter, so the
 * verdict cannot vary with who posted the anchor — an N=1 self-posted anchor and a publisher-batched
 * anchor validate by the identical rule (I5). Recompute-don't-trust: the paid fee is derived from
 * txid-bound transactions and the required fee from the full committed leaf set; nothing self-declared
 * is trusted. Fail closed on every malformed / unbound / underpaid case.
 */
export function gateFeeValidation(
  anchor: GateFeeAnchorFacts,
  batch: CommittedBatchContents,
  fee: GateFeeWitness
): GateFeeVerdict {
  // RED PHASE (D-GF green pending CL red-battery review): the txid-recompute binding + the
  // Σ g(name) adequacy conjunct are not yet implemented. The stub rejects with a sentinel so the
  // gf.* battery (and the migrated F8-pos-01 accept) is red until the green implementation lands.
  void anchor;
  void batch;
  void fee;
  return { accepted: false, reason: "gf-pending-green-impl" };
}
