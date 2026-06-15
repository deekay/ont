// D-AM — accumulator membership-proof construction (B3, FREE; conforms to the
// ratified accumulator membership rule). The VERIFIER lives in @ont/protocol
// (verifyAccumulatorMembership) and is shared with the kernel; B3 owns the
// BUILDER — producing a proof that folds to the committed root — so an offline
// verifier and the live indexer can never disagree about who owns a name.
//
// Non-deciding: this constructs witnesses only. It never decides ownership; the
// kernel re-checks every proof it is handed (E-ND1).
//
// Status: STUB — tests-first (B3_EVIDENCE_HARDENING.md §9). The conformance
// battery in membership.test.ts is RED until these are implemented.
import type { AccumulatorMembershipProof } from "@ont/protocol";

export interface BuiltMembershipProof {
  /** The accumulator root the proof folds to. */
  readonly rootHex: string;
  /** The membership (value set) / non-membership (value null) proof. */
  readonly proof: AccumulatorMembershipProof;
}

/**
 * Build a MEMBERSHIP proof for `targetKeyHex` over the committed `leaves`
 * (keyHex -> valueHex). The returned proof must verify against the returned
 * root via @ont/protocol `verifyAccumulatorMembership`.
 */
export function buildMembershipProof(
  _leaves: ReadonlyMap<string, string>,
  _targetKeyHex: string,
): BuiltMembershipProof {
  throw new Error("@ont/evidence.buildMembershipProof: not implemented (B3 D-AM)");
}

/**
 * Build a NON-MEMBERSHIP proof for an absent `targetKeyHex` over `leaves`
 * (proof value === null). It proves the key folds to the empty subtree under
 * the committed root.
 */
export function buildNonMembershipProof(
  _leaves: ReadonlyMap<string, string>,
  _targetKeyHex: string,
): BuiltMembershipProof {
  throw new Error("@ont/evidence.buildNonMembershipProof: not implemented (B3 D-AM)");
}
