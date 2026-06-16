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

/** Stable, sortable key for an owner identity (kind + its hex), distinguishing distinct owners. */
const ownerSortKey = (o: DcvOwnerIdentity): string =>
  o.kind === "owner-key" ? `k:${o.ownerKeyHex}` : `c:${o.commitmentHex}`;

/**
 * The contending owners for one contested leaf, derived from the validated INPUT leaves (D-CV provenance
 * exposes only `contributingBatchIds`, not owners). Restricted to that key's includable-priority members
 * (#69), deduped to DISTINCT owner identities, canonically sorted. No winner — the L1 auction selects.
 */
function contendingOwnersFor(
  leaves: DcvDerivationInput["leaves"],
  leafKeyHex: string,
): readonly DcvOwnerIdentity[] {
  const distinct = new Map<string, DcvOwnerIdentity>();
  for (const lw of leaves) {
    const p = lw.projection;
    if (p.leafKeyHex !== leafKeyHex) continue;
    if (p.daVerdict.kind !== "includable" || !p.daVerdict.holdsPriority) continue; // exclude DA-excluded / non-priority
    distinct.set(ownerSortKey(p.owner), p.owner);
  }
  return [...distinct.values()].sort((a, b) => {
    const ka = ownerSortKey(a);
    const kb = ownerSortKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * Derive the canonical root for a presented delta set and route its distinct-owner contests to L1.
 * Total + fail-closed: never throws; a `derived:false` D-CV verdict (malformed / stale base / insert-only
 * violation / projection contradiction / batch-local duplicate / no-op) surfaces its `dcv-*` reason in
 * both the `derive` trace step and the verdict. On success, partitions the provenance into inserted-owner
 * leaves + the contested→L1 list (with `contendingOwners` derived from the validated input leaves).
 */
export function enforceContestedBatch(input: DcvDerivationInput): ContestedBatchResult {
  let v;
  try {
    v = deriveCanonicalRoot(input);
  } catch {
    return { trace: [{ stage: "derive", ok: false, reason: "cnt-derive-threw" }], verdict: { accepted: false, reason: "cnt-derive-threw" } };
  }
  if (!v.derived || v.newRoot === null) {
    return { trace: [{ stage: "derive", ok: false, reason: v.reason }], verdict: { accepted: false, reason: v.reason } };
  }

  const inserted: InsertedLeaf[] = [];
  const contestedToL1: ContestedLeafRouting[] = [];
  for (const leaf of v.leaves) {
    if (leaf.disposition === "inserted" && leaf.ownerValueHex !== null) {
      inserted.push({ leafKeyHex: leaf.leafKeyHex, name: leaf.name, ownerValueHex: leaf.ownerValueHex });
    } else if (leaf.disposition === "contested-no-owner") {
      // Only contests the PRESENTED set contains are routed — never infer "no competitor" from absence.
      contestedToL1.push({
        leafKeyHex: leaf.leafKeyHex,
        name: leaf.name,
        contendingOwners: contendingOwnersFor(input.leaves, leaf.leafKeyHex),
      });
    }
    // skipped-excluded → no effect; rejected-batch-local cannot reach a derived verdict.
  }

  return {
    trace: [{ stage: "derive", ok: true, reason: v.reason }],
    verdict: { accepted: true, kind: "contested-batch-derived", canonicalRoot: v.newRoot, inserted, contestedToL1 },
  };
}
