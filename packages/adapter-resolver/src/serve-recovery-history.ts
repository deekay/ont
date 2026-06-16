import type { SignedRecoveryDescriptor } from "@ont/protocol";
import type { OwnershipInterval } from "./validate-submission.js";

// B4-RESOLVE-READ-RECOVERY (B4_ADAPTERS_PLAN §12.2) — the resolver's recovery-history read projection. The
// EXACT MIRROR of serve-value-history.ts (B4-RESOLVE-READ) over recovery descriptors. The GET face is a
// chain-derived CONVENIENCE, NOT ownership authority. Recompute-don't-trust serving: a recovery-descriptor
// history is served ONLY if the whole chain independently re-verifies against the indexed ownership interval;
// any break (forged descriptor, broken predecessor, sequence break, wrong owner/ref/name) rejects the WHOLE
// chain (fail-closed reject-whole-chain, not verified-prefix). Descriptor-field validity (recoveryAddress,
// signingProfile, challengeWindowBlocks) is owned by verifyRecoveryDescriptor's signed digest — the projection
// adds no extra field policy. The HTTP wiring (the /name/{name}/recovery/history route) stays thin plumbing;
// live-network smoke is separate. No consensus law; decides nothing about recovery authority.

export type ServedRecoveryHistoryRejectReason =
  | "ownership-unknown" // currentOwnership is null — nothing to bind against
  | "empty-history" // descriptors is empty — no head / no history to serve
  | "invalid-signature" // some descriptor fails verifyRecoveryDescriptor
  | "name-mismatch" // some descriptor.name !== normalizeName(requested name)
  | "owner-mismatch" // some descriptor.ownerPubkey !== currentOwnership.currentOwnerPubkey (EVERY descriptor)
  | "ownership-ref-mismatch" // some descriptor.ownershipRef !== currentOwnership.ownershipRef
  | "sequence-broken" // descriptors are not the contiguous run 1..N in order
  | "predecessor-mismatch"; // some descriptor.previousDescriptorHash does not chain to its predecessor

export interface ProjectServedRecoveryHistoryInput {
  readonly name: string;
  readonly currentOwnership: OwnershipInterval | null;
  readonly descriptors: readonly SignedRecoveryDescriptor[];
}

export type ServedRecoveryHistoryResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly ownershipRef: string;
      readonly descriptors: readonly SignedRecoveryDescriptor[];
      readonly head: SignedRecoveryDescriptor; // the newest descriptor (descriptors[N-1])
      readonly provenance: "resolver-indexed-mirror"; // chain-derived convenience store
      readonly authority: "not-ownership-authority"; // the read is NEVER consensus / ownership authority
    }
  | { readonly ok: false; readonly reason: ServedRecoveryHistoryRejectReason };

/**
 * RED stub (B4-RESOLVE-READ-RECOVERY): rejects every projection until the read firewall lands. Green contract
 * (mirror of projectServedValueHistory):
 *   pre  currentOwnership !== null (object) — else "ownership-unknown".
 *   pre  descriptors is a non-empty array — else "empty-history".
 *   (the requested name is normalized ONCE up front and reused for every descriptor comparison.)
 *   for each descriptor at index i (0-based), in order:
 *     1. signature   verifyRecoveryDescriptor(descriptor) — else "invalid-signature".
 *     2. name        descriptor.name === normalizedName — else "name-mismatch".
 *     3. owner       descriptor.ownerPubkey === currentOwnership.currentOwnerPubkey — else "owner-mismatch"
 *                    (checked for EVERY descriptor, not just the head).
 *     4. ref         descriptor.ownershipRef === currentOwnership.ownershipRef — else "ownership-ref-mismatch".
 *     5. sequence    descriptor.sequence === i + 1 — else "sequence-broken" (contiguous run 1..N in order).
 *     6. predecessor descriptor.previousDescriptorHash ===
 *                    (i === 0 ? null : computeRecoveryDescriptorHash(descriptors[i-1])) — else "predecessor-mismatch".
 *   accept { ok:true, name: normalizedName, ownershipRef, descriptors (served as-is), head: descriptors[N-1],
 *           provenance: "resolver-indexed-mirror", authority: "not-ownership-authority" }.
 * Reject-whole-chain (fail-closed): any single break rejects the entire history. Total; never throws (→ reject).
 */
export function projectServedRecoveryHistory(input: ProjectServedRecoveryHistoryInput): ServedRecoveryHistoryResult {
  void input;
  return { ok: false, reason: "invalid-signature" };
}
