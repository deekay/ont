// LE-INDEX slice-3 red battery — the hermetic live-enforcement e2e (UNGATED: part of the default acceptance
// suite; no bitcoind, no ONT_E2E_REGTEST gate). It wires the audited `enforceBatchedClaim` through the REAL
// runIndexerTick over REAL file stores (cursor.json + confirmed-anchors.json via selectIndexerStores, plus a
// file-backed @ont/name-state-store), driven by a COHERENT synthetic mined fee-adequate RootAnchor anchor — so
// green only when the enforcement genuinely passes against Bitcoin, and the per-name state is DURABLE.
//
// The CL §6.3 acceptance battery (LIVE_ENFORCEMENT_PLAN): (a) an accepted batch writes per-name name-state
// (+ survives a restart — read via a FRESH file store over the same dir); (b) withheld served bytes → reject at
// availability, NO mutation; (c) a mismatched proof bundle (non-canonical header) → reject at inclusion, NO
// mutation; (d) a bare RootAnchor still lands in the anchor-store read path and causes NO name-state mutation.
// Plus (e): the atomicity fix proven over REAL file stores — a name-state persistence failure THROWS out of the
// tick so the durable cursor is NOT advanced and NO partial name-state lands. RED until enforcement-e2e lands.
import { describe, expect, it } from "vitest";
import { runEnforcementE2e } from "./enforcement-e2e.js";

describe("runEnforcementE2e (LE-INDEX — live enforcement through runIndexerTick over real file stores)", () => {
  it("accepts a valid batch, persists per-name state durably, rejects/skips the rest, and is atomic", async () => {
    const r = await runEnforcementE2e();

    // The confirmed RootAnchor facts the whole battery is built on.
    expect(r.anchorTxid).toMatch(/^[0-9a-f]{64}$/);
    expect(r.anchoredRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(r.minedHeight).toBeGreaterThan(0);

    // ── (a) ACCEPT + restart-survival ──────────────────────────────────────────────────────────────────────
    // The accepted batch writes ALL committed entries (alice + carol), and reading them back through a FRESH
    // file store over the same dir AFTER the stores were dropped proves the name-state is DURABLE (restart).
    expect(r.accept.acceptedRoots).toEqual([r.anchoredRoot]);
    expect(r.accept.namesWritten).toBe(2);
    expect(r.accept.anchorInReadPath).toBe(true); // additive: the anchor also landed in the G1/G2/G3 read path
    expect(r.accept.cursorHeightAfterRestart).toBe(1); // the durable cursor advanced once and survived restart

    const alice = r.accept.aliceDurable;
    const carol = r.accept.carolDurable;
    expect(alice).not.toBeNull();
    expect(carol).not.toBeNull();
    // The §2a per-name projection, read back from disk.
    expect(alice?.canonicalName).toBe(r.nameA);
    expect(alice?.owner).toEqual({ kind: "owner-key", ownerPubkeyHex: r.ownerA });
    expect(alice?.leafKeyHex).toBe(r.leafA);
    expect(alice?.batchLocalIndex).toBe(0);
    expect(carol?.batchLocalIndex).toBe(1);
    expect(alice?.anchoredRoot).toBe(r.anchoredRoot);
    expect(alice?.anchor).toEqual({ txid: r.anchorTxid, minedHeight: r.minedHeight, txIndex: 0, vout: 0 });
    expect(carol?.owner.ownerPubkeyHex).toBe(r.ownerC);
    // Both names share the batch's accepted servable height + carry the accepted verdict trace tail.
    expect(Number.isFinite(alice?.firstServableHeight)).toBe(true);
    expect(carol?.firstServableHeight).toBe(alice?.firstServableHeight);
    expect(alice?.trace.at(-1)).toEqual({ step: "verdict", ok: true, reason: "batched-claim-accepted" });

    // ── (b) withheld served bytes → reject at availability, NO mutation ─────────────────────────────────────
    expect(r.withheld.namesWritten).toBe(0);
    expect(r.withheld.rejectedReason).toMatch(/hrns-rejected-at-(availability|completeness)/);
    expect(r.withheld.aliceDurable).toBe(false); // nothing written through the file store

    // ── (c) mismatched proof bundle (non-canonical header) → reject at inclusion, NO mutation ───────────────
    expect(r.badHeader.namesWritten).toBe(0);
    expect(r.badHeader.rejectedReason).toMatch(/hrns-rejected-at-inclusion/);
    expect(r.badHeader.aliceDurable).toBe(false);

    // ── (d) a bare RootAnchor lands in the read path, causes NO name-state mutation ─────────────────────────
    expect(r.bare.skippedRoots).toEqual([r.anchoredRoot]);
    expect(r.bare.namesWritten).toBe(0);
    expect(r.bare.anchorInReadPath).toBe(true); // the anchor still lands in anchor-store (read path untouched)
    expect(r.bare.aliceDurable).toBe(false);

    // ── (e) atomicity over REAL file stores: a persistence failure throws out → cursor not advanced, no partial ─
    expect(r.atomicity.threw).toBe(true);
    expect(r.atomicity.errorMessage).toMatch(/disk full/);
    expect(r.atomicity.cursorHeightAfterRestart).toBe(0); // the durable cursor was NOT advanced → the batch retries
    expect(r.atomicity.aliceDurable).toBe(false); // all-or-nothing: no partial name-state landed on disk
  });
});
