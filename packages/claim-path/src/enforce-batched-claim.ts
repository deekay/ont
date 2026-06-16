// @ont/claim-path — B3 integration: the batched-claim enforcement orchestrator (I-HARNESS;
// B3_INTEGRATION_PLAN §6). Pure + fixture-backed for B3; threads the audited §2 predicates/builders,
// fails closed at the FIRST failed stage in a fixed precedence, and returns an EVIDENCE TRACE + kernel
// verdict — never a bare ownership mutation. B4 substitutes real adapters for the typed seams. No new
// consensus law: every decision is an already-ratified @ont/consensus / @ont/evidence call.
//
// REASON PRECEDENCE (CL, event 1265ad74): inclusion/header fails BEFORE availability/completeness;
// missing served bytes fails BEFORE any canonical-root accept; completeness fails BEFORE any
// name-state delta. The trace preserves each underlying audited reason; the top-level reason wraps it.
import {
  evaluateBatchCompleteness,
  verifyProofBundleAgainstBitcoin,
  type BatchCompletenessPredicateInput,
  type BitcoinHeaderSource,
  type CommittedBatchContents,
  type DcvAnchorCoordinates,
  type DcvDaVerdict,
  type GateFeeSchedule,
  type GateFeeWitness,
} from "@ont/consensus";
import { verifyAvailabilityHeight, type ServedLeaf } from "@ont/evidence";

export type { BitcoinHeaderSource };

/**
 * The fee-tx witness PARTS a B4 fee/inclusion adapter supplies — the parsed anchor tx + its input prevout
 * txs, WITHOUT a schedule. The orchestrator assembles the kernel `GateFeeWitness` itself, injecting the
 * TRUSTED `policy.gateFeeSchedule`; a `schedule` riding on the seam object is never read (false-accept
 * defense — a hostile/buggy seam can't lower the fee curve). Named (not `Omit`) so the seam is explicit.
 */
export type GateFeeTxWitnessParts = Pick<GateFeeWitness, "anchorTx" | "prevoutTxs">;

/**
 * B3 typed data-source seam (fixture-backed now; a real publisher/indexer adapter in B4). Supplies the
 * raw committed batch material by anchored identity; the orchestrator runs the served-bytes /
 * availability builder ITSELF, so a source timestamp / resolver-local receipt never becomes authority.
 */
export interface BatchDataSource {
  /** The K-deep base accumulator leaves the claim's delta applies onto (its `prevRoot`), or null. */
  baseLeavesForPrevRoot(prevRoot: string): ReadonlyMap<string, string> | null;
  /** The presented served batch leaves for the `anchoredRoot`, or null if withheld. */
  servedLeavesForRoot(anchoredRoot: string): readonly ServedLeaf[] | null;
  /**
   * The VERIFIED committed-batch projection for the `anchoredRoot` (full committed set; #52) — firewall-
   * minted behind the adapter/indexer, NOT raw producer data, because `canonicalNameByteLength` is
   * fee-critical (a lowered length underpays like a low schedule). Null if absent → fail closed at gate-fee.
   */
  committedBatchForRoot(anchoredRoot: string): CommittedBatchContents | null;
  /** The parsed anchor tx + its input prevout txs (no schedule) for the anchor txid, or null. */
  feeTxForAnchor(anchorTxid: string): GateFeeTxWitnessParts | null;
}

export interface BatchedClaimSources {
  /** The SPV canonical-header seam (reused from @ont/consensus; consumed by verifyProofBundleAgainstBitcoin). */
  readonly headerSource: BitcoinHeaderSource;
  readonly batchDataSource: BatchDataSource;
}

/** The witnessed RootAnchor facts of the batched claim under enforcement (#53 / #47 folded anchor). */
export interface BatchedClaimAnchor {
  readonly txid: string;
  readonly prevRoot: string;
  readonly anchoredRoot: string;
  readonly anchorHeight: number;
  readonly batchSize: number;
}

/** Launch-freeze DA window params (#49 da-windows). */
export interface BatchedClaimWindow {
  readonly K: number;
  readonly W: number;
  readonly C: number;
}

export interface BatchedClaimInput {
  /** The proof bundle carrying `bitcoinInclusion.anchors` (consumed by verifyProofBundleAgainstBitcoin). */
  readonly proofBundle: unknown;
  readonly anchor: BatchedClaimAnchor;
}

