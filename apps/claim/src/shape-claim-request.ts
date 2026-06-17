import { isCanonicalName } from "@ont/wire";
import type { RootAnchorFundingInput } from "@ont/adapter-publisher";

// B5-CLAIM (B5_SURFACES_PLAN §7.3) — claim-request shaping. A PURE surface core: validate + shape the caller's
// claim request into a structured submit payload, ready to hand to the publisher/batch + assembler. It decides
// nothing and computes nothing about roots/batches (CL phrasing-watch: batching/root computation comes from the
// adapter/fixture stack, never a surface rule). It only validates the request shape and that the requested name
// is canonical — consuming @ont/wire's isCanonicalName (reject-don't-normalize, W3), never reimplementing the
// rule and never normalizing. Funding/change are passed through unvalidated — the assembler owns their contents.
// Total + fail-closed; never throws.

export interface ClaimRequest {
  /** The name the caller wants to claim. */
  readonly name: string;
  /** The caller's funding UTXOs for the anchor tx (passed through to the assembler). */
  readonly fundingInputs: readonly RootAnchorFundingInput[];
  /** Optional change output (passed through to the assembler). */
  readonly changeOutput?: { readonly valueSats: bigint; readonly scriptPubKeyHex: string };
}

export type ClaimRequestRejectReason =
  | "malformed" // not an object / missing fields
  | "non-canonical-name" // name fails @ont/wire isCanonicalName (reject-don't-normalize, W3)
  | "no-funding"; // fundingInputs is not a non-empty array

export type ShapeClaimRequestResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly fundingInputs: readonly RootAnchorFundingInput[];
      readonly changeOutput?: { readonly valueSats: bigint; readonly scriptPubKeyHex: string };
    }
  | { readonly ok: false; readonly reason: ClaimRequestRejectReason };

/**
 * RED stub (B5-CLAIM): rejects until the shaping core lands. Green contract:
 *   input is an object — else "malformed".
 *   isCanonicalName(name) — else "non-canonical-name" (consume @ont/wire; do NOT normalize, W3).
 *   fundingInputs is a non-empty array — else "no-funding".
 *   accept { ok:true, name, fundingInputs, changeOutput? } (the validated request to submit; NO root/batch
 *   computation here — that is the adapter/fixture stack's job). Total; never throws (→ "malformed").
 */
export function shapeClaimRequest(input: ClaimRequest): ShapeClaimRequestResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "malformed" };
    const { name, fundingInputs, changeOutput } = input;
    // typeof guard BEFORE isCanonicalName — NAME_RE.test() coerces (e.g. 123 → "123" would pass).
    if (typeof name !== "string" || !isCanonicalName(name)) return { ok: false, reason: "non-canonical-name" };
    if (!Array.isArray(fundingInputs) || fundingInputs.length === 0) return { ok: false, reason: "no-funding" };
    // Funding/change passed through unvalidated — the assembler owns their contents (no deep surface validation).
    return { ok: true, name, fundingInputs, ...(changeOutput !== undefined ? { changeOutput } : {}) };
  } catch {
    return { ok: false, reason: "malformed" }; // total — never throws
  }
}
