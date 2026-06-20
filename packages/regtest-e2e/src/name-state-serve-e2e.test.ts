// LE-RESOLVE LR-3 battery — the hermetic serve-after-restart e2e (UNGATED: part of the default acceptance suite).
// Proves the deployed resolver read surface serves enforced name-state durably over real HTTP through the REAL
// env selector after a restart (the LE-RESOLVE analog of the G2 restart-survival e2e). LR-3 locks the resolver
// SERVE path; the enforcement WRITE path is locked by enforcement-e2e.
import { describe, expect, it } from "vitest";
import { runNameStateServeE2e } from "./name-state-serve-e2e.js";

describe("runNameStateServeE2e (LE-RESOLVE LR-3 — serve durable name-state over real HTTP after restart)", () => {
  it("serves the enforced record after restart; reject-don't-normalize 404 + selector-absence 404", async () => {
    const r = await runNameStateServeE2e();

    // Served after restart through the REAL selectResolverNameStateView + resolver HTTP — the enforced facts +
    // not-ownership-authority stamps + the §2a fields + the accepted enforcement trace.
    expect(r.servedStatus).toBe(200);
    expect(r.servedBody).toMatchObject({
      ok: true,
      provenance: "resolver-indexed-mirror",
      authority: "not-ownership-authority",
      canonicalName: r.canonicalName,
      anchoredRoot: r.anchoredRoot,
      leafKeyHex: r.leafKeyHex,
      owner: { kind: "owner-key", ownerPubkeyHex: r.ownerPubkeyHex },
      trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
    });

    // Reject-don't-normalize at the REAL file selector: a case-variant is an exact-key miss in getByName, so it is
    // a 404 name-unknown (NOT the 409 name-mismatch path — that is the hostile/buggy injected-source case).
    expect(r.caseVariantStatus).toBe(404);
    expect(r.caseVariantReason).toBe("name-unknown");

    // Selector absence: a memory/unset selector returns no nameStateView, so the route 404s not-served even though
    // name-state.json exists on disk (selector-absence becomes route-unavailable, not a snapshot fallback).
    expect(r.memorySelectorStatus).toBe(404);
    expect(r.memorySelectorReason).toBe("not-served");
  });
});