/**
 * Trusted launch-freeze policy — NOT producer claim material. The DA `window` and the gate-fee
 * `gateFeeSchedule` are the same trust tier; the orchestrator injects the schedule into the gate-fee
 * witness so a seam can never choose it.
 */
export interface BatchedClaimPolicy {
  readonly window: BatchedClaimWindow;
  readonly gateFeeSchedule: GateFeeSchedule;
}

// Four-stage pipeline (CL concur, event 9f4cebb4): `inclusion` subsumes SPV + structural accumulator
// MEMBERSHIP; `completeness` owns the prevRoot→newRoot REPLAY. The separate membership + canonical-root
// stages are dropped (not independently isolatable without duplicating audited checks); the contested
// distinct-owner path that `deriveCanonicalRoot` adds beyond replay is a follow-up I-CONTESTED slice.
export type ClaimStep = "inclusion" | "gate-fee" | "availability" | "completeness" | "verdict";

/** One per-step evidence trace entry. Evidence is summarized (digest / root / count) — never raw bytes. */
export interface ClaimTraceEntry {
  readonly step: ClaimStep;
  readonly ok: boolean;
  /** The underlying audited reason, preserved (the top-level `result.reason` may wrap, never erase, it). */
  readonly reason: string;
  readonly evidence?: Readonly<Record<string, string | number>>;
}

/** The name-state delta an accepted claim produces. B3 returns it in the result; B4 applies it. */
export interface NameStateDelta {
  readonly anchoredRoot: string;
  readonly firstServableHeight: number;
}

export interface BatchedClaimResult {
  readonly accepted: boolean;
  /** Top-level reason. On reject it wraps (never erases) the failed step's underlying audited reason. */
  readonly reason: string;
  readonly trace: readonly ClaimTraceEntry[];
  /** Present ONLY on accept — never a bare mutation; the orchestrator returns it for B4 to apply. */
  readonly nameStateDelta?: NameStateDelta;
}

/**
 * Enforce a batched claim end-to-end (I-HARNESS). Threads the ratified §2 pipeline, fails closed at the
 * first failed stage in precedence order, and returns an evidence trace + verdict.
 *
 * GREEN CONTRACT (4 stages; precedence — each gates the next; total, fails closed, never throws):
 *   1. inclusion     `verifyProofBundleAgainstBitcoin(proofBundle, { headerSource })` — NOT the
 *                    deprecated structural alias. Subsumes SPV/header-canonicality + the bundle's
 *                    structural accumulator MEMBERSHIP. A stale/noncanonical/absent header, or a
 *                    membership/structure fault, fails here. ALSO BINDS `input.anchor` to the bundle:
 *                    `anchor.txid`/`anchorHeight` === the bundle's cited inclusion anchor, and
 *                    `anchor.anchoredRoot` === the bundle's `accumulatorProof.root` (membership root).
 *                    A mismatch fails here — this forbids the false composition "Bitcoin-included
 *                    membership for root A + served bytes / completeness for a different root B".
 *   2. availability  `verifyAvailabilityHeight({ baseLeaves, servedDelta, binding, confirmedAnchorMinedHeight })`,
 *                    `servedDelta` = `batchDataSource.servedLeavesForRoot(anchor.anchoredRoot)`, `baseLeaves` =
 *                    `baseLeavesForPrevRoot(anchor.prevRoot)`. Withheld served bytes (`null`) fails HERE;
 *                    a null/throwing base (`baseLeavesForPrevRoot`) fails HERE too — NEVER treated as an
 *                    empty base. No non-content channel (timestamp/receipt) revives absent bytes — only
 *                    presenting the actual matching content mints the witness (`firstServableHeight = h`, #84/O1).
 *   3. completeness  `evaluateBatchCompleteness(...)` — owns the prevRoot→newRoot REPLAY; the harness
 *                    builds the per-leaf projections + the availability-derived daVerdict; fails BEFORE
 *                    any name-state delta (e.g. committed `batchSize` ≠ served count → count-mismatch).
 *   4. verdict       accept → `NameStateDelta { anchoredRoot, firstServableHeight }`; else reject.
 *   The contested distinct-owner path (`deriveCanonicalRoot` → L1) is a follow-up I-CONTESTED slice.
 *   Seam throws (headerSource / batchDataSource) are caught into a failed trace step, never propagated.
 */
