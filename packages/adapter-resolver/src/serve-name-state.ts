import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import { isCanonicalName } from "@ont/wire";
import type { NameStateRecord, NameStateOwner, NameStateAnchorCoords, NameStateTraceStep } from "@ont/name-state-store";

// LE-RESOLVE-READ (LIVE_ENFORCEMENT_PLAN §3.2) — the resolver's enforced name-state read projection. The GET face
// is a chain-derived CONVENIENCE, NOT ownership authority (same firewall doctrine as the value/recovery reads:
// ownership is decided on-chain + by the audited kernel / LE-INDEX enforcement, never by the resolver). The
// firewall in the READ direction is "recompute-don't-trust serving": the resolver serves an enforced name-state
// record ONLY if it independently re-verifies the §2a integrity bindings — the stored key is canonical
// (reject-don't-normalize, never case-folded), it is the name that was asked for, its leaf key recomputes from the
// canonical name, the owner is a well-formed owner-key, and it carries a non-empty enforcement trace. A
// hostile/corrupt mirror (non-canonical key, wrong leaf key, malformed owner, empty trace) is REJECTED as a
// served-error, never served as valid-but-corrupt enforced state (fail-closed). The HTTP wiring around this pure
// core stays thin plumbing. No consensus law; decides nothing about ownership — it mirrors the indexer's
// enforced facts and stamps them not-ownership-authority.

export type ServedNameStateRejectReason =
  | "name-unknown" // no enforced state for this name (the durable source returned null) — nothing to serve
  | "non-canonical-name" // the stored canonicalName fails isCanonicalName (W3) — a corrupt mirror, never case-folded
  | "name-mismatch" // the stored canonicalName !== the requested name (reject-don't-normalize: exact match only)
  | "leaf-key-mismatch" // leafKeyHex !== sha256Hex(utf8ToBytes(canonicalName)) — the §2a name→leaf binding is broken
  | "invalid-owner" // owner is not a well-formed owner-key (kind / 64-hex pubkey)
  | "empty-trace"; // trace is empty — a served record must carry its accepted enforcement evidence path

export interface ProjectServedNameStateInput {
  /** The requested name (the path param) — compared verbatim to the stored key (reject-don't-normalize). */
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

const HEX64 = /^[0-9a-f]{64}$/; // a 32-byte lowercase-hex digest / x-only pubkey (the wire/store convention)

/**
 * GREEN contract (LE-RESOLVE-READ):
 *   pre  record !== null — else "name-unknown".
 *   1. canonical    isCanonicalName(record.canonicalName) — else "non-canonical-name" (W3, never case-folded).
 *   2. name         record.canonicalName === input.name — else "name-mismatch" (reject-don't-normalize: exact).
 *   3. leaf key     record.leafKeyHex === sha256Hex(utf8ToBytes(record.canonicalName)) — else "leaf-key-mismatch".
 *   4. owner        owner.kind === "owner-key" && /^[0-9a-f]{64}$/.test(owner.ownerPubkeyHex) — else "invalid-owner".
 *   5. trace        record.trace is a non-empty array — else "empty-trace".
 *   accept { ok:true, the enforced fields served as-is, provenance: "resolver-indexed-mirror",
 *           authority: "not-ownership-authority" }.
 * Fail-closed: any single break rejects the record (never a partial/false serve). Total; never throws (→ reject).
 */
export function projectServedNameState(input: ProjectServedNameStateInput): ServedNameStateResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "name-unknown" };
    const { name, record } = input;
    if (record === null || typeof record !== "object") return { ok: false, reason: "name-unknown" };

    if (typeof record.canonicalName !== "string" || !isCanonicalName(record.canonicalName)) {
      return { ok: false, reason: "non-canonical-name" };
    }
    if (record.canonicalName !== name) return { ok: false, reason: "name-mismatch" };
    if (typeof record.leafKeyHex !== "string" || record.leafKeyHex !== sha256Hex(utf8ToBytes(record.canonicalName))) {
      return { ok: false, reason: "leaf-key-mismatch" };
    }
    const owner = record.owner;
    if (
      owner === null ||
      typeof owner !== "object" ||
      owner.kind !== "owner-key" ||
      typeof owner.ownerPubkeyHex !== "string" ||
      !HEX64.test(owner.ownerPubkeyHex)
    ) {
      return { ok: false, reason: "invalid-owner" };
    }
    if (!Array.isArray(record.trace) || record.trace.length === 0) return { ok: false, reason: "empty-trace" };

    return {
      ok: true,
      canonicalName: record.canonicalName,
      owner,
      leafKeyHex: record.leafKeyHex,
      batchLocalIndex: record.batchLocalIndex,
      anchoredRoot: record.anchoredRoot,
      anchor: record.anchor,
      firstServableHeight: record.firstServableHeight,
      trace: record.trace,
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
    };
  } catch {
    return { ok: false, reason: "name-unknown" }; // fail-closed: an unparseable record is not servable enforced state
  }
}
