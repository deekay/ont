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
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";

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

/** Inclusive satoshi upper bound (a value field is `[1, U64_MAX]`); mirrors the wire codec bound. */
const U64_MAX = 0xffff_ffff_ffff_ffffn;
const HEX_64 = /^[0-9a-f]{64}$/;

const reject = (reason: string): GateFeeVerdict => ({ accepted: false, reason });
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * A committed leaf is well-formed iff the witness can derive its commitment key + length: `leafKeyHex`
 * is a 32-byte (`H(name)`) display-hex string and `canonicalNameByteLength` is a positive integer. A
 * leaf so malformed those cannot be read is a malformed committed-set witness, NOT a Σ g discount.
 */
function isWellFormedLeaf(leaf: CommittedLeaf): boolean {
  if (!isObject(leaf)) return false;
  if (typeof leaf.leafKeyHex !== "string" || !HEX_64.test(leaf.leafKeyHex)) return false;
  const len = leaf.canonicalNameByteLength;
  return typeof len === "number" && Number.isInteger(len) && len >= 1;
}

/**
 * The schedule is a CLOSED shape: exactly `{ gateOneByteSats, gateLongNameFloorSats }`, each a positive
 * bigint in the satoshi bound `[1, U64_MAX]`. No market / source / publisher channel may enter (an
 * extra field, a wrong type, a non-positive or overflowing value all fail closed).
 */
function isWellFormedSchedule(s: GateFeeSchedule): boolean {
  if (!isObject(s)) return false;
  const keys = Object.keys(s);
  if (keys.length !== 2 || !("gateOneByteSats" in s) || !("gateLongNameFloorSats" in s)) return false;
  for (const v of [s.gateOneByteSats, s.gateLongNameFloorSats] as unknown[]) {
    if (typeof v !== "bigint" || v < 1n || v > U64_MAX) return false;
  }
  return true;
}

/**
 * `g(name)` — the gate-fee length curve over the closed `GateFeeSchedule` (reuse of the `openingFloor`
 * MATH, not the auction type): a 1-byte name pays the full one-byte price; lengths 2..4 halve it,
 * clamped at the long-name floor; lengths ≥5 pay the flat floor. Resident integer (bigint) division.
 */
function gateFeeForLength(len: number, schedule: GateFeeSchedule): bigint {
  if (len === 1) return schedule.gateOneByteSats;
  if (len <= 4) {
    const halved = schedule.gateOneByteSats / (1n << BigInt(len - 1));
    return halved > schedule.gateLongNameFloorSats ? halved : schedule.gateLongNameFloorSats;
  }
  return schedule.gateLongNameFloorSats;
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
  // The fail-closed check ORDER is the green contract (B3 §14 update 3, CL ruling): the witness must
  // first prove what fee was actually PAID (fee-fact binding) before the batch + schedule decide
  // whether it is adequate (adequacy context). Each stage fails closed with its own stable reason.

  // ---- Stage 2: fee-fact binding (recompute every value from a txid-bound tx; trust nothing) ----
  const anchorTxid = legacyTxidOf(fee.anchorTx);
  if (anchorTxid === null) return reject("gf-tx-malformed");
  if (anchorTxid !== anchor.anchorTxid) return reject("gf-anchor-txid-mismatch");

  const inputs = fee.anchorTx.inputs;
  if (!Array.isArray(fee.prevoutTxs) || fee.prevoutTxs.length !== inputs.length) {
    return reject("gf-prevout-count-mismatch");
  }

  // No two anchor inputs may spend the IDENTICAL outpoint (txid, vout) — that would let one spent
  // output be double-counted. Same txid with a DIFFERENT vout is legitimate and is not banned.
  const spentOutpoints = new Set<string>();
  for (const input of inputs) {
    const outpoint = `${input.prevoutTxid}:${input.prevoutVout}`;
    if (spentOutpoints.has(outpoint)) return reject("gf-duplicate-prevout-spend");
    spentOutpoints.add(outpoint);
  }

  // Each supplied prevout tx must hash to the txid the anchor commits for that input; the spent value
  // is then read from the bound tx's referenced output. A matched txid pins inputs AND outputs, so
  // neither an over-stated prevout nor an out-of-range vout can inflate the recomputed fee.
  let spentSats = 0n;
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    const prevoutTx = fee.prevoutTxs[i]!;
    if (legacyTxidOf(prevoutTx) !== input.prevoutTxid) return reject("gf-prevout-txid-mismatch");
    if (input.prevoutVout < 0 || input.prevoutVout >= prevoutTx.outputs.length) {
      return reject("gf-prevout-vout-out-of-range");
    }
    spentSats += prevoutTx.outputs[input.prevoutVout]!.valueSats;
  }

  let outputSats = 0n;
  for (const output of fee.anchorTx.outputs) outputSats += output.valueSats;
  const paidFee = spentSats - outputSats;
  if (paidFee < 0n) return reject("gf-paid-fee-negative");

  // ---- Stage 3: adequacy context (the committed batch + schedule decide requiredFee) ----
  if (
    batch.anchoredRoot !== anchor.anchoredRoot ||
    batch.batchSize !== anchor.batchSize ||
    !Array.isArray(batch.leaves) ||
    batch.leaves.length !== anchor.batchSize
  ) {
    return reject("gf-batch-not-bound-to-anchor");
  }

  for (const leaf of batch.leaves) {
    if (!isWellFormedLeaf(leaf)) return reject("gf-committed-leaf-malformed");
  }
  const committedKeys = new Set<string>();
  for (const leaf of batch.leaves) {
    if (committedKeys.has(leaf.leafKeyHex)) return reject("gf-duplicate-committed-leaf-key");
    committedKeys.add(leaf.leafKeyHex);
  }

  if (!isWellFormedSchedule(fee.schedule)) return reject("gf-schedule-malformed");

  // requiredFee = Σ over the FULL committed leaf set of g(byteLength) (#52: a later-dropped or
  // DA-excluded valid leaf STILL counts — the Σ is regardless of drops). Accept iff paidFee covers it.
  let requiredFee = 0n;
  for (const leaf of batch.leaves) requiredFee += gateFeeForLength(leaf.canonicalNameByteLength, fee.schedule);
  if (paidFee < requiredFee) return reject("gf-underpaid");
  return { accepted: true, reason: "gate-fee-adequate" };
}
