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
  return rule === "proposed" ? isCanonical(delta, windows) : isLocallyIncluded(delta, node, windows);
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
