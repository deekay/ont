import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  normalizeName,
  sha256Bytes,
  utf8ToBytes
} from "@ont/protocol";

/**
 * R2 (leaderless chaining) prototype — per-block delta-merge.
 *
 * The candidate fix in `docs/OPEN_QUESTIONS.md (delta-merge, ex-ONT_HARD_PROBLEMS)` claims that publishers can
 * advance a shared name accumulator without any sequencer or inter-publisher coordination,
 * because **sparse-Merkle-tree insertions into distinct leaves are commutative**: the post
 * root depends only on the *set* of `(leaf -> value)` pairs, not the order they are applied.
 *
 * This module is the runnable form of that claim. It implements a binary sparse Merkle tree
 * keyed by `H(name)`, an incremental (order-sensitive-looking) insert, and a block-merge that
 * collects every publisher's delta, resolves same-name conflicts by Bitcoin commit priority,
 * and derives one deterministic next root. The tests assert the properties the design rests on:
 * commutativity, miner-reordering immunity, conflict determinism, and the data-availability
 * benefit (a withheld delta is excluded, not fatal).
 */

/** Full key width. A name maps to a fixed 256-bit leaf `H(name)`. */
export const SMT_DEPTH = 256;

const EMPTY_NODE = new Uint8Array(32);
const LEAF_DOMAIN = Uint8Array.from([0x00]);
const INTERNAL_DOMAIN = Uint8Array.from([0x01]);

function hashLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(LEAF_DOMAIN, key, value));
}

function hashInternal(left: Uint8Array, right: Uint8Array): Uint8Array {
  return sha256Bytes(concatBytes(INTERNAL_DOMAIN, left, right));
}

/** Default (all-empty) subtree hash for each level, index 0 = root, index DEPTH = empty leaf. */
function buildDefaultHashes(depth: number): readonly Uint8Array[] {
  const defaults: Uint8Array[] = new Array(depth + 1);
  defaults[depth] = EMPTY_NODE;
  for (let level = depth - 1; level >= 0; level -= 1) {
    const child = defaults[level + 1] ?? EMPTY_NODE;
    defaults[level] = hashInternal(child, child);
  }
  return defaults;
}

function getBit(key: Uint8Array, index: number): 0 | 1 {
  const byte = key[index >> 3] ?? 0;
  return ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
}

/**
 * An immutable sparse Merkle tree. `nodes` stores only non-default nodes keyed by
 * `"<level>:<path-bits>"`; everything else is implied by `defaults[level]`. `leaves`
 * keeps the raw value hex so membership proofs can carry it.
 */
export interface SparseMerkleTree {
  readonly depth: number;
  readonly defaults: readonly Uint8Array[];
  readonly nodes: ReadonlyMap<string, Uint8Array>;
  readonly leaves: ReadonlyMap<string, string>;
}

export function createEmptyTree(depth: number = SMT_DEPTH): SparseMerkleTree {
  return {
    depth,
    defaults: buildDefaultHashes(depth),
    nodes: new Map(),
    leaves: new Map()
  };
}

function nodeAt(tree: SparseMerkleTree, level: number, path: string): Uint8Array {
  return tree.nodes.get(`${level}:${path}`) ?? tree.defaults[level] ?? EMPTY_NODE;
}

export function treeRoot(tree: SparseMerkleTree): string {
  return bytesToHex(nodeAt(tree, 0, ""));
}

/** `H(name)` — the fixed leaf a name maps to. */
export function leafForName(name: string): string {
  return bytesToHex(sha256Bytes(utf8ToBytes(normalizeName(name))));
}

/** Hash an arbitrary record (e.g. an owner record) into a 32-byte value commitment. */
export function valueHashForRecord(record: string): string {
  return bytesToHex(sha256Bytes(utf8ToBytes(record)));
}

/**
 * Insert (or overwrite) a single `key -> value` leaf, returning a new tree. Implemented as a
 * realistic incremental root update so that order-independence is a property of the algorithm,
 * not a tautology of hashing a set.
 */
