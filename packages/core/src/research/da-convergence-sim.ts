import {
  type NameInsertion,
  type PublisherDelta,
  createEmptyTree,
  leafForName,
  mergeBlock,
  treeRoot
} from "./delta-merge-sim.js";

/**
 * R1 (data-availability agreement) prototype — convergence under withholding.
 *
 * `docs/design/ONT_DATA_AVAILABILITY_AGREEMENT.md` argues that honest nodes can agree on one
 * canonical root from Bitcoin alone, despite the impossibility of proving data non-availability,
 * by deciding inclusion from **Bitcoin-witnessed facts** (an on-chain availability marker by a
 * height deadline) plus a **fail-closed challenge window** (the bytes must surface to the network
 * by a later deadline) — never from any node's *local* receipt time.
 *
 * This module makes that falsifiable. It runs the same batches through two inclusion rules:
 *
 *   - `naive`    — "include if *I* received the data by the deadline" (uses per-node local time).
 *   - `proposed` — "include if the marker is on-chain by the deadline AND the bytes surfaced to
 *                   the network by the challenge deadline" (uses only shared, Bitcoin-timed facts).
 *
 * The tests show the naive rule **forks** (nodes with different local views compute different
 * roots) while the proposed rule **converges** (all honest nodes agree) — and that withholding,
 * mark-but-don't-serve, and withhold-then-reveal theft are all handled.
 */

/** A batch anchored on Bitcoin, with the on-chain and network facts the rule depends on. */
export interface AnchoredDelta {
  readonly id: string;
  readonly publisher: string;
  /** Bitcoin height of the batch anchor (objective — every node sees it). */
  readonly anchorHeight: number;
  /** Position within the anchor block, for commit-priority tie-breaks. */
  readonly anchorTxIndex: number;
  /** Anchor txid, the final deterministic tie-break. */
  readonly anchorTxid: string;
  /** Bitcoin height of the availability marker, or `null` if the publisher never posted one. */
  readonly markerHeight: number | null;
  /**
   * Height from which the honest 1-of-N archive set can serve the bytes, or `null` if no one can
   * ever serve them (true withholding / mark-but-don't-serve). This is the shared *network* fact
   * the challenge window resolves against — not any single node's gossip arrival.
   */
  readonly networkServableFromHeight: number | null;
  readonly insertions: readonly NameInsertion[];
}

/** One honest node's *local* view: when it personally received each batch's bytes over gossip. */
export interface NodeView {
  readonly nodeId: string;
  /** delta id -> local receipt height; absent means this node never received it locally. */
  readonly localDataReceiptHeight: ReadonlyMap<string, number>;
}

export interface DaWindows {
  /** Finalization lag: a height is canonical once the chain is this many blocks past it. */
  readonly confirmDepthK: number;
  /** The availability marker must be mined by `anchorHeight + availabilityWindowW`. */
  readonly availabilityWindowW: number;
  /** The bytes must surface to the network by `anchorHeight + availabilityWindowW + challengeWindowC`. */
  readonly challengeWindowC: number;
}

export type InclusionRule = "naive" | "proposed";

export function createDefaultDaWindows(): DaWindows {
  // K must be >= W + C so the whole inclusion decision is resolved before finalization.
  return { confirmDepthK: 6, availabilityWindowW: 2, challengeWindowC: 3 };
}

function validateWindows(windows: DaWindows): void {
  const { confirmDepthK, availabilityWindowW, challengeWindowC } = windows;
  if (!Number.isInteger(confirmDepthK) || confirmDepthK < 1) {
    throw new Error("confirmDepthK must be a positive integer");
  }
  if (!Number.isInteger(availabilityWindowW) || availabilityWindowW < 0) {
    throw new Error("availabilityWindowW must be a non-negative integer");
  }
  if (!Number.isInteger(challengeWindowC) || challengeWindowC < 0) {
    throw new Error("challengeWindowC must be a non-negative integer");
  }
  if (confirmDepthK < availabilityWindowW + challengeWindowC) {
    throw new Error("confirmDepthK must be >= availabilityWindowW + challengeWindowC");
  }
}

/**
 * The proposed rule. Depends only on Bitcoin-witnessed heights and the shared network-servable
 * fact — so its verdict is identical for every honest node. This independence from local time is
 * the whole point.
 */
export function isCanonical(delta: AnchoredDelta, windows: DaWindows): boolean {
  const markerDeadline = delta.anchorHeight + windows.availabilityWindowW;
  const markerInTime = delta.markerHeight !== null && delta.markerHeight <= markerDeadline;

  const serveDeadline = markerDeadline + windows.challengeWindowC;
  const servedInTime =
    delta.networkServableFromHeight !== null && delta.networkServableFromHeight <= serveDeadline;

  return markerInTime && servedInTime;
}

