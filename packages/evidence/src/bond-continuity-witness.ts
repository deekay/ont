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

/**
 * Stage-1 output: a verified confirmed bond-outpoint spend. Deliberately NOT isomorphic to a
 * `BondBreakFact` — a spend is not a release until the #79 bridge rules it one. It carries
 * `spendHeight` (NOT `releaseHeight`) + the `spendTxid` that identifies the spend.
 */
export interface VerifiedBondSpendFact {
  /** The confirmed mined height of the spend (`= inclusion.height`); becomes a `releaseHeight` only via #79. */
  readonly spendHeight: number;
  /** The confirmed spend tx's txid (`= inclusion.txid = legacyTxidOf(spendTx)`); identifies the spend (dedup key). */
  readonly spendTxid: string;
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

const OBS_KEYS = ["bondOutpoint", "spendTx", "inclusion"] as const;
const OUTPOINT_KEYS = ["txid", "vout"] as const;
const INCLUSION_KEYS = ["txid", "height"] as const;
const BUILD_KEYS = ["witnessComplete", "spends"] as const;
const CLASS_KEYS = ["observation", "preMaturity", "sameTxValidSuccessorBond"] as const;

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
 *   mint { spendHeight: inclusion.height, spendTxid: inclusion.txid } — a spend fact, NOT a break.
 */
export function verifyBondSpendFact(obs: BondSpendObservation): BondSpendFactResult {
  // ---- shape totality (closed shape; no source/timestamp channel; never throws) ----
  const o = obs as unknown;
  if (!isObject(o) || !isClosedShape(o, OBS_KEYS)) return spendFail("bc-observation-malformed");
  const bondOutpoint = o.bondOutpoint;
  if (!isObject(bondOutpoint) || !isClosedShape(bondOutpoint, OUTPOINT_KEYS)) return spendFail("bc-observation-malformed");
  if (typeof bondOutpoint.txid !== "string" || !HEX_64.test(bondOutpoint.txid) || !isU32(bondOutpoint.vout)) {
    return spendFail("bc-observation-malformed");
  }
  const inclusion = o.inclusion;
  if (!isObject(inclusion) || !isClosedShape(inclusion, INCLUSION_KEYS)) return spendFail("bc-observation-malformed");
  if (typeof inclusion.txid !== "string" || !HEX_64.test(inclusion.txid) || !isPositiveSafeInt(inclusion.height)) {
    return spendFail("bc-observation-malformed");
  }

  // ---- fee-fact binding: the presented tx IS the confirmed one, and it spends the bond outpoint ----
  const spendTxid = legacyTxidOf(o.spendTx as LegacyTransaction);
  if (spendTxid === null) return spendFail("bc-spend-tx-malformed");
  if (spendTxid !== inclusion.txid) return spendFail("bc-spend-txid-mismatch");
  const spent = (o.spendTx as LegacyTransaction).inputs.some(
    (i) => i.prevoutTxid === bondOutpoint.txid && i.prevoutVout === bondOutpoint.vout,
  );
  if (!spent) return spendFail("bc-outpoint-not-spent");

  return { ok: true, spendFact: { spendHeight: inclusion.height, spendTxid } };
}

/**
 * The two-stage builder — verify each spend (stage 1) then reduce via the ratified #79 predicate
 * (stage 2) into the kernel's `BondContinuityWitness`.
 *
 * GREEN CONTRACT (fail-closed order; total, never throws):
 *   1. top-level: `input` is an object with exactly `{ witnessComplete, spends }`, `witnessComplete`
 *      is a boolean, `spends` is an array ⇒ else `bc-input-malformed` (no truthiness: `"false"`/`1`
 *      are NOT booleans).
 *   2. per classification `c`: object with exactly `{ observation, preMaturity, sameTxValidSuccessorBond }`,
 *      both flags strictly boolean (no signer/authorized/source channel) ⇒ else `bc-classification-malformed`.
 *   3. `verifyBondSpendFact(c.observation)` ⇒ on `!ok`, the whole build fails closed with that reason
 *      (a fabricated/no-spend observation never yields a partial witness).
 *   4. dedup: two verified spends sharing `spendTxid` ⇒ `bc-duplicate-spend-fact` (one spend row repeated
 *      must NOT manufacture a same-height tiebreak; two DISTINCT same-height spends still surface both).
 *   5. bridge: `bondContinuityBreak({ preMaturity, currentBondOutpointSpent: true, sameTxValidSuccessorBond })`;
 *      ONLY a released verdict (`preMaturity && !sameTxValidSuccessorBond`) becomes `BondBreakFact
 *      { releaseHeight: spendHeight }`. Mature / valid-successor spends contribute no break.
 *   return { witnessComplete (passed through), breaks }. Tied same-height breaks are all surfaced —
 *   the kernel (`resolveReopen`) derives the latest / picks neither.
 */
export function buildBondContinuityWitness(input: BuildBondContinuityWitnessInput): BondContinuityWitnessResult {
  // ---- top-level totality (closed shape; strict booleans, no truthiness; never throws) ----
  const inp = input as unknown;
  if (!isObject(inp) || !isClosedShape(inp, BUILD_KEYS)) return buildFail("bc-input-malformed");
  if (typeof inp.witnessComplete !== "boolean" || !Array.isArray(inp.spends)) return buildFail("bc-input-malformed");

  // ---- stage 1: verify each classification's spend fact (a fabricated/no-spend obs fails closed) ----
  const spendFacts: VerifiedBondSpendFact[] = [];
  const flags: { readonly preMaturity: boolean; readonly sameTxValidSuccessorBond: boolean }[] = [];
  for (const c of inp.spends) {
    const cls = c as unknown;
    if (!isObject(cls) || !isClosedShape(cls, CLASS_KEYS)) return buildFail("bc-classification-malformed");
    if (typeof cls.preMaturity !== "boolean" || typeof cls.sameTxValidSuccessorBond !== "boolean") {
      return buildFail("bc-classification-malformed");
    }
    const result = verifyBondSpendFact(cls.observation as BondSpendObservation);
    if (!result.ok) return buildFail(result.reason);
    spendFacts.push(result.spendFact);
    flags.push({ preMaturity: cls.preMaturity, sameTxValidSuccessorBond: cls.sameTxValidSuccessorBond });
  }

  // ---- dedup: the same spend (same txid) must not be presented twice (no manufactured tiebreak) ----
  const seen = new Set<string>();
  for (const fact of spendFacts) {
    if (seen.has(fact.spendTxid)) return buildFail("bc-duplicate-spend-fact");
    seen.add(fact.spendTxid);
  }

  // ---- stage 2: bridge — the ratified #79 predicate decides which spends are RELEASE breaks ----
  const breaks: BondBreakFact[] = [];
  for (let i = 0; i < spendFacts.length; i += 1) {
    const verdict = bondContinuityBreak({
      preMaturity: flags[i]!.preMaturity,
      currentBondOutpointSpent: true, // a verified spend fact proves the outpoint was spent
      sameTxValidSuccessorBond: flags[i]!.sameTxValidSuccessorBond,
    });
    if (verdict.decided && verdict.released) {
      breaks.push({ releaseHeight: spendFacts[i]!.spendHeight });
    }
  }

  return { ok: true, witness: { witnessComplete: inp.witnessComplete, breaks } };
}

export type { BondBreakFact, BondContinuityWitness };