export function insert(tree: SparseMerkleTree, keyHex: string, valueHex: string): SparseMerkleTree {
  const key = hexToBytes(keyHex);
  const value = hexToBytes(valueHex);
  const path: ("0" | "1")[] = [];
  for (let i = 0; i < tree.depth; i += 1) {
    path.push(getBit(key, i) === 0 ? "0" : "1");
  }

  const nodes = new Map(tree.nodes);
  const fullPath = path.join("");
  let current = hashLeaf(key, value);
  nodes.set(`${tree.depth}:${fullPath}`, current);

  for (let level = tree.depth - 1; level >= 0; level -= 1) {
    const prefix = path.slice(0, level).join("");
    const goesLeft = path[level] === "0";
    const siblingPath = prefix + (goesLeft ? "1" : "0");
    const siblingKey = `${level + 1}:${siblingPath}`;
    const sibling = nodes.get(siblingKey) ?? tree.defaults[level + 1] ?? EMPTY_NODE;
    current = goesLeft ? hashInternal(current, sibling) : hashInternal(sibling, current);
    nodes.set(`${level}:${prefix}`, current);
  }

  const leaves = new Map(tree.leaves);
  leaves.set(keyHex, valueHex);

  return { depth: tree.depth, defaults: tree.defaults, nodes, leaves };
}

export interface MerkleProof {
  readonly key: string;
  /** Only non-default siblings, tagged with the child level they sit at. */
  readonly siblings: readonly { readonly level: number; readonly hash: string }[];
  /** Hex value for a membership proof, or `null` for a non-membership proof. */
  readonly value: string | null;
}

export function proveInclusion(tree: SparseMerkleTree, keyHex: string): MerkleProof {
  const key = hexToBytes(keyHex);
  const path: ("0" | "1")[] = [];
  for (let i = 0; i < tree.depth; i += 1) {
    path.push(getBit(key, i) === 0 ? "0" : "1");
  }

  const siblings: { readonly level: number; readonly hash: string }[] = [];
  for (let level = tree.depth - 1; level >= 0; level -= 1) {
    const prefix = path.slice(0, level).join("");
    const goesLeft = path[level] === "0";
    const siblingPath = prefix + (goesLeft ? "1" : "0");
    const stored = tree.nodes.get(`${level + 1}:${siblingPath}`);
    if (stored !== undefined) {
      siblings.push({ level: level + 1, hash: bytesToHex(stored) });
    }
  }

  return {
    key: keyHex,
    siblings,
    value: tree.leaves.get(keyHex) ?? null
  };
}

/** Wire-size of a compact proof: only the non-default siblings travel. */
export function compactProofSize(proof: MerkleProof): number {
  return proof.siblings.length;
}

export function verifyProof(rootHex: string, proof: MerkleProof, depth: number = SMT_DEPTH): boolean {
  const defaults = buildDefaultHashes(depth);
  const key = hexToBytes(proof.key);
  const siblingByLevel = new Map<number, Uint8Array>();
  for (const sibling of proof.siblings) {
    siblingByLevel.set(sibling.level, hexToBytes(sibling.hash));
  }

  let digest = proof.value === null ? EMPTY_NODE : hashLeaf(key, hexToBytes(proof.value));
  for (let childLevel = depth; childLevel >= 1; childLevel -= 1) {
    const parentLevel = childLevel - 1;
    const sibling = siblingByLevel.get(childLevel) ?? defaults[childLevel] ?? EMPTY_NODE;
    digest = getBit(key, parentLevel) === 0
      ? hashInternal(digest, sibling)
      : hashInternal(sibling, digest);
  }

  return bytesToHex(digest) === rootHex;
}

export interface NameInsertion {
  readonly name: string;
  /** Hex hash of the value committed for the name (e.g. the owner record). */
  readonly valueHash: string;
}

/**
 * One publisher's contribution to a block: a set of insertions, each implicitly proven against
 * the last confirmed root. The commit coordinates are the Bitcoin `(height, txIndex)` of the
 * publisher's commit, with the txid as a deterministic tiebreak.
 */
export interface PublisherDelta {
  readonly publisher: string;
  readonly commitHeight: number;
  readonly commitTxIndex: number;
  readonly commitTxid: string;
  readonly insertions: readonly NameInsertion[];
}

export type MergeOpStatus = "applied" | "dropped_conflict" | "dropped_existing";

export interface MergeOpResult {
  readonly name: string;
  readonly leaf: string;
  readonly publisher: string;
  readonly status: MergeOpStatus;
  /** For a dropped conflict, which publisher won the leaf. */
  readonly winningPublisher?: string;
}

