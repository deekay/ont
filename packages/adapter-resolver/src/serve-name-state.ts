import { decodeNameStateRecord } from "@ont/name-state-store";
import type { NameStateRecord, NameStateOwner, NameStateAnchorCoords, NameStateTraceStep } from "@ont/name-state-store";

// LE-RESOLVE-READ (LIVE_ENFORCEMENT_PLAN §3.2) — the resolver's enforced name-state read projection. The GET face
// is a chain-derived CONVENIENCE, NOT ownership authority (same firewall doctrine as the value/recovery reads:
// ownership is decided on-chain + by the audited kernel / LE-INDEX enforcement, never by the resolver). The
// firewall in the READ direction is "recompute-don't-trust serving": the resolver serves an enforced name-state
// record ONLY if it independently re-verifies the FULL §2a integrity of the record AND it is the name that was
// asked for. The integrity recheck re-runs the SAME strict codec the store uses on disk
// (`decodeNameStateRecord`), so NO source — file, in-memory, or a buggy/hostile LR-2/LR-3 injection — can feed a
// malformed record (bad leaf-key, non-canonical name, out-of-range index/height, malformed owner/anchor/trace)
// through to a false serve; a hostile/corrupt mirror is REJECTED as a served-error, never served as valid-but-
// corrupt enforced state (fail-closed). The HTTP wiring around this pure core stays thin plumbing. No consensus
// law; decides nothing about ownership — it mirrors the indexer's enforced facts and stamps them
// not-ownership-authority.

export type ServedNameStateRejectReason =
  | "name-unknown" // the durable source returned null — no enforced state for this name, nothing to serve
  | "name-mismatch" // the (integrity-valid) record is not the requested name (reject-don't-normalize: exact only)
  | "invalid-record"; // the record fails the §2a integrity codec (canonical name / leaf-key / owner / anchor /
//                       batchLocalIndex / firstServableHeight / trace) — a corrupt mirror, never served

export interface ProjectServedNameStateInput {
  /** The requested name (the path param) — compared verbatim to the validated key (reject-don't-normalize). */
  readonly name: string;
  /** What the durable name-state source returned for `name` (null ⇒ no enforced state). */
  readonly record: NameStateRecord | null;
}

export type ServedNameStateResult =
  | {
      readonly ok: true;
      readonly canonicalName: string;
      readonly owner: NameStateOwner;
      readonly leafKeyHex: string;
      readonly batchLocalIndex: number;
      readonly anchoredRoot: string;
      readonly anchor: NameStateAnchorCoords;
      readonly firstServableHeight: number;
      readonly trace: readonly NameStateTraceStep[];
      readonly provenance: "resolver-indexed-mirror"; // chain-derived convenience mirror of the indexer's enforced facts
      readonly authority: "not-ownership-authority"; // the read is NEVER consensus / ownership authority
    }
  | { readonly ok: false; readonly reason: ServedNameStateRejectReason };

/**
 * GREEN contract (LE-RESOLVE-READ):
 *   pre  record !== null — else "name-unknown".
 *   1. integrity  decodeNameStateRecord(record) re-runs the FULL §2a codec (exact keys, canonical name, leaf-key
 *                 recompute, owner-key 64-hex, anchor coords, u32 batchLocalIndex/firstServableHeight, non-empty
 *                 well-formed trace with finite evidence). Any failure ⇒ "invalid-record". This is the
 *                 defense-in-depth recheck: a buggy/hostile source cannot bypass the store codec into a serve.
 *   2. name       the validated record.canonicalName === input.name — else "name-mismatch" (reject-don't-normalize,
 *                 exact match: a stored "alice" does NOT serve an "Alice" request).
 *   accept { ok:true, the VALIDATED (field-exact, extra-key-stripped) record served, provenance:
 *           "resolver-indexed-mirror", authority: "not-ownership-authority" }.
 * Fail-closed: any break rejects (never a partial/false serve). Total; never throws (→ reject).
 */
export function projectServedNameState(input: ProjectServedNameStateInput): ServedNameStateResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "name-unknown" };
    const { name, record } = input;
    if (record === null || typeof record !== "object") return { ok: false, reason: "name-unknown" };

    // Full §2a integrity re-verification at the read firewall (defense-in-depth): re-run the SAME strict codec the
    // store uses on disk, so no source can feed a malformed record through to a false serve. It throws on any
    // integrity problem; we are total here, so the throw becomes a fail-closed "invalid-record" reject.
    let validated: NameStateRecord;
    try {
      validated = decodeNameStateRecord(record);
    } catch {
      return { ok: false, reason: "invalid-record" };
    }

    // Reject-don't-normalize: the served record must be EXACTLY the requested name (no case-fold). The durable
    // source keys by canonicalName, but the firewall does not trust it to have returned the right record.
    if (validated.canonicalName !== name) return { ok: false, reason: "name-mismatch" };

    return {
      ok: true,
      canonicalName: validated.canonicalName,
      owner: validated.owner,
      leafKeyHex: validated.leafKeyHex,
      batchLocalIndex: validated.batchLocalIndex,
      anchoredRoot: validated.anchoredRoot,
      anchor: validated.anchor,
      firstServableHeight: validated.firstServableHeight,
      trace: validated.trace,
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
    };
  } catch {
    return { ok: false, reason: "invalid-record" }; // fail-closed: an unparseable record is not servable enforced state
  }
}
