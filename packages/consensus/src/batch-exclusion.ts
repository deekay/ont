// B2 batch-exclusion locality predicate (B10 / D7 / DA §5). A PURE, total, closed-shape derivation of
// the per-name insertion provenance from a set of insert-only anchored batches, with a DA-excluded
// subset removed. It exists to make the EXCLUSION-LOCALITY / STATE-EQUIVALENCE property checkable:
// excluding a batch removes only that batch's own leaves, every other name is byte-identical, no
// already-final name is unseated, and the result equals the as-if-the-excluded-batch-never-anchored
// world.
//
// AUTHORITY (the ratified aspects):
//   - B10 / D7: a DA-excluded batch's claims vanish uniformly; exclusion removes only that batch's own
//     leaves and alters no other name; the resulting state equals the state computed as if the
//     excluded batch never existed.
//   - DA §5 / D7 attack flag: this rests on the INSERT-ONLY / commutative merge fact — a batch only
//     INSERTS names, never mutates an existing one. This predicate models exactly that and nothing
//     else; that insert-only invariant is a cross-area coupling the batched-path (B) area MUST hold
//     (if batches ever admit non-insert ops, exclusion stops being self-contained).
//
// #49-INDEPENDENT (the parking-rule boundary). The DA verdict enters as `excludedBatchIds` — an
// explicit CONSUMED witnessed input — never recomputed from a node's own local availability success
// (B10 attack flag: "the kernel must take the verdict as an explicit witnessed input"). No W/C/K here.
//
// DELIBERATELY EXCLUDED: finalization / collision / nullify (notice-window #69), first-anchor-wins
// reduction (A12, engine), occupancy takeover decisions (occupancy #71 / B7). `priorFinalNames` is a
// PRESERVATION fact, not a new occupancy reducer: a leaf targeting an already-final name is an
// insert-only no-op (it never appears as a fresh insertion and never unseats the final owner, per
// #26/B7) — this predicate does not re-decide takeover. Name bytes are caller-parsed canonical facts;
// the A6 name grammar is not re-opened here.
//
// Total / fail-closed + closed-shape (the #63-#71 discipline): malformed, extra-field, duplicate
// batchId, or duplicate/unknown excluded id fails closed (derived:false) and never throws — so the
// derivation can never become order-dependent or admit a producer-asserted exclusion. Determinism:
// names and contributing batch ids are emitted as sorted arrays (Map-internal, no prototype-key
// surprises).
//
// Rules: docs/core/B2_KERNEL_HARDENING.md B10 / D7; DECISIONS #26 (insertion-only anchors), DA §5.

import { accumulatorRootOf } from "@ont/protocol";

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const hasExactKeys = (obj: object, allowed: readonly string[]): boolean =>
  isClosedShape(obj, allowed) && allowed.every((key) => Object.prototype.hasOwnProperty.call(obj, key));
const isNonEmptyString = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const isHex32 = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);
const isInteger = (x: unknown): x is number => Number.isInteger(x);
const isBoolean = (x: unknown): x is boolean => typeof x === "boolean";

export interface BatchLeaf {
  /** A canonical name being inserted (caller-parsed; the A6 grammar is not re-checked here). */
  readonly name: string;
}

export interface InsertionBatch {
  readonly batchId: string;
  readonly leaves: readonly BatchLeaf[];
}

export interface BatchExclusionInput {
  /** The accepted anchored batches, each an insert-only set of name leaves. */
  readonly batches: readonly InsertionBatch[];
  /** The DA verdict's exclusions — a consumed witnessed input; each MUST reference an existing batch. */
  readonly excludedBatchIds: readonly string[];
  /** Names already final before this merge — preserved, never unseated (a preservation fact). */
  readonly priorFinalNames: readonly string[];
}

export interface BatchNameInsertion {
  readonly name: string;
  /** The non-excluded batch ids that inserted this name, sorted (deterministic). */
  readonly contributingBatchIds: readonly string[];
}

