import { normalizeName } from "@ont/protocol";

import { Accumulator, accumulatorKeyForName } from "./accumulator.js";
import {
  type AnchoredDelta,
  type DaWindows,
  type InclusionRule,
  type NodeView,
  isCanonical,
  isLocallyIncluded
} from "./da-convergence-sim.js";
import { RootChain } from "./root-anchor.js";

/**
 * Production long-tail batch rail (signet-prototype Phase 2, C3 + C4).
 *
 * Pipeline: publishers' deltas are filtered by the data-availability rule (C4 / R1), then merged
 * into the real C1 accumulator and anchored via the C2 `RootChain`.
 *
 * **Contested names escalate to L1 (decided 2026-05-24).** The accumulator rail is *uncontested-only*:
 * if two or more distinct publishers claim the same name within the notice window, the name is NOT
 * resolved on the accumulator — it escalates to the existing L1 bonded auction (the proven path). A
 * name with a single in-window claimant finalizes on the accumulator; a claim that arrives after the
 * window closed is simply "already owned." This removes the off-chain-auction problem (R4) from the
 * rail entirely, and means commit-reveal name-hiding is not needed here: front-running a claim only
 * triggers an auction you would have to win by bidding, not a free steal.
 */

export const DEFAULT_NOTICE_WINDOW_BLOCKS = 6;

export interface EscalatedName {
  readonly name: string;
  /** The distinct deltas that contested this name (handed to the L1 auction path). */
  readonly contestingDeltaIds: readonly string[];
}

export interface BatchRailResult {
  /** Final confirmed accumulator root for this node's view. */
  readonly confirmedRoot: string;
  /** Number of roots anchored in the derived root chain (one per non-empty merged block). */
  readonly anchoredRoots: number;
  /** Normalized name -> owner value-hash for every uncontested name that finalized. */
  readonly ownerByName: ReadonlyMap<string, string>;
  /** Delta ids that contributed at least one finalized (uncontested) name. */
  readonly includedDeltaIds: readonly string[];
  /** Delta ids excluded by the data-availability rule (not available in time). */
  readonly daDroppedDeltaIds: readonly string[];
  /** Names that were contested and escalated to the L1 bonded auction (not on the accumulator). */
  readonly escalatedNames: readonly EscalatedName[];
  /** The confirmed accumulator, exposed so callers can produce membership / non-membership proofs. */
  readonly accumulator: Accumulator;
}

interface Claim {
  readonly name: string;
  readonly valueHash: string;
  readonly deltaId: string;
  readonly height: number;
  readonly txIndex: number;
  readonly txid: string;
}

/** DA-eligibility only (fail-closed availability), independent of finalization depth. */
function eligibleByDa(delta: AnchoredDelta, node: NodeView, windows: DaWindows, rule: InclusionRule): boolean {
  return rule === "proposed" ? isCanonical(delta, windows) : isLocallyIncluded(delta, node, windows);
}

function isEligible(
  delta: AnchoredDelta,
  node: NodeView,
  windows: DaWindows,
  rule: InclusionRule,
  finalizedThrough: number
): boolean {
  if (delta.anchorHeight > finalizedThrough) {
    return false;
  }
  return eligibleByDa(delta, node, windows, rule);
}