export interface BlockMergeResult {
  readonly priorRoot: string;
  readonly mergedRoot: string;
  readonly ops: readonly MergeOpResult[];
  readonly appliedCount: number;
  readonly droppedCount: number;
  /** Verification cost proxy: total insertions a verifier must check — O(insertions in block). */
  readonly insertionsConsidered: number;
}

interface PendingClaim {
  readonly name: string;
  readonly leaf: string;
  readonly valueHash: string;
  readonly publisher: string;
  readonly commitHeight: number;
  readonly commitTxIndex: number;
  readonly commitTxid: string;
}

/** Earlier commit wins: ascending `(height, txIndex, txid)`. */
function commitPriority(a: PendingClaim, b: PendingClaim): number {
  if (a.commitHeight !== b.commitHeight) {
    return a.commitHeight - b.commitHeight;
  }
  if (a.commitTxIndex !== b.commitTxIndex) {
    return a.commitTxIndex - b.commitTxIndex;
  }
  return a.commitTxid.localeCompare(b.commitTxid);
}

/**
 * Merge every delta anchored in a block into one derived next root.
 *
 * Publishers never see or build on each other; each insertion is proven against `priorTree`
 * (the last confirmed root). Conflicts on the same name resolve by commit priority; a loser's
 * other insertions still land. The result is independent of the order of `deltas` and of the
 * order of insertions within them — that independence is the whole point of R2's fix.
 */
export function mergeBlock(
  priorTree: SparseMerkleTree,
  deltas: readonly PublisherDelta[]
): { readonly tree: SparseMerkleTree; readonly result: BlockMergeResult } {
  const priorRoot = treeRoot(priorTree);
  const claimsByLeaf = new Map<string, PendingClaim[]>();
  let insertionsConsidered = 0;

  for (const delta of deltas) {
    for (const insertion of delta.insertions) {
      insertionsConsidered += 1;
      const leaf = leafForName(insertion.name);
      const claim: PendingClaim = {
        name: normalizeName(insertion.name),
        leaf,
        valueHash: insertion.valueHash,
        publisher: delta.publisher,
        commitHeight: delta.commitHeight,
        commitTxIndex: delta.commitTxIndex,
        commitTxid: delta.commitTxid
      };
      const existing = claimsByLeaf.get(leaf);
      if (existing === undefined) {
        claimsByLeaf.set(leaf, [claim]);
      } else {
        existing.push(claim);
      }
    }
  }

  const ops: MergeOpResult[] = [];
  const winners: PendingClaim[] = [];

  for (const [leaf, claims] of claimsByLeaf) {
    if (priorTree.leaves.has(leaf)) {
      for (const claim of claims) {
        ops.push({ name: claim.name, leaf, publisher: claim.publisher, status: "dropped_existing" });
      }
      continue;
    }

    const ordered = [...claims].sort(commitPriority);
    const winner = ordered[0];
    if (winner === undefined) {
      continue;
    }
    winners.push(winner);
    for (const claim of ordered) {
      if (claim === winner) {
        ops.push({ name: claim.name, leaf, publisher: claim.publisher, status: "applied" });
      } else {
        ops.push({
          name: claim.name,
          leaf,
          publisher: claim.publisher,
          status: "dropped_conflict",
          winningPublisher: winner.publisher
        });
      }
    }
  }

  // Apply winners in a deterministic order. Commutativity (proved in the tests) means any order
  // yields the same root; we sort only so the derived checkpoint is reproducible.
  winners.sort(commitPriority);
  let tree = priorTree;
  for (const winner of winners) {
    tree = insert(tree, winner.leaf, winner.valueHash);
  }

  const appliedCount = ops.filter((op) => op.status === "applied").length;
  return {
    tree,
    result: {
      priorRoot,
      mergedRoot: treeRoot(tree),
      ops,
      appliedCount,
      droppedCount: ops.length - appliedCount,
      insertionsConsidered
    }
  };
}

/**
 * Permissionless checkpoint verification: recompute the merge from the prior root and the block's
 * deltas, and accept the claimed next root only if it matches. A wrong checkpoint is rejected —
 * there is no trusted leader, only recomputation.
 */
export function verifyCheckpoint(
  priorTree: SparseMerkleTree,
  deltas: readonly PublisherDelta[],
  claimedRootHex: string
): boolean {
  return mergeBlock(priorTree, deltas).result.mergedRoot === claimedRootHex;
}
