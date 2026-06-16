// D-RC — recovery descriptor-evidence timing witness (B3; ratified #86 / O1, the recovery twin of
// #84). The B3 builder of the opaque witness the kernel's §3c consumes
// ({ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight }).
//
// Per #86 (recovery-witness-height): a recovery descriptor is off-chain (W15); the only confirmed-chain
// fact is the RecoverOwner invoke (0x09) committing `recoveryDescriptorHash` at the invoke's mined
// height `h_r`. D-RC mints the height on CONTENT-MATCH ONLY — recompute
// `recoveryDescriptorDigest(descriptor)` and require it equals the invoke-committed hash; the minted
// `witnessedByHeight` is `h_r` itself. Resolver timestamps / gossip / served-at heights are NOT
// consensus inputs (#82 firewall). `W_r` is diagnostic (with `witnessedByHeight = h_r`, the kernel's
// `<= h_r + W_r` always holds when a valid witness exists).
//
// Narrowed seam (CL): the invoke's AUTHORIZATION — R2 owner arming sig, R3 current descriptor head,
// R4 ownershipRef/current interval, R7 invokable version, and the closed-descriptor-shape check — stays
// the kernel's `acceptRecoverOwner`, each with its own reason. D-RC does NOT re-check any of it; it only
// proves "this descriptor's fingerprint matches the invoke commitment, therefore height h_r". Pure +
// total: every malformed input fails closed with a stable reason and never throws.
import { recoveryDescriptorDigest } from "@ont/wire";
import { bytesToHex } from "@ont/protocol";
import type { RecoveryDescriptorWitness } from "@ont/consensus";

export interface VerifyRecoveryDescriptorWitnessInput {
  /** The presented recovery descriptor record `D` (an extra field is the kernel's to reject, not D-RC's). */
  readonly descriptor: Record<string, unknown>;
  /** The invoke's committed `recoveryDescriptorHash` (0x09), 32-byte display hex. */
  readonly committedDescriptorHash: string;
  /** `h_r` — the invoke's confirmed mined height (a D-BI fact). */
  readonly confirmedInvokeMinedHeight: number;
}

export type RecoveryDescriptorWitnessResult =
  | { readonly ok: true; readonly witness: RecoveryDescriptorWitness }
  | { readonly ok: false; readonly reason: string };

const HEX_64 = /^[0-9a-f]{64}$/;
const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isClosedShape = (obj: object, allowed: readonly string[]): boolean =>
  Object.keys(obj).every((key) => allowed.includes(key));
const isU32 = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffff_ffff;
const INPUT_KEYS = ["descriptor", "committedDescriptorHash", "confirmedInvokeMinedHeight"] as const;
const fail = (reason: string): RecoveryDescriptorWitnessResult => ({ ok: false, reason });

/**
 * Mint the §3c descriptor witness, recompute-don't-trust (ratified #86 / O1).
 *
 * GREEN CONTRACT (fail-closed order; total, never throws):
 *   1. top-level totality: `input` is an object with exactly `{ descriptor, committedDescriptorHash,
 *      confirmedInvokeMinedHeight }` (every key present); `descriptor` is a non-null object;
 *      `committedDescriptorHash` is 32-byte lowercase hex; `confirmedInvokeMinedHeight` is u32 — else
 *      `rc-input-malformed` (a missing/extra key, a non-object descriptor, or a source/timestamp channel
 *      all land here).
 *   2. recompute `bytesToHex(recoveryDescriptorDigest(descriptor))` (guarded: `@ont/wire` throws on a
 *      content-malformed descriptor) — else `rc-descriptor-malformed` (reserved for a present descriptor
 *      OBJECT whose field values cannot be digested).
 *   3. it equals `committedDescriptorHash` — else `rc-descriptor-hash-mismatch`.
 *   mint `{ kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: confirmedInvokeMinedHeight }`.
 *   The descriptor's AUTHORIZATION (R2 arming sig, R3 head, R4 ownershipRef, R7 version) AND its
 *   closed-envelope shape (an extra `descriptor`-internal field = the kernel's `descriptor-extra-field`)
 *   are NOT checked here — D-RC mints on digest-match + h_r and never parses/authorizes (the seam).
 */
export function verifyRecoveryDescriptorWitness(
  input: VerifyRecoveryDescriptorWitnessInput,
): RecoveryDescriptorWitnessResult {
  // ---- top-level totality (closed shape; descriptor must be a non-null object; no source channel) ----
  const inp = input as unknown;
  if (!isObject(inp) || !isClosedShape(inp, INPUT_KEYS)) return fail("rc-input-malformed");
  if (!isObject(inp.descriptor)) return fail("rc-input-malformed");
  if (typeof inp.committedDescriptorHash !== "string" || !HEX_64.test(inp.committedDescriptorHash)) {
    return fail("rc-input-malformed");
  }
  if (!isU32(inp.confirmedInvokeMinedHeight)) return fail("rc-input-malformed");

  // ---- recompute the descriptor fingerprint (guarded: @ont/wire throws on a content-malformed descriptor) ----
  let digestHex: string;
  try {
    digestHex = bytesToHex(recoveryDescriptorDigest(inp.descriptor));
  } catch {
    return fail("rc-descriptor-malformed");
  }
  if (digestHex !== inp.committedDescriptorHash) return fail("rc-descriptor-hash-mismatch");

  // ---- mint: witnessedByHeight = h_r (O1, #86). The descriptor's authorization (R2/R3/R4/R7) and its
  // closed-envelope shape stay the kernel's acceptRecoverOwner — D-RC mints on digest-match + h_r only. ----
  return {
    ok: true,
    witness: { kind: "b3-verified-recovery-descriptor-witness", witnessedByHeight: inp.confirmedInvokeMinedHeight },
  };
}
