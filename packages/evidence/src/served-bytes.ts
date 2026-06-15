// D-SB — served-bytes (data-availability) witness construction (B3, FREE; conforms
// to served-evidence-interface (#51)). Produces the `ServedEvidence` object the
// kernel's `da-verdict` (includable / holdsPriority) consumes: the batch's bytes
// reconstruct to the anchor's committed root under `batchSize`, bound to one anchor,
// with a `firstServableHeight` derived from confirmed-chain facts. The kernel
// consumes it as DATA; the binding VERIFIER (verifyAccumulatorMembership) is the
// shared @ont/protocol primitive. Non-deciding — it never calls or overrides the
// DA verdict.
//
// RECONSTRUCTION MODEL (this slice, well-grounded): per STATUS.md's batched path
// and #53 (anchoredRoot = the accumulator newRoot), the served bytes are the batch
// leaves, each carrying a membership proof against `anchoredRoot`. "bytes → root
// under batchSize" = every served leaf is a member of `anchoredRoot` AND the count
// equals `batchSize`. Bound to the exact anchor (anchorHeight / anchoredRoot /
// batchSize); a different anchor/root/size does not count (D8).
//
// OPEN DESIGN QUESTION (firstServableHeight provenance, #51 (iii)): the height must
// be *independently verifiable from the witness + confirmed-chain facts*, never
// producer-attested (no endpoint identity, receipt time, wall clock, or local-fetch
// success). The concrete §6c availability proof that pins it on-chain is the hard
// half the DA docs leave open. THIS slice binds the reconstruction + deadline
// composition and treats `firstServableHeight` as a structurally-validated input;
// whether D-SB carries the §6c availability proof (or that splits into a follow-on)
// is flagged for review — see the dispatch.
import { type AccumulatorMembershipProof } from "@ont/protocol";

import type { ServedEvidence } from "@ont/consensus";

/** A served batch leaf: its membership proof against the batch's committed root. */
export interface ServedLeaf {
  readonly proof: AccumulatorMembershipProof;
}

export interface ServedBatch {
  /** The anchor's mined height — binds the witness to one anchor (D2). */
  readonly anchorHeight: number;
  /** The committed accumulator root the anchor commits to (RootAnchor newRoot). */
  readonly anchoredRoot: string;
  /** The served batch leaves, each a member of `anchoredRoot`; count = batchSize. */
  readonly leaves: readonly ServedLeaf[];
  /**
   * Height by which the served bytes were demonstrably available, derived from
   * confirmed-chain facts (#51 (iii)) — never producer-attested. (Provenance
   * format is the open design question; see the module header.)
   */
  readonly firstServableHeight: number;
}

/**
 * Build the served-bytes witness for a batch. Reconstructs bytes → `anchoredRoot`
 * under `batchSize` (every leaf a member; count = batchSize) and emits the bound
 * `ServedEvidence`. Throws on misuse: a leaf that is not a member of
 * `anchoredRoot`, an empty batch, or a non-safe-integer height.
 */
export function buildServedEvidence(_batch: ServedBatch): ServedEvidence {
  throw new Error("@ont/evidence.buildServedEvidence: not implemented (B3 D-SB)");
}