export function enforceBatchedClaim(
  input: BatchedClaimInput,
  sources: BatchedClaimSources,
  policy: BatchedClaimPolicy,
): BatchedClaimResult {
  const trace: ClaimTraceEntry[] = [];
  const reject = (step: ClaimStep, reason: string): BatchedClaimResult => {
    trace.push({ step, ok: false, reason });
    return { accepted: false, reason: `hrns-rejected-at-${step}: ${reason}`, trace };
  };
  const { anchor } = input;
  const { window } = policy;

  // ---- Stage 1: inclusion — verify the bundle against Bitcoin, then BIND input.anchor to it ----
  let report: { readonly valid: boolean; readonly checks: readonly { id: string; status: string; message: string }[] };
  try {
    report = verifyProofBundleAgainstBitcoin(input.proofBundle, { headerSource: sources.headerSource });
  } catch {
    return reject("inclusion", "inclusion-verifier-threw");
  }
  if (!report.valid) {
    // The resident verifier marks checks "passed" / "failed" — select the FAILED one so the trace
    // preserves the real audited reason (not the first passing check).
    const failed = report.checks.find((c) => c.status === "failed");
    return reject("inclusion", failed ? `${failed.id}: ${failed.message}` : "bundle-not-bitcoin-verified");
  }
  // Extract the anchor/root facts from the ALREADY-VERIFIED bundle; fail closed if absent/ambiguous
  // (no producer-attested shortcut field — the facts come from the verified bundle shape only).
  const bound = extractBundleAnchorFacts(input.proofBundle);
  if (bound === null) return reject("inclusion", "bundle-anchor-facts-absent-or-ambiguous");
  if (anchor.txid !== bound.txid || anchor.anchorHeight !== bound.height) {
    return reject("inclusion", "anchor-bind-txid-or-height-mismatch");
  }
  if (anchor.anchoredRoot !== bound.root) return reject("inclusion", "anchor-bind-anchored-root-mismatch");
  trace.push({
    step: "inclusion",
    ok: true,
    reason: "bundle-bitcoin-verified-and-anchor-bound",
    evidence: { anchorTxid: bound.txid, anchorHeight: bound.height, anchoredRoot: bound.root },
  });

  // ---- Stage 2: availability — the served bytes reconstruct the anchored root over a real base ----
  let servedDelta: readonly ServedLeaf[] | null;
  let baseLeaves: ReadonlyMap<string, string> | null;
  try {
    servedDelta = sources.batchDataSource.servedLeavesForRoot(anchor.anchoredRoot);
    baseLeaves = sources.batchDataSource.baseLeavesForPrevRoot(anchor.prevRoot);
  } catch {
    return reject("availability", "batch-data-source-threw");
  }
  if (servedDelta === null) return reject("availability", "served-bytes-withheld");
  if (baseLeaves === null) return reject("availability", "base-leaves-absent"); // never an empty-base default
  let firstServableHeight: number;
  let availBatchSize: number;
  try {
    const availability = verifyAvailabilityHeight({
      baseLeaves,
      servedDelta,
      binding: { anchorHeight: anchor.anchorHeight, prevRoot: anchor.prevRoot, anchoredRoot: anchor.anchoredRoot },
      confirmedAnchorMinedHeight: anchor.anchorHeight,
    });
    firstServableHeight = availability.firstServableHeight;
    availBatchSize = availability.bound.batchSize;
  } catch (e) {
    return reject("availability", `availability-unverified: ${e instanceof Error ? e.message : String(e)}`);
  }
  trace.push({ step: "availability", ok: true, reason: "served-bytes-available", evidence: { firstServableHeight, servedCount: availBatchSize } });

  // ---- Stage 3: completeness — build the per-leaf projections (no fake-verdict channel: the daVerdict
  // is derived from the availability result here) and run the ratified #83 predicate ----
  const completeness = evaluateBatchCompleteness(
    buildCompletenessInput(anchor, window, baseLeaves, servedDelta, firstServableHeight, bound.txIndex),
  );
  if (!completeness.accepts) return reject("completeness", completeness.reason);
  trace.push({ step: "completeness", ok: true, reason: completeness.reason });

  // ---- Stage 4: verdict — accept + the name-state delta B4 applies (never a bare mutation here) ----
  trace.push({ step: "verdict", ok: true, reason: "batched-claim-accepted" });
  return {
    accepted: true,
    reason: "batched-claim-accepted",
    trace,
    nameStateDelta: { anchoredRoot: anchor.anchoredRoot, firstServableHeight },
  };
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

interface BundleAnchorFacts {
  readonly txid: string;
  readonly height: number;
  readonly txIndex: number;
  readonly root: string;
}

/**
 * Extract the cited Bitcoin anchor (txid/height/txIndex) + the accumulator membership root from the
 * already-verified bundle SHAPE. Fail closed (null) if absent or ambiguous (≠ exactly one anchor) — the
 * orchestrator never trusts a producer-attested shortcut field for the anchor identity or root (CL).
 */
function extractBundleAnchorFacts(bundle: unknown): BundleAnchorFacts | null {
  if (!isObject(bundle)) return null;
  const inclusion = bundle.bitcoinInclusion;
  if (!isObject(inclusion) || !Array.isArray(inclusion.anchors) || inclusion.anchors.length !== 1) return null;
  const a = inclusion.anchors[0];
  if (!isObject(a) || typeof a.txid !== "string" || typeof a.height !== "number" || typeof a.pos !== "number") return null;
  const proof = bundle.accumulatorProof;
  if (!isObject(proof) || typeof proof.root !== "string") return null;
  return { txid: a.txid, height: a.height, txIndex: a.pos, root: proof.root };
}

/**
 * Build the #83 completeness input from the served leaves + the bound anchor + window + the
 * availability-derived served height. Each leaf's projection is made coherent with its batch + the
 * top-level base/daVerdict (the coherence the predicate requires); the daVerdict is derived here from
 * the availability result, so a data source cannot inject a fake verdict.
 */
function buildCompletenessInput(
  anchor: BatchedClaimAnchor,
  window: BatchedClaimWindow,
  baseLeaves: ReadonlyMap<string, string>,
  servedDelta: readonly ServedLeaf[],
  firstServableHeight: number,
  txIndex: number,
): BatchCompletenessPredicateInput {
  const minedHeight = anchor.anchorHeight;
  const availabilityDeadlineHeight = minedHeight + window.W;
  const challengeDeadlineHeight = minedHeight + window.W + window.C;
  const base = { prevRoot: anchor.prevRoot, baseRootHeight: minedHeight - window.K };
  const anchorCoords: DcvAnchorCoordinates = { txid: anchor.txid, minedHeight, txIndex, vout: 0, anchorInstance: 0 };
  // #84/O1: all served at h; the batch is complete at the last leaf served (= h here).
  const daVerdict: DcvDaVerdict = {
    kind: "includable",
    firstCompleteServedHeight: firstServableHeight,
    holdsPriority: firstServableHeight <= availabilityDeadlineHeight,
  };
  const batchId = `claim-batch:${anchor.anchoredRoot}`;
  const leaves = servedDelta.map((leaf, index) => ({
    projection: {
      name: `b3-batched-leaf-${index}`,
      leafKeyHex: leaf.keyHex,
      owner: { kind: "owner-key" as const, ownerKeyHex: leaf.valueHex },
      ownerValueBindingHex: leaf.valueHex,
      anchor: anchorCoords,
      batchId,
      batchLocalIndex: index,
      duplicateHandling: "unique" as const,
      daVerdict,
      base,
    },
    valueHex: leaf.valueHex,
    servedHeight: firstServableHeight,
  }));
  return {
    commitment: { prevRoot: anchor.prevRoot, newRoot: anchor.anchoredRoot, batchSize: anchor.batchSize },
    base,
    baseLeaves: Array.from(baseLeaves, ([keyHex, valueHex]) => ({ keyHex, valueHex })),
    window: { K: window.K, W: window.W, C: window.C, availabilityDeadlineHeight, challengeDeadlineHeight },
    daVerdict,
    priorSettledVerdict: null,
    batches: [{ batchId, anchor: anchorCoords, leaves }],
  };
}