/** The naive rule: include if *this node* received the bytes by the marker deadline. Forks. */
export function isLocallyIncluded(delta: AnchoredDelta, node: NodeView, windows: DaWindows): boolean {
  const localReceipt = node.localDataReceiptHeight.get(delta.id);
  return localReceipt !== undefined && localReceipt <= delta.anchorHeight + windows.availabilityWindowW;
}

export interface ConfirmedState {
  readonly root: string;
  /** Ids of deltas that made it into the confirmed root, in processing order. */
  readonly includedDeltaIds: readonly string[];
  /** Final owner value-hash per claimed name (lets tests check who won a contested name). */
  readonly ownerByName: ReadonlyMap<string, string>;
}

function toPublisherDelta(delta: AnchoredDelta): PublisherDelta {
  return {
    publisher: delta.publisher,
    commitHeight: delta.anchorHeight,
    commitTxIndex: delta.anchorTxIndex,
    commitTxid: delta.anchorTxid,
    insertions: delta.insertions
  };
}

/**
 * Compute one node's view of the canonical confirmed root at chain height `now`.
 *
 * Only heights at or below `now - K` are finalized. Eligible deltas are filtered by the chosen
 * inclusion rule, then fed — in Bitcoin height order — through the commutative block merge. A
 * delta that fails the rule is dropped *before* the merge, so it never competes on commit priority
 * (this is what defeats withhold-then-reveal name theft).
 */
export function confirmedStateForNode(input: {
  readonly node: NodeView;
  readonly deltas: readonly AnchoredDelta[];
  readonly windows: DaWindows;
  readonly now: number;
  readonly rule: InclusionRule;
}): ConfirmedState {
  validateWindows(input.windows);
  const finalizedThrough = input.now - input.windows.confirmDepthK;

  const eligible = input.deltas.filter((delta) => {
    if (delta.anchorHeight > finalizedThrough) {
      return false;
    }
    return input.rule === "proposed"
      ? isCanonical(delta, input.windows)
      : isLocallyIncluded(delta, input.node, input.windows);
  });

  const heights = [...new Set(eligible.map((delta) => delta.anchorHeight))].sort((a, b) => a - b);

  let tree = createEmptyTree();
  const includedDeltaIds: string[] = [];
  const ownerByName = new Map<string, string>();

  for (const height of heights) {
    const blockDeltas = eligible
      .filter((delta) => delta.anchorHeight === height)
      .sort((a, b) => a.anchorTxIndex - b.anchorTxIndex || a.anchorTxid.localeCompare(b.anchorTxid));

    const { tree: nextTree, result } = mergeBlock(tree, blockDeltas.map(toPublisherDelta));
    tree = nextTree;

    for (const op of result.ops) {
      if (op.status === "applied") {
        const winningDelta = blockDeltas.find((delta) =>
          delta.publisher === op.publisher && delta.insertions.some((ins) => leafForName(ins.name) === op.leaf)
        );
        const insertion = winningDelta?.insertions.find((ins) => leafForName(ins.name) === op.leaf);
        if (insertion !== undefined) {
          ownerByName.set(op.name, insertion.valueHash);
        }
      }
    }
    for (const delta of blockDeltas) {
      if (result.ops.some((op) => op.publisher === delta.publisher && op.status === "applied")) {
        includedDeltaIds.push(delta.id);
      }
    }
  }

  return { root: treeRoot(tree), includedDeltaIds, ownerByName };
}

/**
 * Run the full honest node set under a rule and report whether they converged. The headline check:
 * `proposed` yields one root across all nodes; `naive` can yield several.
 */
export function convergenceReport(input: {
  readonly nodes: readonly NodeView[];
  readonly deltas: readonly AnchoredDelta[];
  readonly windows: DaWindows;
  readonly now: number;
  readonly rule: InclusionRule;
}): {
  readonly converged: boolean;
  readonly distinctRoots: readonly string[];
  readonly perNode: ReadonlyMap<string, ConfirmedState>;
} {
  const perNode = new Map<string, ConfirmedState>();
  for (const node of input.nodes) {
    perNode.set(
      node.nodeId,
      confirmedStateForNode({
        node,
        deltas: input.deltas,
        windows: input.windows,
        now: input.now,
        rule: input.rule
      })
    );
  }
  const distinctRoots = [...new Set([...perNode.values()].map((state) => state.root))];
  return { converged: distinctRoots.length === 1, distinctRoots, perNode };
}
