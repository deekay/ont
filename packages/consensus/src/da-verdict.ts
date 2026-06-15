// B2 DA-verdict predicate — the opaque data-availability evidence interface.
//
// A pure deterministic predicate (D1/D2) that decides a batch's data-
// availability verdict from the anchor's witnessed facts plus a served-bytes
// witness, and NOTHING else: no clock, no I/O, no other on-chain event, no
// publisher self-attestation, no marker height (D2/D11). It implements
// da-windows (#49) S2/S3/S4 over the ratified window algebra:
//   - includable(anchor, evidence, params): bytes demonstrably served by the
//     challenge deadline h+W+C — the §6c fail-closed inclusion verdict (S3).
//   - holdsPriority(anchor, evidence, params): bytes served by the availability
//     deadline h+W — the §6d contested-priority verdict (S3).
// Eligibility depth (eligibleAt := H >= h+K, S2) is the separate confirmation
// gate exposed by ./params (confirmedRootEligible); the engine composes the two.
//
// EVIDENCE IS A WITNESS, NOT A CALLBACK (S4 / CL preflight item 4). The kernel
// consumes a verified served-bytes witness bound to one anchor; producing and
// cryptographically verifying that witness (bytes -> anchored root under
// batchSize) is the B3 deliverable (D8). B2 enforces the parts a witness alone
// settles: it is bound to THIS anchor's commitment (D2/D8) and meets the
// deadline (S2, inclusive). Evidence-gathering COMPLETENESS — "can anyone serve
// the bytes?" quantifies over an open server set — is also B3's responsibility
// (D4 attack flag); a pure predicate sees only the evidence presented to it.
//
// FAIL CLOSED (D4): absent, unbound, or late evidence yields NOT includable /
// NOT priority — never a trusted or provisional include.
//
// OUT OF SCOPE (deliberately not modeled): partial service — whether serving a
// strict subset of a batch's leaves makes the batch (or only those leaves)
// eligible has no ratified spec text (D4 attack flag: the legacy indexer merged
// per-leaf, the sim excluded per-batch). This interface models whole-batch
// service via a single first-servable height; per-leaf granularity awaits a
// named spec PR and is not decided here.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md D1-D8 / D14; da-windows (#49) S2/S3/S4
// (docs/spec/ONT_DATA_AVAILABILITY_AGREEMENT.md §6c/§6d/§6e).

import { availabilityDeadlineHeight, challengeDeadlineHeight, type DaWindowParams } from "./params.js";

/**
 * The anchor's witnessed facts the DA verdict may consume (D2): the mined block
 * height `h`, the anchored root, and the batchSize — exactly the normative
 * RootAnchor commitment, and nothing else (no broadcast time, first-seen height,
 * or publisher assertion may enter; D3).
 */
export interface AnchorFacts {
  /** `h` — the anchor transaction's mined block height; the only clock (D3). */
  readonly minedHeight: number;
  /** The root the anchor commits to. */
  readonly anchoredRoot: string;
  /** The leaf count the root commits to; part of the commitment (D8). */
  readonly batchSize: number;
}

/**
 * A served-bytes witness bound to one anchor (CL preflight item 4 / S4). It
 * attests that bytes verifying against the anchor's commitment (`anchoredRoot`
 * under `batchSize`) were first demonstrably servable at `firstServableHeight`.
 * The cryptographic byte->root verification that PRODUCES this witness is the B3
 * deliverable (D8); B2 consumes it as data, never as a live callback.
 */
export interface ServedEvidence {
  /** The mined height of the anchor this evidence witnesses (binding, D2). */
  readonly anchorHeight: number;
  /** The root the served bytes verify against (binding, D8). */
  readonly anchoredRoot: string;
  /** The batchSize the served bytes verify against (binding, D8). */
  readonly batchSize: number;
  /**
   * The height at which bytes verifying against (`anchoredRoot`, `batchSize`)
   * were first demonstrably servable — the single first-servable height of the
   * whole batch (CL preflight item 4). B3 establishes it across the open server
   * set; B2 reads it.
   */
  readonly firstServableHeight: number;
}

/**
 * Whether `evidence` is a witness for THIS anchor (D2/D8 binding): it must
 * witness the same commitment — same mined height, same anchored root, same
 * batchSize. Evidence for a different anchor, a different root (D8: bytes for a
 * root never anchored are refused), or a different batchSize does not count. The
 * byte source/transport identity is not part of the binding and never affects
 * the verdict (D8).
 */
export function evidenceBindsToAnchor(anchor: AnchorFacts, evidence: ServedEvidence): boolean {
  return (
    evidence.anchorHeight === anchor.minedHeight &&
    evidence.anchoredRoot === anchor.anchoredRoot &&
    evidence.batchSize === anchor.batchSize
  );
}

/**
 * The §6c fail-closed inclusion verdict (da-windows (#49) S3): true iff a bound
 * witness shows the batch's bytes were first servable by the challenge deadline
 * `h+W+C` (inclusive, S2). Absent or unbound evidence fails closed to `false`
 * (D4); evidence first servable after `h+W+C` is not includable — the S3
 * challenge-deadline miss. (D5's full no-revival / fresh-anchor / no-inherited-
 * priority semantics are not modeled by this predicate.)
 */
export function includable(
  anchor: AnchorFacts,
  evidence: ServedEvidence | null,
  params: DaWindowParams
): boolean {
  if (evidence === null || !evidenceBindsToAnchor(anchor, evidence)) {
    return false;
  }
  return evidence.firstServableHeight <= challengeDeadlineHeight(anchor.minedHeight, params);
}

/**
 * The §6d contested-priority verdict (da-windows (#49) S3): true iff a bound
 * witness shows the batch's bytes were first servable by the availability
 * deadline `h+W` (inclusive, S2). A batch that misses `h+W` forfeits priority
 * (D6) even though it may still be includable when first served inside
 * `(h+W, h+W+C]`. Absent or unbound evidence fails closed to `false` (D4).
 */
export function holdsPriority(
  anchor: AnchorFacts,
  evidence: ServedEvidence | null,
  params: DaWindowParams
): boolean {
  if (evidence === null || !evidenceBindsToAnchor(anchor, evidence)) {
    return false;
  }
  return evidence.firstServableHeight <= availabilityDeadlineHeight(anchor.minedHeight, params);
}
