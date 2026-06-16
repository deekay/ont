import {
  deriveCanonicalRoot,
  type DcvDerivationInput,
  type DcvOwnerIdentity,
} from "@ont/consensus";

// I-CONTESTED — the contested distinct-owner → L1 orchestrator (B3_INTEGRATION_PLAN §11). Runs the
// audited deriveCanonicalRoot (D-CV) over a PRESENTED, firewall-minted delta set and emits an evidence
// trace + a contested-routing result: the canonical SMT root, the inserted-owner provenance, and the
// contested→L1 list. D-CV owns the canonical derivation (same-owner coalesce, distinct-owner collisions →
// contested-no-owner with NO owner in the root, winner-leakage guard, deterministic ordering); the
// wrapper only PARTITIONS the provenance + derives the contending owners for the L1 auction handoff.
//
// B3/B4 boundary (CL): B3 routes only contests the PRESENTED set contains — it never infers "no
// competitor exists" from absence; cross-anchor collection within the #69 notice window is the B4 indexer.
// No winner is selected here (contested-no-owner = no owner in the SMT; #37 rejects height/txid priority).

export interface ContestedLeafRouting {
  readonly leafKeyHex: string;
  readonly name: string;
  /** Distinct includable-priority owner identities for the contested leaf, canonically sorted. No winner. */
  readonly contendingOwners: readonly DcvOwnerIdentity[];
}

export interface InsertedLeaf {
  readonly leafKeyHex: string;
  readonly name: string;
  readonly ownerValueHex: string;
}

export type ContestedBatchVerdict =
  | {
      readonly accepted: true;
      readonly kind: "contested-batch-derived";
      /** newRoot = base ∪ {inserted owner leaves}; may equal prevRoot for a contest-only delta (NOT a no-op). */
      readonly canonicalRoot: string;
      readonly inserted: readonly InsertedLeaf[];
      readonly contestedToL1: readonly ContestedLeafRouting[];
    }
  | { readonly accepted: false; readonly reason: string };

export interface ContestedBatchTraceStep {
  readonly stage: "derive";
  readonly ok: boolean;
  readonly reason?: string;
}

export interface ContestedBatchResult {
  readonly trace: readonly ContestedBatchTraceStep[];
  readonly verdict: ContestedBatchVerdict;
}

/**
 * Derive the canonical root for a presented delta set and route its distinct-owner contests to L1.
 * Total + fail-closed: never throws; a `derived:false` D-CV verdict (malformed / stale base / insert-only
 * violation / projection contradiction / batch-local duplicate / no-op) surfaces its `dcv-*` reason.
 *
 * STUB (I-CONTESTED, tests-first): returns a fixed reject so the `cnt.*` red battery fails for the right
 * reason until the orchestrator is implemented.
 */
export function enforceContestedBatch(_input: DcvDerivationInput): ContestedBatchResult {
  void deriveCanonicalRoot;
  return { trace: [], verdict: { accepted: false, reason: "cnt-stub-not-implemented" } };
}
