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
 * This wires the pieces built earlier into one pipeline:
 *   - publishers' deltas are filtered by the **data-availability rule** (C4 / R1): the proposed
 *     rule keys on Bitcoin-witnessed facts (availability marker + fail-closed challenge), the naive
 *     rule on each node's local receipt time;
 *   - surviving deltas are merged **into the real C1 accumulator** in Bitcoin order, with same-name
 *     conflicts resolved by commit priority and cross-block uniqueness enforced (C3 / R2);
 *   - each block's derived root is anchored in the C2 `RootChain`.
 *
 * The result is a real accumulator root whose ownership is **provable** with C1 proofs. The tests
 * assert that honest nodes converge under the proposed rule (and fork under the naive one), that a
 * withholding publisher only harms itself, and that the resulting state verifies.
 */

export interface BatchRailResult {
  /** Final confirmed accumulator root for this node's view. */
  readonly confirmedRoot: string;
  /** Number of roots anchored in the derived root chain (one per non-empty merged block). */
  readonly anchoredRoots: number;
  /** Normalized name -> owner value-hash for every name that landed. */
  readonly ownerByName: ReadonlyMap<string, string>;
  /** Delta ids that contributed at least one winning insertion. */
  readonly includedDeltaIds: readonly string[];
  /** Delta ids excluded by the data-availability rule (not available in time). */
  readonly daDroppedDeltaIds: readonly string[];
  /** The confirmed accumulator, exposed so callers can produce membership / non-membership proofs. */
  readonly accumulator: Accumulator;
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
}): BatchRailResult {
  const { node, deltas, windows, now, rule } = input;
  if (windows.confirmDepthK < windows.availabilityWindowW + windows.challengeWindowC) {
    throw new Error("confirmDepthK must be >= availabilityWindowW + challengeWindowC");
  }
  const finalizedThrough = now - windows.confirmDepthK;

  const eligible = deltas.filter((delta) => isEligible(delta, node, windows, rule, finalizedThrough));
  const eligibleSet = new Set(eligible);
  const daDroppedDeltaIds = deltas.filter((delta) => !eligibleSet.has(delta)).map((delta) => delta.id);

  const heights = [...new Set(eligible.map((delta) => delta.anchorHeight))].sort((a, b) => a - b);
  const accumulator = new Accumulator();
  const rootChain = new RootChain(); // genesis = empty accumulator root
  const ownerByName = new Map<string, string>();
  const includedDeltaIds = new Set<string>();

  for (const height of heights) {
    const blockDeltas = eligible
      .filter((delta) => delta.anchorHeight === height)
      .sort((a, b) => a.anchorTxIndex - b.anchorTxIndex || a.anchorTxid.localeCompare(b.anchorTxid));

    // First delta (in commit-priority order) to claim a leaf wins; already-confirmed leaves are skipped.
    const winners = new Map<string, { readonly name: string; readonly valueHash: string; readonly deltaId: string }>();
    for (const delta of blockDeltas) {
      for (const insertion of delta.insertions) {
        const leaf = accumulatorKeyForName(insertion.name);
        if (accumulator.has(leaf) || winners.has(leaf)) {
          continue;
        }
        winners.set(leaf, { name: insertion.name, valueHash: insertion.valueHash, deltaId: delta.id });
      }
    }

    if (winners.size === 0) {
      continue;
    }

    const prevRoot = accumulator.root();
    for (const [leaf, winner] of winners) {
      accumulator.insert(leaf, winner.valueHash);
      ownerByName.set(normalizeName(winner.name), winner.valueHash);
      includedDeltaIds.add(winner.deltaId);
    }
    const newRoot = accumulator.root();
    rootChain.apply({ prevRoot, newRoot, batchSize: winners.size });
  }

  return {
    confirmedRoot: accumulator.root(),
    anchoredRoots: rootChain.anchorCount(),
    ownerByName,
    includedDeltaIds: [...includedDeltaIds],
    daDroppedDeltaIds,
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
}): BatchRailConvergenceReport {
  const perNode = new Map<string, BatchRailResult>();
  for (const node of input.nodes) {
    perNode.set(
      node.nodeId,
      runBatchRail({ node, deltas: input.deltas, windows: input.windows, now: input.now, rule: input.rule })
    );
  }
  const distinctRoots = [...new Set([...perNode.values()].map((result) => result.confirmedRoot))];
  return { converged: distinctRoots.length === 1, distinctRoots, perNode };
}
