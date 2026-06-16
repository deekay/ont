// @ont/claim-path — B3 integration: the batched-claim enforcement orchestrator (I-HARNESS;
// B3_INTEGRATION_PLAN §6). Pure + fixture-backed for B3; threads the audited §2 predicates/builders,
// fails closed at the FIRST failed stage in a fixed precedence, and returns an EVIDENCE TRACE + kernel
// verdict — never a bare ownership mutation. B4 substitutes real adapters for the typed seams. No new
// consensus law: every decision is an already-ratified @ont/consensus / @ont/evidence call.
//
// REASON PRECEDENCE (CL, event 1265ad74): inclusion/header fails BEFORE availability/completeness;
// missing served bytes fails BEFORE any canonical-root accept; completeness fails BEFORE any
// name-state delta. The trace preserves each underlying audited reason; the top-level reason wraps it.
import type { BitcoinHeaderSource } from "@ont/consensus";
import type { ServedLeaf } from "@ont/evidence";

export type { BitcoinHeaderSource };

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
  readonly window: BatchedClaimWindow;
}

// Four-stage pipeline (CL concur, event 9f4cebb4): `inclusion` subsumes SPV + structural accumulator
// MEMBERSHIP; `completeness` owns the prevRoot→newRoot REPLAY. The separate membership + canonical-root
// stages are dropped (not independently isolatable without duplicating audited checks); the contested
// distinct-owner path that `deriveCanonicalRoot` adds beyond replay is a follow-up I-CONTESTED slice.
export type ClaimStep = "inclusion" | "availability" | "completeness" | "verdict";

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
 *                    membership/structure fault, fails here.
 *   2. availability  `verifyAvailabilityHeight({ baseLeaves, servedDelta, binding, confirmedAnchorMinedHeight })`,
 *                    `servedDelta` = `batchDataSource.servedLeavesForRoot(anchoredRoot)`, `baseLeaves` =
 *                    `baseLeavesForPrevRoot(anchor.prevRoot)`. Withheld served bytes (`null`) fails HERE;
 *                    no non-content channel (timestamp/receipt) revives absent bytes — only presenting the
 *                    actual matching content mints the witness (`firstServableHeight = h`, #84/O1).
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
): BatchedClaimResult {
  // RED PHASE (I-HARNESS green pending CL red-battery review): the threaded §2 pipeline is not yet
  // implemented. The stub fails closed with a sentinel so the hrns.* battery is red until green lands.
  void input;
  void sources;
  return { accepted: false, reason: "hrns-pending-green-impl", trace: [] };
}
