// D-BC — bond-continuity / release-fact witness (B3, FREE; conforms to ratified #56 / #70 / #79).
// A two-stage builder of the kernel's `BondContinuityWitness` (the input `resolveReopen` consumes):
//
//   Stage 1 (evidence): verify a confirmed bond-outpoint SPEND fact — recompute-don't-trust. A
//     spend fact says: this presented tx is D-BI-confirmed at height `H`, its txid binds by
//     `legacyTxidOf(spendTx) === inclusion.txid`, and one of its inputs spends the name's current
//     bond outpoint (`NameRecord.currentBondTxid/currentBondVout`). It mints a verified SPEND fact —
//     NOT yet a release break. A fabricated release fact with no on-chain spend is rejected here,
//     before the kernel ever sees it.
//   Stage 2 (bridge / #79): apply the ratified `bondContinuityBreak` predicate (S6) using the
//     engine/B3-resolved facts `preMaturity` + `sameTxValidSuccessorBond` (the spend itself proves
//     `currentBondOutpointSpent`). ONLY `preMaturity && spent && !sameTxValidSuccessorBond` reduces a
//     verified spend into a kernel-facing `BondBreakFact { releaseHeight: H }` in `breaks`.
//   Stage 3 (kernel, NOT here): `resolveReopen` keeps the latest-release-height derivation, the
//     re-auction generation, and the same-height tiebreak (it fails closed, picking neither, via
//     `reopen-same-height-break-tiebreak-unspecified`). D-BC surfaces tied breaks; it never picks.
//
// Scope (the narrowed seam, mirrors D-RC): D-BC witnesses Bitcoin facts; the kernel decides. D-BC
// does NOT decide pre-maturity, valid-successor-bond, release, latest-release-height, re-auction, or
// the tiebreak. `sameTxValidSuccessorBond` is a #79 input; if a later slice computes it structurally
// that is the BRIDGE's computation of a #79 input, never D-BC evidence authority. Pure + total: every
// malformed input fails closed with a stable reason and never throws; no source/timestamp/adapter
// channel is admitted (closed shape).
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import {
  bondContinuityBreak,
  type BondBreakFact,
  type BondContinuityWitness,
} from "@ont/consensus";

/** The name's current bond outpoint (`NameRecord.currentBondTxid` / `currentBondVout`). */
export interface BondOutpoint {
  readonly txid: string;
  readonly vout: number;
}

/**
 * A D-BI-confirmed inclusion fact for the spending tx: its txid is confirmed mined at `height`.
 * Consumed as already-verified (the Merkle/PoW inclusion is D-BI's / the kernel against-Bitcoin
 * verifier's job), exactly as D-SB-avail consumes the confirmed anchor mined height.
 */
export interface ConfirmedSpendInclusion {
  readonly txid: string;
  readonly height: number;
}

/** Stage-1 input: one presented bond-outpoint spend to verify (evidence only, no release decision). */
export interface BondSpendObservation {
  readonly bondOutpoint: BondOutpoint;
  readonly spendTx: LegacyTransaction;
  readonly inclusion: ConfirmedSpendInclusion;
}

/** Stage-1 output: a verified confirmed bond-outpoint spend (a release break ONLY after the #79 bridge). */
export interface VerifiedBondSpendFact {
  /** The confirmed mined height of the spend (`= inclusion.height`). */
  readonly releaseHeight: number;
}

/** Full-builder input: a spend observation plus the #79 facts the bridge reduces it with. */
export interface BondSpendClassification {
  readonly observation: BondSpendObservation;
  /** #79 input (engine/B3-resolved): the spend was observed before the name's maturity height. */
  readonly preMaturity: boolean;
  /** #79 input (engine/B3-resolved): a valid successor bond was created in the SAME spending tx. */
  readonly sameTxValidSuccessorBond: boolean;
}

export interface BuildBondContinuityWitnessInput {
  /** Whether the witnessed spend/release history is COMPLETE (T22-02). Engine/B3-resolved; D-BC does not decide it. */
  readonly witnessComplete: boolean;
  readonly spends: readonly BondSpendClassification[];
}

export type BondSpendFactResult =
  | { readonly ok: true; readonly spendFact: VerifiedBondSpendFact }
  | { readonly ok: false; readonly reason: string };

export type BondContinuityWitnessResult =
  | { readonly ok: true; readonly witness: BondContinuityWitness }
  | { readonly ok: false; readonly reason: string };

const HEX_64 = /^[0-9a-f]{64}$/;
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isU32 = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffff_ffff;
const isPositiveSafeInt = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 1;

const spendFail = (reason: string): BondSpendFactResult => ({ ok: false, reason });
const buildFail = (reason: string): BondContinuityWitnessResult => ({ ok: false, reason });

/**
 * Stage 1 — verify a single confirmed bond-outpoint spend fact (evidence; no release decision).
 *
 * GREEN CONTRACT (fail-closed order; total, never throws):
 *   1. closed-shape totality: `obs` / `bondOutpoint` / `inclusion` are objects with exactly their
 *      keys; `bondOutpoint.txid` + `inclusion.txid` are 32-byte hex; `bondOutpoint.vout` is u32;
 *      `inclusion.height` is a positive safe int ⇒ else `bc-observation-malformed`.
 *   2. `legacyTxidOf(spendTx)` is non-null ⇒ else `bc-spend-tx-malformed`.
 *   3. it equals `inclusion.txid` (the presented tx IS the confirmed one) ⇒ else `bc-spend-txid-mismatch`.
 *   4. some `spendTx.inputs[i]` has `prevoutTxid === bondOutpoint.txid && prevoutVout === bondOutpoint.vout`
 *      ⇒ else `bc-outpoint-not-spent`.
 *   mint { releaseHeight: inclusion.height }.
 */
export function verifyBondSpendFact(obs: BondSpendObservation): BondSpendFactResult {
  // RED PHASE (D-BC green pending CL red-battery review): the txid-bind + outpoint-spend recompute
  // is not yet implemented. The stub rejects with a sentinel so the bc.* battery is red until green.
  void obs;
  void HEX_64;
  void isObject;
  void isClosedShape;
  void isU32;
  void isPositiveSafeInt;
  void legacyTxidOf;
  return spendFail("bc-pending-green-impl");
}

/**
 * The two-stage builder — verify each spend (stage 1) then reduce via the ratified #79 predicate
 * (stage 2) into the kernel's `BondContinuityWitness`. A malformed/fabricated spend fails the whole
 * build closed (the kernel never sees a partial witness). Only `preMaturity && !sameTxValidSuccessorBond`
 * spends become `breaks` (the bond was spent ⇒ `currentBondOutpointSpent` is true by construction).
 * `witnessComplete` is passed through (engine/B3-resolved). Tied same-height breaks are all surfaced —
 * the kernel (`resolveReopen`) picks neither.
 */
export function buildBondContinuityWitness(input: BuildBondContinuityWitnessInput): BondContinuityWitnessResult {
  // RED PHASE (D-BC green pending CL red-battery review): the evidence+bridge pipeline is not yet
  // implemented. The stub rejects with a sentinel so the bc.* battery is red until the green impl lands.
  void input;
  void bondContinuityBreak;
  return buildFail("bc-pending-green-impl");
}

export type { BondBreakFact, BondContinuityWitness };