/** Run the batch rail for one node's view, returning the confirmed accumulator and derived root chain. */
export function runBatchRail(input: {
  readonly node: NodeView;
  readonly deltas: readonly AnchoredDelta[];
  readonly windows: DaWindows;
  readonly now: number;
  readonly rule: InclusionRule;
  readonly noticeWindowBlocks?: number;
}): BatchRailResult {
  const { node, deltas, windows, now, rule } = input;
  if (windows.confirmDepthK < windows.availabilityWindowW + windows.challengeWindowC) {
    throw new Error("confirmDepthK must be >= availabilityWindowW + challengeWindowC");
  }
  const noticeWindow = input.noticeWindowBlocks ?? DEFAULT_NOTICE_WINDOW_BLOCKS;
  const finalizedThrough = now - windows.confirmDepthK;

  const eligible = deltas.filter((delta) => isEligible(delta, node, windows, rule, finalizedThrough));
  const eligibleSet = new Set(eligible);
  const daDroppedDeltaIds = deltas.filter((delta) => !eligibleSet.has(delta)).map((delta) => delta.id);

  // Gather every claim, grouped by name.
  const claimsByName = new Map<string, Claim[]>();
  for (const delta of eligible) {
    for (const insertion of delta.insertions) {
      const name = normalizeName(insertion.name);
      const claim: Claim = {
        name,
        valueHash: insertion.valueHash,
        deltaId: delta.id,
        height: delta.anchorHeight,
        txIndex: delta.anchorTxIndex,
        txid: delta.anchorTxid
      };
      const existing = claimsByName.get(name);
      if (existing === undefined) {
        claimsByName.set(name, [claim]);
      } else {
        existing.push(claim);
      }
    }
  }

  // Uncontested -> finalize on the accumulator. Contested (>=2 distinct claimants within the notice
  // window) -> escalate to the L1 bonded auction.
  const finalized: Array<{ readonly name: string; readonly valueHash: string; readonly height: number; readonly deltaId: string }> = [];
  const escalatedNames: EscalatedName[] = [];
  for (const [name, claims] of claimsByName) {
    const ordered = [...claims].sort(
      (a, b) => a.height - b.height || a.txIndex - b.txIndex || a.txid.localeCompare(b.txid)
    );
    const earliest = ordered[0] as Claim;
    const inWindow = ordered.filter((claim) => claim.height <= earliest.height + noticeWindow);
    const distinctClaimants = new Set(inWindow.map((claim) => claim.deltaId));
    if (distinctClaimants.size >= 2) {
      escalatedNames.push({ name, contestingDeltaIds: [...distinctClaimants] });
    } else {
      finalized.push({ name, valueHash: earliest.valueHash, height: earliest.height, deltaId: earliest.deltaId });
      // Claims for this name that arrive after the window closed are "already owned" — silently dropped.
    }
  }

  // Build the accumulator + anchored root chain from the finalized (uncontested) names, in Bitcoin order.
  const accumulator = new Accumulator();
  const rootChain = new RootChain();
  const ownerByName = new Map<string, string>();
  const includedDeltaIds = new Set<string>();
  const heights = [...new Set(finalized.map((entry) => entry.height))].sort((a, b) => a - b);
  for (const height of heights) {
    const atHeight = finalized.filter((entry) => entry.height === height);
    const prevRoot = accumulator.root();
    for (const entry of atHeight) {
      accumulator.insert(accumulatorKeyForName(entry.name), entry.valueHash);
      ownerByName.set(entry.name, entry.valueHash);
      includedDeltaIds.add(entry.deltaId);
    }
    rootChain.apply({ prevRoot, newRoot: accumulator.root(), batchSize: atHeight.length });
  }

  return {
    confirmedRoot: accumulator.root(),
    anchoredRoots: rootChain.anchorCount(),
    ownerByName,
    includedDeltaIds: [...includedDeltaIds],
    daDroppedDeltaIds,
    escalatedNames,
    accumulator
  };
}

/**
 * A name's lifecycle relative to chain height `now`, per the ONT.md one-path model.
 *
 *   - `absent`      — no DA-eligible claim for this name.
 *   - `provisional` — exactly one in-window claimant so far and the notice window is still open
 *                     (`now < windowCloseHeight`): the claim is anchored and available, but a
 *                     competitor could still land and contest it. NOT yet ownable.
 *   - `contested`   — two or more distinct claimants landed within the notice window; the name
 *                     escalates to the L1 bonded auction (it never resolves on the accumulator).
 *   - `final`       — exactly one in-window claimant and the notice window has closed; ownable.
 */
export type NameLifecycle =
  | { readonly status: "absent"; readonly name: string }
  | {
      readonly status: "provisional";
      readonly name: string;
      readonly owner: string;
      readonly claimDeltaId: string;
      readonly claimHeight: number;
      readonly windowCloseHeight: number;
    }
  | {
      readonly status: "contested";
      readonly name: string;
      readonly contestingDeltaIds: readonly string[];
      readonly windowCloseHeight: number;
    }
  | {
      readonly status: "final";
      readonly name: string;
      readonly owner: string;
      readonly claimDeltaId: string;
      readonly claimHeight: number;
      readonly windowCloseHeight: number;
    };

/**
 * Classify a single name's lifecycle relative to chain height `now`.
 *
 * This is the capability `runBatchRail` cannot provide: `runBatchRail` only processes
 * finalized-deep deltas (`anchorHeight <= now - K`), so it can report a name as final or escalated
 * but never as *provisional* (anchored, available, notice window still open). The classifier keeps
 * the same fail-closed DA filter — a claim is never counted until its availability is
 * Bitcoin-witnessed — but drops the K-depth requirement, deciding provisional-vs-final from whether
 * the notice window has closed relative to `now`. Claims anchored in blocks above `now` are ignored
 * (not yet mined).
 *
 * Cross-consistency with `runBatchRail` (defaults, where `noticeWindow <= K`): any name it finalizes
 * classifies `final`; any name it escalates classifies `contested`.
 */
