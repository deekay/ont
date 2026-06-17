// G2 slice 6c red battery — restart-survival e2e (HERMETIC, UNGATED: part of the default acceptance suite).
//
// Pins (CL, event 0285bca3): real file stores under one temp ONT_STORE_DIR; the resolver created via the REAL
// selectResolverAnchorTxView({ ONT_STORE: "file", ... }) (not a harness recordToView bridge); the web reading via
// createResolverTxSource over resolver HTTP (not createSnapshotWebReadPort); direct /tx + /?q= + /search?q=
// rendering the persisted facts AFTER restart; a resumed tick that starts after the durable cursor with the
// re-presented anchor skipped (no double-apply); and a memory/unset selector that does NOT serve durable anchors.
// RED until runRestartSurvivalE2e is implemented (stub throws).
import { describe, expect, it } from "vitest";
import { runRestartSurvivalE2e } from "./restart-survival-e2e.js";

describe("runRestartSurvivalE2e (G2 slice 6c — durable read survives restart over the real 6b path)", () => {
  it("persists → restarts → renders confirmed facts via resolver HTTP, resumes the cursor, no double-apply", async () => {
    const r = await runRestartSurvivalE2e();

    // The confirmed RootAnchor facts.
    expect(r.anchorTxid).toMatch(/^[0-9a-f]{64}$/);
    expect(r.minedHeight).toBeGreaterThan(0);
    expect(r.anchoredRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(r.batchSize).toBeGreaterThan(0);

    // P4 — AFTER restart, every entry path renders the persisted facts through web → resolver HTTP (the real
    // 6b read path). Direct /tx/:txid, landing /?q=<txid>, and /search?q=<txid> all surface the same facts.
    for (const html of [r.directTxHtml, r.queryTxHtml, r.searchTxHtml]) {
      expect(html).toContain(r.anchorTxid);
      expect(html).toContain(String(r.minedHeight));
      expect(html).toContain(r.anchoredRoot);
      expect(html).toContain(String(r.batchSize));
    }

    // P1 — the cursor resumed from durable state (not genesis).
    expect(r.resumedCursorHeight).toBeGreaterThan(0);

    // P3 — re-presenting the already-persisted anchor on a resumed tick is idempotent: skipped, never re-accepted.
    expect(r.resumeSkipped).toContain(r.anchoredRoot);
    expect(r.resumeAccepted).not.toContain(r.anchoredRoot);
    expect(r.resumeAccepted).toHaveLength(0);

    // P5 — a memory/unset resolver selector must NOT serve the durable anchors (absence): the /tx page renders
    // unavailable, carrying neither the anchored root nor the carrier facts even though the file exists on disk.
    expect(r.memorySelectorTxHtml).not.toContain(r.anchoredRoot);
    expect(r.memorySelectorTxHtml).toContain("not currently served");
  });
});