export interface BatchExclusionVerdict {
  /** False on malformed input (fail closed). */
  readonly derived: boolean;
  /** Per-name insertion provenance from the non-excluded batches, sorted by name; excludes final names. */
  readonly insertions: readonly BatchNameInsertion[];
  /** The already-final names, preserved (sorted) — none unseated by the merge. */
  readonly preservedFinalNames: readonly string[];
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

// #83 batch-completeness / D-CV. The conformance matrix below pins the ratified
// 12-case inventory and the closed projection shape; `evaluateBatchCompleteness`
// (further down) implements the exact prevRoot -> newRoot replay conjunct against
// that ratified O2 surface, including insert-only disjointness, projection/top-level
// coherence, and verdict/served-height timing consistency (slice-4 + round-2).
export type BatchCompletenessCaseOwner =
  | "batch-completeness"
  | "bond-notice-guard"
  | "da-trust-model"
  | "served-bytes-da-windows";

export interface BatchCompletenessConformanceCase {
  readonly id: string;
  readonly title: string;
  readonly owner: BatchCompletenessCaseOwner;
  /** The resident surface that will eventually bind this vector. */
  readonly target: "includable" | "projection" | "notice-window" | "served-bytes" | "root-chain";
}

export const BATCH_COMPLETENESS_CONFORMANCE_MATRIX = [
  { id: "bc.full-n-required", title: "full-N required", owner: "batch-completeness", target: "includable" },
  { id: "bc.hidden-claim-no-effect", title: "hidden-claim no-effect", owner: "bond-notice-guard", target: "notice-window" },
  { id: "bc.mirror-lies-fail", title: "mirror-lies-fail", owner: "served-bytes-da-windows", target: "served-bytes" },
  { id: "bc.projection-carries-owner", title: "projection-carries-owner", owner: "batch-completeness", target: "projection" },
  { id: "bc.copied-anchor-grief-not-steal", title: "copied-anchor grief-not-steal", owner: "da-trust-model", target: "root-chain" },
  { id: "bc.finalize-once", title: "finalize-once", owner: "da-trust-model", target: "includable" },
  { id: "bc.exact-n-no-extras", title: "exact-N / no extras, including batchSize=0/no-op rejected", owner: "batch-completeness", target: "includable" },
  { id: "bc.replay-from-base", title: "replay-from-base", owner: "batch-completeness", target: "includable" },
  { id: "bc.one-bad-leaf-poisons-batch", title: "one bad leaf poisons the batch", owner: "batch-completeness", target: "includable" },
  { id: "bc.partial-timing", title: "partial timing", owner: "served-bytes-da-windows", target: "includable" },
  { id: "bc.reorg-remine", title: "reorg / re-mine", owner: "served-bytes-da-windows", target: "root-chain" },
  { id: "bc.projection-closure", title: "projection closure", owner: "batch-completeness", target: "projection" },
] as const satisfies readonly BatchCompletenessConformanceCase[];

export type BatchCompletenessCaseId = (typeof BATCH_COMPLETENESS_CONFORMANCE_MATRIX)[number]["id"];

export const DCV_ANCHOR_COORDINATE_KEYS = ["txid", "minedHeight", "txIndex", "vout", "anchorInstance"] as const;
export const DCV_BASE_RELATIONSHIP_KEYS = ["prevRoot", "baseRootHeight"] as const;
export const DCV_CLOSED_LEAF_PROJECTION_KEYS = [
  "name",
  "leafKeyHex",
  "owner",
  "ownerValueBindingHex",
  "anchor",
  "batchId",
  "batchLocalIndex",
  "duplicateHandling",
  "daVerdict",
  "base",
] as const;

export type DcvOwnerIdentity =
  | { readonly kind: "owner-key"; readonly ownerKeyHex: string }
  | { readonly kind: "owner-commitment"; readonly commitmentHex: string };

export interface DcvAnchorCoordinates {
  readonly txid: string;
  readonly minedHeight: number;
  readonly txIndex: number;
  readonly vout: number;
  /** Disambiguates multiple RootAnchor instances in one transaction if policy ever admits them. */
  readonly anchorInstance: number;
}

export interface DcvBaseRootRelationship {
  /** R_{h-K}: the K-deep-confirmed base root this delta applies onto. */
  readonly prevRoot: string;
  /** Height of the canonical prefix whose fixpoint root is `prevRoot`. */
  readonly baseRootHeight: number;
}

export type DcvDuplicateHandling =
  | "unique"
  | "same-owner-duplicate"
  | "distinct-owner-contested"
  | "batch-local-duplicate-reject";

export type DcvDaVerdict =
  | {
      readonly kind: "includable";
      readonly firstCompleteServedHeight: number;
      readonly holdsPriority: boolean;
    }
  | {
      readonly kind: "excluded";
      readonly firstCompleteServedHeight: null;
      readonly holdsPriority: false;
    };

export interface DcvClosedLeafProjection {
  readonly name: string;
  readonly leafKeyHex: string;
  readonly owner: DcvOwnerIdentity;
  /** Equality-preserving material binding the owner to the committed leaf value. */
  readonly ownerValueBindingHex: string;
  readonly anchor: DcvAnchorCoordinates;
  readonly batchId: string;
  readonly batchLocalIndex: number;
  readonly duplicateHandling: DcvDuplicateHandling;
  readonly daVerdict: DcvDaVerdict;
  readonly base: DcvBaseRootRelationship;
}

const DCV_OWNER_KEY_KEYS = ["kind", "ownerKeyHex"] as const;
const DCV_OWNER_COMMITMENT_KEYS = ["kind", "commitmentHex"] as const;
const DCV_DA_INCLUDED_KEYS = ["kind", "firstCompleteServedHeight", "holdsPriority"] as const;
const DCV_DA_EXCLUDED_KEYS = ["kind", "firstCompleteServedHeight", "holdsPriority"] as const;
const DCV_DUPLICATE_HANDLING_VALUES = new Set<DcvDuplicateHandling>([
  "unique",
  "same-owner-duplicate",
  "distinct-owner-contested",
  "batch-local-duplicate-reject",
]);

function isDcvOwnerIdentity(input: unknown): input is DcvOwnerIdentity {
  if (!isObject(input) || typeof input.kind !== "string") {
    return false;
  }
  if (input.kind === "owner-key") {
    return hasExactKeys(input, DCV_OWNER_KEY_KEYS) && isHex32(input.ownerKeyHex);
  }
  if (input.kind === "owner-commitment") {
    return hasExactKeys(input, DCV_OWNER_COMMITMENT_KEYS) && isHex32(input.commitmentHex);
  }
  return false;
}

function isDcvAnchorCoordinates(input: unknown): input is DcvAnchorCoordinates {
  return (
    isObject(input) &&
    hasExactKeys(input, DCV_ANCHOR_COORDINATE_KEYS) &&
    isHex32(input.txid) &&
    isInteger(input.minedHeight) &&
    isInteger(input.txIndex) &&
    isInteger(input.vout) &&
    isInteger(input.anchorInstance)
  );
}

function isDcvBaseRootRelationship(input: unknown): input is DcvBaseRootRelationship {
  return (
    isObject(input) &&
    hasExactKeys(input, DCV_BASE_RELATIONSHIP_KEYS) &&
    isHex32(input.prevRoot) &&
    isInteger(input.baseRootHeight)
  );
}

function isDcvDaVerdict(input: unknown): input is DcvDaVerdict {
  if (!isObject(input) || typeof input.kind !== "string") {
    return false;
  }
  if (input.kind === "includable") {
    return (
      hasExactKeys(input, DCV_DA_INCLUDED_KEYS) &&
      isInteger(input.firstCompleteServedHeight) &&
      isBoolean(input.holdsPriority)
    );
  }
  if (input.kind === "excluded") {
    return (
      hasExactKeys(input, DCV_DA_EXCLUDED_KEYS) &&
      input.firstCompleteServedHeight === null &&
      input.holdsPriority === false
    );
  }
  return false;
}

/** Projection-only closed-shape gate; it does not perform exact-delta replay. */
export function isClosedDcvProjection(input: unknown): input is DcvClosedLeafProjection {
  return (
    isObject(input) &&
    hasExactKeys(input, DCV_CLOSED_LEAF_PROJECTION_KEYS) &&
    isNonEmptyString(input.name) &&
    isHex32(input.leafKeyHex) &&
    isDcvOwnerIdentity(input.owner) &&
    isHex32(input.ownerValueBindingHex) &&
    isDcvAnchorCoordinates(input.anchor) &&
    isNonEmptyString(input.batchId) &&
    isInteger(input.batchLocalIndex) &&
    typeof input.duplicateHandling === "string" &&
    DCV_DUPLICATE_HANDLING_VALUES.has(input.duplicateHandling as DcvDuplicateHandling) &&
    isDcvDaVerdict(input.daVerdict) &&
    isDcvBaseRootRelationship(input.base)
  );
}

export interface BatchCompletenessAnchorCommitment {
  /** R_{h-K}: the base root this exact delta must replay from. */
  readonly prevRoot: string;
  /** The anchored root that `prevRoot + exact served delta` must recompute. */
  readonly newRoot: string;
  /** The committed RootAnchor batchSize; zero/no-op anchors are rejected by #83. */
  readonly batchSize: number;
}

export interface BatchCompletenessLeafWitness {
  /** D-CV closed projection for this served leaf, including owner/binding/anchor/base facts. */
  readonly projection: DcvClosedLeafProjection;
  /** The committed leaf value bytes used by the exact prevRoot -> newRoot replay. */
  readonly valueHex: string;
  /** Per-leaf served height; null means the leaf was not served by the witnessed close. */
  readonly servedHeight: number | null;
}

export interface BatchCompletenessBatchWitness {
  readonly batchId: string;
  readonly anchor: DcvAnchorCoordinates;
  readonly leaves: readonly BatchCompletenessLeafWitness[];
}

export interface BatchCompletenessBaseLeafWitness {
  readonly keyHex: string;
  readonly valueHex: string;
}

export interface BatchCompletenessWindowFacts {
  /** Confirmation depth K, kept as an input so base-root height checks do not bake a constant. */
  readonly K: number;
  /** Availability window W, kept as an input so vectors can prove no baked constant. */
  readonly W: number;
  /** Challenge window C, kept as an input so vectors can prove no baked constant. */
  readonly C: number;
  /** Resolved h+W boundary for this anchor. */
  readonly availabilityDeadlineHeight: number;
  /** Resolved h+W+C boundary for this anchor. */
  readonly challengeDeadlineHeight: number;
}

export interface BatchCompletenessPriorSettledVerdict {
  /** The already-settled verdict that finalize-once must preserve. */
  readonly accepts: boolean;
  readonly reason: BatchCompletenessReason;
  /** Height at which the verdict became settled/finalized. */
  readonly settledAtHeight: number;
}

export interface BatchCompletenessPredicateInput {
  readonly commitment: BatchCompletenessAnchorCommitment;
  readonly base: DcvBaseRootRelationship;
  /**
   * Scaffold form of the D-CV base snapshot. D-SB-bind currently models this as
   * the prior committed leaf set; D-CV may later replace the provisioning with a
   * compact authenticated snapshot, but the predicate must receive enough
   * witnessed base material to make `prevRoot -> newRoot` replay meaningful.
   */
  readonly baseLeaves: readonly BatchCompletenessBaseLeafWitness[];
  readonly window: BatchCompletenessWindowFacts;
  readonly daVerdict: DcvDaVerdict;
  readonly priorSettledVerdict: BatchCompletenessPriorSettledVerdict | null;
  readonly batches: readonly BatchCompletenessBatchWitness[];
}

export type BatchCompletenessReason =
  | "batch-completeness-not-implemented"
  | "batch-completeness-accepted"
  | "batch-completeness-input-malformed"
  | "batch-completeness-zero-or-noop-anchor"
  | "batch-completeness-count-mismatch"
  | "batch-completeness-duplicate-leaf-key"
  | "batch-completeness-owner-binding-invalid"
  | "batch-completeness-projection-open-shape"
  | "batch-completeness-replay-mismatch"
  | "batch-completeness-da-excluded"
  | "batch-completeness-late"
  | "batch-completeness-stale-anchor"
  | "batch-completeness-timing-contradiction"
  | "batch-completeness-projection-incoherent"
  | "batch-completeness-insert-only-violation";

export interface BatchCompletenessVerdict {
  readonly accepts: boolean;
  readonly reason: BatchCompletenessReason;
}

const BC_INPUT_KEYS = ["commitment", "base", "baseLeaves", "window", "daVerdict", "priorSettledVerdict", "batches"] as const;
const BC_COMMITMENT_KEYS = ["prevRoot", "newRoot", "batchSize"] as const;
const BC_WINDOW_KEYS = ["K", "W", "C", "availabilityDeadlineHeight", "challengeDeadlineHeight"] as const;
const BC_BASE_LEAF_KEYS = ["keyHex", "valueHex"] as const;
const BC_PRIOR_SETTLED_KEYS = ["accepts", "reason", "settledAtHeight"] as const;
const BC_BATCH_KEYS = ["batchId", "anchor", "leaves"] as const;
const BC_LEAF_KEYS = ["projection", "valueHex", "servedHeight"] as const;

const bcFail = (reason: BatchCompletenessReason): BatchCompletenessVerdict => ({ accepts: false, reason });

// Structural equality over the closed D-CV sub-shapes, used to enforce that each leaf's projection
// agrees with the facts of the batch it rides in and the consumed top-level DA verdict.
const anchorEq = (a: DcvAnchorCoordinates, x: DcvAnchorCoordinates): boolean =>
  a.txid === x.txid && a.minedHeight === x.minedHeight && a.txIndex === x.txIndex && a.vout === x.vout && a.anchorInstance === x.anchorInstance;
const baseRelEq = (a: DcvBaseRootRelationship, x: DcvBaseRootRelationship): boolean =>
  a.prevRoot === x.prevRoot && a.baseRootHeight === x.baseRootHeight;
const daVerdictEq = (a: DcvDaVerdict, x: DcvDaVerdict): boolean =>
  a.kind === x.kind && a.firstCompleteServedHeight === x.firstCompleteServedHeight && a.holdsPriority === x.holdsPriority;

/**
 * #83 batch-completeness (O2): exact-delta whole-batch completeness predicate. PURE / total /
 * fail-closed / closed-shape (#63-#71). It consumes the witnessed DA verdict but COMPUTES the
 * canonical-root replay itself (D-CV is kernel law) via `@ont/protocol` `accumulatorRootOf`, and
 * cross-checks the verdict against the witnessed served-heights so a contradictory witness fails
 * closed. Reason precedence (CL slice-4 review rounds 1-2): prior-settled accept (canonical reason
 * only) → da-excluded → zero/no-op → open-projection → projection-incoherent (projection facts must
 * agree with the enclosing batch + top-level base + consumed DA verdict) → duplicate-key/count →
 * stale base/anchor → insert-only-violation (base/delta must be a disjoint union; no silent
 * overwrite) → replay-mismatch → timing/verdict-consistency.
 */
export function evaluateBatchCompleteness(input: BatchCompletenessPredicateInput): BatchCompletenessVerdict {
  // --- 0. Fail-closed shape validation over an untrusted runtime value (never throws). ---
  const i = input as unknown;
  if (!isObject(i) || !hasExactKeys(i, BC_INPUT_KEYS)) return bcFail("batch-completeness-input-malformed");
  const commitment = i.commitment;
  if (
    !isObject(commitment) || !hasExactKeys(commitment, BC_COMMITMENT_KEYS) ||
    !isHex32(commitment.prevRoot) || !isHex32(commitment.newRoot) ||
    !isInteger(commitment.batchSize) || commitment.batchSize < 0
  ) {
    return bcFail("batch-completeness-input-malformed");
  }
  const base = i.base;
  if (!isObject(base) || !hasExactKeys(base, DCV_BASE_RELATIONSHIP_KEYS) || !isHex32(base.prevRoot) || !isInteger(base.baseRootHeight)) {
    return bcFail("batch-completeness-input-malformed");
  }
  if (!Array.isArray(i.baseLeaves) || !i.baseLeaves.every((bl) => isObject(bl) && hasExactKeys(bl, BC_BASE_LEAF_KEYS) && isHex32(bl.keyHex) && isHex32(bl.valueHex))) {
    return bcFail("batch-completeness-input-malformed");
  }
  const win = i.window;
  if (
    !isObject(win) || !hasExactKeys(win, BC_WINDOW_KEYS) ||
    !isInteger(win.K) || !isInteger(win.W) || !isInteger(win.C) ||
    !isInteger(win.availabilityDeadlineHeight) || !isInteger(win.challengeDeadlineHeight)
  ) {
    return bcFail("batch-completeness-input-malformed");
  }
  if (!isDcvDaVerdict(i.daVerdict)) return bcFail("batch-completeness-input-malformed");
  const prior = i.priorSettledVerdict;
  if (
    prior !== null &&
    !(isObject(prior) && hasExactKeys(prior, BC_PRIOR_SETTLED_KEYS) && isBoolean(prior.accepts) && isNonEmptyString(prior.reason) && isInteger(prior.settledAtHeight))
  ) {
    return bcFail("batch-completeness-input-malformed");
  }
  if (
    !Array.isArray(i.batches) || i.batches.length === 0 ||
    !i.batches.every(
      (b) =>
        isObject(b) && hasExactKeys(b, BC_BATCH_KEYS) && isNonEmptyString(b.batchId) && isDcvAnchorCoordinates(b.anchor) &&
        Array.isArray(b.leaves) &&
        b.leaves.every((lf) => isObject(lf) && hasExactKeys(lf, BC_LEAF_KEYS) && isObject(lf.projection) && typeof lf.valueHex === "string" && (lf.servedHeight === null || isInteger(lf.servedHeight))),
    )
  ) {
    return bcFail("batch-completeness-input-malformed");
  }

  // Validated structurally → use the typed input for the decision logic.
  const { commitment: c, base: b, baseLeaves, window: w, daVerdict, priorSettledVerdict, batches } = input;
  const leaves = batches.flatMap((batch) => batch.leaves);

  // --- 1. finalize-once: a prior settled accept is never revised (later byte-loss cannot revoke it).
  //         Only a settled accept carrying the canonical accept reason short-circuits; an
  //         accepts:true witness with any other reason is incoherent and falls through to fresh
  //         evaluation rather than being trusted blindly. ---
  if (priorSettledVerdict !== null && priorSettledVerdict.accepts && priorSettledVerdict.reason === "batch-completeness-accepted") {
    return { accepts: true, reason: "batch-completeness-accepted" };
  }
  // --- 2. DA excluded → no completeness effect. ---
  if (daVerdict.kind === "excluded") return bcFail("batch-completeness-da-excluded");
  // --- 3a. zero / no-op anchor. ---
  if (c.batchSize === 0 || leaves.length === 0) return bcFail("batch-completeness-zero-or-noop-anchor");
  // --- 3b. open projection: every served leaf's projection must be closed-shape, and its served value 32-byte hex. ---
  for (const lf of leaves) {
    if (!isClosedDcvProjection(lf.projection) || !isHex32(lf.valueHex)) return bcFail("batch-completeness-projection-open-shape");
  }
  // --- 3b'. projection coherence: each leaf's projection facts must agree with the batch it rides in
  //          (batchId + anchor), the top-level base relationship, and the consumed DA verdict. Without
  //          this the D-CV projection contract is underpowered — a witness could smuggle a leaf whose
  //          projection disagrees with its enclosing batch and still pass replay (CL review). ---
  for (const batch of batches) {
    for (const lf of batch.leaves) {
      const p = lf.projection;
      if (
        p.batchId !== batch.batchId ||
        !anchorEq(p.anchor, batch.anchor) ||
        !baseRelEq(p.base, b) ||
        !daVerdictEq(p.daVerdict, daVerdict)
      ) {
        return bcFail("batch-completeness-projection-incoherent");
      }
    }
  }
  // --- 3c. duplicate leaf key, then exact-N count. ---
  const seenKeys = new Set<string>();
  for (const lf of leaves) {
    if (seenKeys.has(lf.projection.leafKeyHex)) return bcFail("batch-completeness-duplicate-leaf-key");
    seenKeys.add(lf.projection.leafKeyHex);
  }
  if (leaves.length !== c.batchSize) return bcFail("batch-completeness-count-mismatch");
  // --- 3d. stale base/anchor: the base must be exactly K-deep under the anchor's mined height. ---
  for (const batch of batches) {
    if (b.baseRootHeight !== batch.anchor.minedHeight - w.K) return bcFail("batch-completeness-stale-anchor");
  }
  // --- 3e. insert-only union: the base leaf set must be a well-formed set (distinct keys) and the
  //          served delta must be DISJOINT from it. A delta key colliding with a base key would
  //          silently OVERWRITE the base value in the replay map and admit a mutation the batched
  //          path forbids (insert-only; DA agreement §5 commutative-merge / D7). ---
  const baseRootMap = new Map<string, string>();
  for (const bl of baseLeaves) {
    if (baseRootMap.has(bl.keyHex)) return bcFail("batch-completeness-insert-only-violation");
    baseRootMap.set(bl.keyHex, bl.valueHex);
  }
  for (const lf of leaves) {
    if (baseRootMap.has(lf.projection.leafKeyHex)) return bcFail("batch-completeness-insert-only-violation");
  }
  // --- 3f. replay-mismatch: prevRoot is the root of baseLeaves, and prevRoot+delta recomputes newRoot. ---
  if (accumulatorRootOf(baseRootMap) !== c.prevRoot || b.prevRoot !== c.prevRoot) return bcFail("batch-completeness-replay-mismatch");
  const fullMap = new Map<string, string>(baseRootMap);
  for (const lf of leaves) fullMap.set(lf.projection.leafKeyHex, lf.valueHex);
  if (accumulatorRootOf(fullMap) !== c.newRoot) return bcFail("batch-completeness-replay-mismatch");
  // --- 4. timing + verdict/served-height consistency. ---
  if (leaves.some((lf) => lf.servedHeight === null)) return bcFail("batch-completeness-late");
  const maxServed = Math.max(...leaves.map((lf) => lf.servedHeight as number));
  if (maxServed > w.challengeDeadlineHeight) return bcFail("batch-completeness-late");
  // The witnessed DA verdict must agree with the witnessed served-heights: the batch first becomes
  // complete at the last leaf served (maxServed), and priority is held iff that is within h+W. A
  // verdict that disagrees with its own served-height facts fails closed rather than be trusted (CL).
  if (daVerdict.kind === "includable") {
    if (daVerdict.firstCompleteServedHeight !== maxServed) return bcFail("batch-completeness-timing-contradiction");
    if (daVerdict.holdsPriority !== (maxServed <= w.availabilityDeadlineHeight)) return bcFail("batch-completeness-timing-contradiction");
  }

  return { accepts: true, reason: "batch-completeness-accepted" };
}

const INPUT_KEYS = ["batches", "excludedBatchIds", "priorFinalNames"] as const;
const BATCH_KEYS = ["batchId", "leaves"] as const;
const LEAF_KEYS = ["name"] as const;

const fail = (reason: string): BatchExclusionVerdict => ({
  derived: false,
  insertions: [],
  preservedFinalNames: [],
  reason,
});

/**
 * Derive the per-name insertion provenance of `batches` with `excludedBatchIds` removed, preserving
 * `priorFinalNames`. Pure and total — malformed input fails closed (derived:false) and never throws.
 * The result is a deterministic, sorted projection so callers can prove the exclusion-locality /
 * state-equivalence property by comparing two derivations.
 */
export function deriveBatchedInsertions(input: BatchExclusionInput): BatchExclusionVerdict {
  const i = input as unknown;
  if (!isObject(i) || !isClosedShape(i, INPUT_KEYS)) {
    return fail("batch-exclusion-input-malformed");
  }
  if (!Array.isArray(i.batches) || !Array.isArray(i.excludedBatchIds) || !Array.isArray(i.priorFinalNames)) {
    return fail("batch-exclusion-input-malformed");
  }

  // Validate batches + collect unique batch ids (duplicate batchId fails closed — not order-dependent).
  const batchIds = new Set<string>();
  for (const batch of i.batches) {
    if (!isObject(batch) || !isClosedShape(batch, BATCH_KEYS) || !isNonEmptyString(batch.batchId) || !Array.isArray(batch.leaves)) {
      return fail("batch-exclusion-batch-malformed");
    }
    if (batchIds.has(batch.batchId)) {
      return fail("batch-exclusion-duplicate-batch-id");
    }
    batchIds.add(batch.batchId);
    for (const leaf of batch.leaves) {
      if (!isObject(leaf) || !isClosedShape(leaf, LEAF_KEYS) || !isNonEmptyString(leaf.name)) {
        return fail("batch-exclusion-leaf-malformed");
      }
    }
  }

  // Validate exclusions: unique, and every id must reference an existing batch (unknown fails closed).
  const excluded = new Set<string>();
  for (const id of i.excludedBatchIds) {
    if (!isNonEmptyString(id)) {
      return fail("batch-exclusion-excluded-id-malformed");
    }
    if (excluded.has(id)) {
      return fail("batch-exclusion-duplicate-excluded-id");
    }
    if (!batchIds.has(id)) {
      return fail("batch-exclusion-unknown-excluded-id");
    }
    excluded.add(id);
  }

  // Validate + collect the preserved final names.
  const finalNames = new Set<string>();
  for (const name of i.priorFinalNames) {
    if (!isNonEmptyString(name)) {
      return fail("batch-exclusion-final-name-malformed");
    }
    finalNames.add(name);
  }

  // Insert-only merge over the NON-excluded batches: group contributing batch ids per name. A leaf
  // targeting an already-final name is an insert-only no-op (preserved, never re-inserted; #26/B7).
  const perName = new Map<string, Set<string>>();
  for (const batch of i.batches as readonly InsertionBatch[]) {
    if (excluded.has(batch.batchId)) {
      continue;
    }
    for (const leaf of batch.leaves) {
      if (finalNames.has(leaf.name)) {
        continue;
      }
      let contributors = perName.get(leaf.name);
      if (contributors === undefined) {
        contributors = new Set<string>();
        perName.set(leaf.name, contributors);
      }
      contributors.add(batch.batchId);
    }
  }

  const insertions: BatchNameInsertion[] = [...perName.entries()]
    .map(([name, contributors]) => ({ name, contributingBatchIds: [...contributors].sort() }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return {
    derived: true,
    insertions,
    preservedFinalNames: [...finalNames].sort(),
    reason: "batch-exclusion-derived",
  };
}