export function classifyName(input: {
  readonly name: string;
  readonly node: NodeView;
  readonly deltas: readonly AnchoredDelta[];
  readonly windows: DaWindows;
  readonly now: number;
  readonly rule: InclusionRule;
  readonly noticeWindowBlocks?: number;
}): NameLifecycle {
  const { name, node, deltas, windows, now, rule } = input;
  if (windows.confirmDepthK < windows.availabilityWindowW + windows.challengeWindowC) {
    throw new Error("confirmDepthK must be >= availabilityWindowW + challengeWindowC");
  }
  const noticeWindow = input.noticeWindowBlocks ?? DEFAULT_NOTICE_WINDOW_BLOCKS;
  const target = normalizeName(name);

  const claims: Claim[] = [];
  for (const delta of deltas) {
    if (delta.anchorHeight > now) {
      continue; // anchored in a block that has not been mined yet
    }
    if (!eligibleByDa(delta, node, windows, rule)) {
      continue; // DA fail-closed: not available, so not counted
    }
    for (const insertion of delta.insertions) {
      if (normalizeName(insertion.name) !== target) {
        continue;
      }
      claims.push({
        name: target,
        valueHash: insertion.valueHash,
        deltaId: delta.id,
        height: delta.anchorHeight,
        txIndex: delta.anchorTxIndex,
        txid: delta.anchorTxid
      });
    }
  }

  if (claims.length === 0) {
    return { status: "absent", name: target };
  }

  const ordered = [...claims].sort(
    (a, b) => a.height - b.height || a.txIndex - b.txIndex || a.txid.localeCompare(b.txid)
  );
  const earliest = ordered[0] as Claim;
  const windowCloseHeight = earliest.height + noticeWindow;
  const inWindow = ordered.filter((claim) => claim.height <= windowCloseHeight);
  const distinctClaimants = new Set(inWindow.map((claim) => claim.deltaId));

  if (distinctClaimants.size >= 2) {
    return { status: "contested", name: target, contestingDeltaIds: [...distinctClaimants], windowCloseHeight };
  }

  if (now < windowCloseHeight) {
    return {
      status: "provisional",
      name: target,
      owner: earliest.valueHash,
      claimDeltaId: earliest.deltaId,
      claimHeight: earliest.height,
      windowCloseHeight
    };
  }

  return {
    status: "final",
    name: target,
    owner: earliest.valueHash,
    claimDeltaId: earliest.deltaId,
    claimHeight: earliest.height,
    windowCloseHeight
  };
}

/** Classify every name claimed by any delta. Convenience wrapper over `classifyName`. */
export function classifyNames(input: {
  readonly node: NodeView;
  readonly deltas: readonly AnchoredDelta[];
  readonly windows: DaWindows;
  readonly now: number;
  readonly rule: InclusionRule;
  readonly noticeWindowBlocks?: number;
}): ReadonlyMap<string, NameLifecycle> {
  const names = new Set<string>();
  for (const delta of input.deltas) {
    for (const insertion of delta.insertions) {
      names.add(normalizeName(insertion.name));
    }
  }
  const out = new Map<string, NameLifecycle>();
  for (const name of names) {
    out.set(name, classifyName({ name, ...input }));
  }
  return out;
}

export interface BatchRailConvergenceReport {
  readonly converged: boolean;
  readonly distinctRoots: readonly string[];
  readonly perNode: ReadonlyMap<string, BatchRailResult>;
}

/** Run the rail for every honest node and report whether they converge on one confirmed root. */
export function batchRailConvergence(input: {
  readonly nodes: readonly NodeView[];
  readonly deltas: readonly AnchoredDelta[];
  readonly windows: DaWindows;
  readonly now: number;
  readonly rule: InclusionRule;
  readonly noticeWindowBlocks?: number;
}): BatchRailConvergenceReport {
  const perNode = new Map<string, BatchRailResult>();
  for (const node of input.nodes) {
    perNode.set(
      node.nodeId,
      runBatchRail({
        node,
        deltas: input.deltas,
        windows: input.windows,
        now: input.now,
        rule: input.rule,
        ...(input.noticeWindowBlocks === undefined ? {} : { noticeWindowBlocks: input.noticeWindowBlocks })
      })
    );
  }
  const distinctRoots = [...new Set([...perNode.values()].map((result) => result.confirmedRoot))];
  return { converged: distinctRoots.length === 1, distinctRoots, perNode };
}
