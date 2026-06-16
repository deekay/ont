import { sha256 } from "@noble/hashes/sha2";
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

const dsha256 = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes));
const reversed = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes).reverse();
const HEX_RE = /^[0-9a-fA-F]+$/;

function reject(reason: HeaderChainRejectReason): RejectedHeaderChain {
  return { ok: false, reason };
}

function bytesToHexLower(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function hexToBytesEven(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !HEX_RE.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function readU32LE(bytes: Uint8Array, off: number): number {
  return (
    (bytes[off]! |
      (bytes[off + 1]! << 8) |
      (bytes[off + 2]! << 16) |
      (bytes[off + 3]! << 24)) >>>
    0
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Strict compact (`nBits`) → target. The permissive `bitsToTarget` does the magnitude shift;
 * this wraps it with the Bitcoin compact-validity rules so a malformed compact is rejected
 * BEFORE any expected-bits comparison: sign bit (negative), zero mantissa, and the size/word
 * overflow rule. A valid target above `powLimit` is a distinct reject.
 */
function compactToTargetStrict(
  bits: number,
  powLimit: bigint,
): { ok: true; target: bigint } | { ok: false; reason: HeaderChainRejectReason } {
  const mantissa = bits & 0x007fffff;
  const exponent = bits >>> 24;
  if (mantissa === 0) return { ok: false, reason: "spv-compact-invalid" }; // zero target
  if ((bits & 0x00800000) !== 0) return { ok: false, reason: "spv-compact-invalid" }; // negative
  const overflow =
    exponent > 34 ||
    (mantissa > 0xff && exponent > 33) ||
    (mantissa > 0xffff && exponent > 32);
  if (overflow) return { ok: false, reason: "spv-compact-invalid" };
  const target = bitsToTarget(bits >>> 0);
  if (target <= 0n) return { ok: false, reason: "spv-compact-invalid" };
  if (target > powLimit) return { ok: false, reason: "spv-target-above-powlimit" };
  return { ok: true, target };
}

/** target → canonical compact (`nBits`), Bitcoin Core arith_uint256::GetCompact. */
function targetToCompact(target: bigint): number {
  if (target <= 0n) return 0;
  let nSize = Math.floor((target.toString(2).length + 7) / 8);
  let nCompact: number;
  if (nSize <= 3) nCompact = Number(target << BigInt(8 * (3 - nSize)));
  else nCompact = Number(target >> BigInt(8 * (nSize - 3)));
  if ((nCompact & 0x00800000) !== 0) {
    // High bit would read as the sign: shift the mantissa down and grow the exponent.
    nCompact = nCompact >>> 8;
    nSize++;
  }
  return (nCompact | (nSize << 24)) >>> 0;
}

/** Bitcoin Core GetBlockProof: (~target)/(target+1) + 1 = floor((2^256-1-target)/(target+1)) + 1. */
function blockProof(target: bigint): bigint {
  return ((1n << 256n) - 1n - target) / (target + 1n) + 1n;
}

/**
 * Validate a presented Bitcoin header chain forward from a trusted difficulty-context
 * checkpoint. Total + deterministic + fail-closed: never throws; any malformed input or any
 * failing header yields a stable `spv-*` reject and no header source.
 */
export function validateHeaderChain(
  headersHex: readonly string[],
  startHeight: number,
  checkpoint: BitcoinDifficultyCheckpoint,
  params: BitcoinNetworkParams,
): HeaderChainResult {
  try {
    if (!Array.isArray(headersHex) || headersHex.length === 0) return reject("spv-input-malformed");
    if (!Number.isInteger(startHeight) || startHeight < 0) return reject("spv-input-malformed");

    // --- params ---
    if (params === null || typeof params !== "object") return reject("spv-params-malformed");
    const { powLimitHex, powTargetTimespan, powRetargetInterval } = params;
    if (typeof powLimitHex !== "string" || !HEX_RE.test(powLimitHex)) {
      return reject("spv-params-malformed");
    }
    if (!Number.isInteger(powTargetTimespan) || powTargetTimespan <= 0) {
      return reject("spv-params-malformed");
    }
    if (!Number.isInteger(powRetargetInterval) || powRetargetInterval <= 0) {
      return reject("spv-params-malformed");
    }
    const powLimit = BigInt("0x" + powLimitHex);
    if (powLimit <= 0n) return reject("spv-params-malformed");

    // --- checkpoint ---
    if (checkpoint === null || typeof checkpoint !== "object") return reject("spv-checkpoint-malformed");
    if (!Number.isInteger(checkpoint.height) || checkpoint.height < 0) {
      return reject("spv-checkpoint-malformed");
    }
    if (
      typeof checkpoint.hashHex !== "string" ||
      checkpoint.hashHex.length !== 64 ||
      !HEX_RE.test(checkpoint.hashHex)
    ) {
      return reject("spv-checkpoint-malformed");
    }
    if (!Number.isInteger(checkpoint.bits)) return reject("spv-checkpoint-malformed");
    if (!Number.isInteger(checkpoint.time) || checkpoint.time < 0) {
      return reject("spv-checkpoint-malformed");
    }
    if (!Number.isInteger(checkpoint.epochStartTime) || checkpoint.epochStartTime < 0) {
      return reject("spv-checkpoint-malformed");
    }
    if (typeof checkpoint.cumulativeWorkHex !== "string" || !HEX_RE.test(checkpoint.cumulativeWorkHex)) {
      return reject("spv-checkpoint-malformed");
    }
    // The checkpoint's own difficulty must be a sane compact ≤ powLimit (it seeds the retarget).
    const cpTarget = compactToTargetStrict(checkpoint.bits >>> 0, powLimit);
    if (!cpTarget.ok) return reject("spv-checkpoint-malformed");
    let cumulativeWork = BigInt("0x" + checkpoint.cumulativeWorkHex);
    if (cumulativeWork < 0n) return reject("spv-checkpoint-malformed");

    // --- contiguity ---
    if (startHeight !== checkpoint.height + 1) return reject("spv-noncontiguous-start");

    // --- walk ---
    const interval = powRetargetInterval;
    const timespan = powTargetTimespan;
    const lowerClamp = Math.floor(timespan / 4);
    const upperClamp = timespan * 4;

    let prevHashInternal = reversed(hexToBytesEven(checkpoint.hashHex)!); // display → internal
    let currentBits = checkpoint.bits >>> 0; // bits in force for the current epoch
    let currentEpochStartTime = checkpoint.epochStartTime;
    let prevTime = checkpoint.time;

    const validated = new Map<number, string>();
    let tipHashInternal = prevHashInternal;

    for (let i = 0; i < headersHex.length; i++) {
      const hex = headersHex[i];
      if (typeof hex !== "string") return reject("spv-header-malformed");
      const header = hexToBytesEven(hex);
      if (header === null || header.length !== 80) return reject("spv-header-malformed");
      const height = startHeight + i;

      // linkage (prevBlock field is internal byte order)
      if (!bytesEqual(header.subarray(4, 36), prevHashInternal)) return reject("spv-broken-linkage");

      const bits = readU32LE(header, 72);
      const headerTime = readU32LE(header, 68);

      // expected difficulty: constant within an epoch; recomputed at a retarget boundary
      let expectedBits: number;
      if (height % interval === 0) {
        const prevTargetRes = compactToTargetStrict(currentBits, powLimit);
        if (!prevTargetRes.ok) return reject(prevTargetRes.reason); // defensive (cp/prev validated)
        let actual = prevTime - currentEpochStartTime;
        if (actual < lowerClamp) actual = lowerClamp;
        if (actual > upperClamp) actual = upperClamp;
        let newTarget = (prevTargetRes.target * BigInt(actual)) / BigInt(timespan);
        if (newTarget > powLimit) newTarget = powLimit;
        expectedBits = targetToCompact(newTarget);
      } else {
        expectedBits = currentBits;
      }

      // strict compact validity BEFORE the expected-bits comparison
      const targetRes = compactToTargetStrict(bits, powLimit);
      if (!targetRes.ok) return reject(targetRes.reason);
      if (bits !== expectedBits) return reject("spv-unexpected-bits");
      if (!headerMeetsTarget(header)) return reject("spv-pow-insufficient");

      // accept
      cumulativeWork += blockProof(targetRes.target);
      validated.set(height, hex);
      const internal = dsha256(header);
      tipHashInternal = internal;
      prevHashInternal = internal;
      prevTime = headerTime;
      if (height % interval === 0) {
        currentBits = bits;
        currentEpochStartTime = headerTime;
      }
    }

    const tipHeight = startHeight + headersHex.length - 1;
    return {
      ok: true,
      headerSource: { headerHexAtHeight: (h: number): string | null => validated.get(h) ?? null },
      tipHeight,
      tipHashHex: bytesToHexLower(reversed(tipHashInternal)),
      cumulativeWorkHex: cumulativeWork.toString(16),
    };
  } catch {
    return reject("spv-input-malformed");
  }
}
