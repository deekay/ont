import type { ServedValueHistoryResult } from "@ont/adapter-resolver";

// B5-CLAIM (B5_SURFACES_PLAN §7.3) — claim view-model projection. A PURE surface core: fold a resolver
// served-history read into the page view-model for rendering, PRESERVING the not-ownership-authority /
// resolver-indexed-mirror provenance stamps. The surface NEVER presents the resolver's chain-derived
// convenience data as ownership authority (apps/claim requalification + da-trust-model firewall doctrine) —
// the view-model's `authority` field is the literal "not-ownership-authority", so it cannot claim otherwise.
// On a rejected/unavailable served read, the view is "unavailable" (no fabricated state). Total; never throws.

export interface ClaimView {
  readonly name: string;
  readonly status: "served";
  readonly recordCount: number;
  /** Carried verbatim from the resolver read — the surface never upgrades these. */
  readonly provenance: "resolver-indexed-mirror";
  readonly authority: "not-ownership-authority";
}

export type ProjectClaimViewResult =
  | { readonly ok: true; readonly view: ClaimView }
  | { readonly ok: false; readonly reason: "unavailable" };

/**
 * RED stub (B5-CLAIM): unavailable until the projection lands. Green contract:
 *   served.ok === true → { ok:true, view: { name: served.name, status:"served", recordCount:
 *     served.records.length, provenance: served.provenance, authority: served.authority } } — the stamps are
 *     carried verbatim; the surface adds no authority.
 *   served.ok === false (or malformed) → { ok:false, reason:"unavailable" } (never fabricate state).
 * Total; never throws (→ "unavailable").
 */
export function projectClaimView(served: ServedValueHistoryResult): ProjectClaimViewResult {
  try {
    if (served === null || typeof served !== "object") return { ok: false, reason: "unavailable" };
    if (served.ok !== true) return { ok: false, reason: "unavailable" };
    return {
      ok: true,
      view: {
        name: served.name,
        status: "served",
        recordCount: served.records.length,
        provenance: served.provenance, // carried verbatim — the surface never upgrades authority
        authority: served.authority,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" }; // total — never throws
  }
}
