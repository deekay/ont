import { bitsToTarget, headerMeetsTarget } from "./block-header.js";

// B3 light-client header-chain validator (I-SPV §7, B3_INTEGRATION_PLAN.md). This is the
// #82 launch-gate posture: it does NOT merely prove a header has *some* valid work and links
// to a checkpoint (a fabricated child of a checkpoint can pick easier nBits, self-target the
// PoW, link, and still be off-chain). It validates a PRESENTED candidate chain against the
// Bitcoin difficulty rules anchored at a TRUSTED difficulty-context checkpoint:
//   - strict compact-target validity (sign bit / zero / overflow / > powLimit)  [reject]
//   - expected nBits at each height (constant within a retarget epoch; recomputed at a
//     2016-block boundary from the closing epoch's timespan, clamped, powLimit-capped) [reject]
//   - per-header proof-of-work against that header's target                       [reject]
//   - prev-hash linkage from the checkpoint forward                              [reject]
//   - cumulative chainwork (Bitcoin Core's GetBlockProof, exact)
// A hash-only checkpoint is enough for linkage but NOT for difficulty validation, so the
// checkpoint carries the closing epoch's bits/time/epoch-start and accumulated work; a segment
// starting mid-epoch therefore cannot silently infer its expected bits from the first supplied
// header. The result is a canonical BitcoinHeaderSource the audited inclusion verifier consumes;
// B4 (the network adapter) presents the candidate chain + does multi-fork selection.

/** The seam the audited @ont/consensus inclusion verifier (proof-bundle.ts) consumes. */
export interface BitcoinHeaderSource {
  /** The validated 80-byte header (display hex) at `height`, or null outside the range. */
  headerHexAtHeight(height: number): string | null;
}

/**
 * A trusted difficulty-context anchor: the block immediately before the first presented header.
 * `epochStartTime` is the timestamp of the first block of THIS block's retarget epoch
 * (`height - (height % powRetargetInterval)`); together with `bits`/`time` it lets the verifier
 * recompute the next retarget without trusting any presented header for difficulty.
 */
export interface BitcoinDifficultyCheckpoint {
  readonly height: number;
  readonly hashHex: string; // display hash (64 hex)
  readonly bits: number; // the checkpoint epoch's compact nBits
  readonly time: number; // the checkpoint block's timestamp (unix seconds)
  readonly epochStartTime: number; // timestamp of the first block of the checkpoint's epoch
  readonly cumulativeWorkHex: string; // accumulated chainwork up to + including the checkpoint
}

export interface BitcoinNetworkParams {
  readonly powLimitHex: string; // maximum target (hex, no 0x); mainnet = 00000000FFFF0000…0000
  readonly powTargetTimespan: number; // expected seconds per retarget epoch (mainnet 1209600)
  readonly powRetargetInterval: number; // blocks per retarget epoch (mainnet 2016)
}

export interface ValidatedHeaderChain {
  readonly ok: true;
  readonly headerSource: BitcoinHeaderSource;
  readonly tipHeight: number;
  readonly tipHashHex: string;
  readonly cumulativeWorkHex: string;
}

export interface RejectedHeaderChain {
  readonly ok: false;
  readonly reason: HeaderChainRejectReason;
}

export type HeaderChainRejectReason =
  | "spv-input-malformed"
  | "spv-checkpoint-malformed"
  | "spv-params-malformed"
  | "spv-noncontiguous-start"
  | "spv-header-malformed"
  | "spv-broken-linkage"
  | "spv-compact-invalid"
  | "spv-target-above-powlimit"
  | "spv-unexpected-bits"
  | "spv-pow-insufficient";

export type HeaderChainResult = ValidatedHeaderChain | RejectedHeaderChain;

/**
 * Validate a presented Bitcoin header chain forward from a trusted difficulty-context
 * checkpoint. Total + deterministic + fail-closed: never throws; any malformed input or any
 * failing header yields a stable `spv-*` reject and no header source.
 *
 * STUB (I-SPV step b, tests-first): returns a fixed reject so the `spv.*` red battery fails
 * for the right reason until the validator is implemented.
 */
export function validateHeaderChain(
  _headersHex: readonly string[],
  _startHeight: number,
  _checkpoint: BitcoinDifficultyCheckpoint,
  _params: BitcoinNetworkParams,
): HeaderChainResult {
  // Reference the relocated primitives so the import is live in the stub (the green
  // implementation threads them through compact validity + PoW).
  void bitsToTarget;
  void headerMeetsTarget;
  return { ok: false, reason: "spv-input-malformed" };
}
