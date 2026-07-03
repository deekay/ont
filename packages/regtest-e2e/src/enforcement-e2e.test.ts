// LE-INDEX slice-3 red battery — the hermetic live-enforcement e2e (UNGATED: part of the default acceptance
// suite; no bitcoind, no ONT_E2E_REGTEST gate). It wires the audited `enforceBatchedClaim` through the REAL
// daemon selector path (selectIndexerRunnerDeps, as called by main.ts) into runIndexerTick over REAL file stores,
// driven by a COHERENT synthetic mined fee-adequate RootAnchor anchor and fixture-file batch material — so green
// only when the daemon wiring genuinely loads material, enforces against Bitcoin, and writes DURABLE per-name state.
//
// The CL §6.3 acceptance battery (LIVE_ENFORCEMENT_PLAN): (a) an accepted batch writes per-name name-state
// (+ survives a restart — read via a FRESH file store over the same dir); (b) withheld served bytes → reject at
// availability, NO mutation; (c) a mismatched proof bundle (non-canonical header) → reject at inclusion, NO
// mutation; (d) a missing fixture material entry in the daemon path THROWS out of the tick so the durable cursor is
// NOT advanced and NO name-state lands; (e) generated A' fixture material enforces through the same selector path;
// (f) two operators prove the http-da path: A serves /da/{root}, B fetches via ONT_ENFORCEMENT=http-da, accepts
// identical state, and fail-closes with no mutation on 404 or tampered served leaves. RED until enforcement-e2e lands.
import { describe, expect, it } from "vitest";
import { runEnforcementE2e } from "./enforcement-e2e.js";

describe("runEnforcementE2e (LE-INDEX — daemon-selected enforcement through runIndexerTick)", () => {
  it("loads fixture material through the daemon selector, writes names, rejects bad material, and fails closed", async () => {
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

    // ── (d) missing fixture material in the daemon path fails loud/closed, never a quiet skip ────────────────
    expect(r.missingMaterial.threw).toBe(true);
    expect(r.missingMaterial.errorMessage).toMatch(/batch material missing/);
    expect(r.missingMaterial.cursorHeightAfterRestart).toBe(0); // cursor NOT advanced → the batch retries
    expect(r.missingMaterial.aliceDurable).toBe(false); // no name-state landed on disk

    // ── (e) generated A' fixture material + matching RootAnchor input drives name-state ──────────────────────
    expect(r.generatedFixture.anchorInput.newRoot).toBe(r.generatedFixture.acceptedRoots[0]);
    expect(r.generatedFixture.materialKey).toBe(`${r.generatedFixture.anchorInput.prevRoot}:${r.generatedFixture.anchorInput.newRoot}`);
    expect(r.generatedFixture.anchorInput.batchSize).toBe(1);
    expect(r.generatedFixture.namesWritten).toBe(1);
    expect(r.generatedFixture.aliceDurable?.canonicalName).toBe(r.nameA);
    expect(r.generatedFixture.aliceDurable?.owner).toEqual({ kind: "owner-key", ownerPubkeyHex: r.ownerA });

    // ── (f) G-B 7c: two operators, no shared filesystem; B fetches A's /da/{root} via http-da ─────────────
    expect(r.twoOperatorHttpDa.served.acceptedRoots).toEqual([r.anchoredRoot]);
    expect(r.twoOperatorHttpDa.served.namesWritten).toBe(2);
    expect(r.twoOperatorHttpDa.served.anchorInReadPath).toBe(true);
    expect(r.twoOperatorHttpDa.served.cursorHeightAfterRestart).toBe(1);
    expect(r.twoOperatorHttpDa.served.aliceDurable).toEqual(r.accept.aliceDurable);
    expect(r.twoOperatorHttpDa.served.carolDurable).toEqual(r.accept.carolDurable);

    // Operator A withholds the DA record (publisher returns 404): B observes a declared-root miss and writes no names.
    expect(r.twoOperatorHttpDa.withheld.skippedRoots).toEqual([r.anchoredRoot]);
    expect(r.twoOperatorHttpDa.withheld.rejectedReason).toBeUndefined();
    expect(r.twoOperatorHttpDa.withheld.namesWritten).toBe(0);
    expect(r.twoOperatorHttpDa.withheld.anchorInReadPath).toBe(true);
    expect(r.twoOperatorHttpDa.withheld.aliceDurable).toBe(false);

    // Operator A serves tampered DA leaves: B still uses the shared audited core and rejects without mutation.
    expect(r.twoOperatorHttpDa.tampered.skippedRoots).toEqual([]);
    expect(r.twoOperatorHttpDa.tampered.rejectedReason).toMatch(/hrns-rejected-at-(availability|completeness)/);
    expect(r.twoOperatorHttpDa.tampered.namesWritten).toBe(0);
    expect(r.twoOperatorHttpDa.tampered.anchorInReadPath).toBe(true);
    expect(r.twoOperatorHttpDa.tampered.aliceDurable).toBe(false);
  }, 15_000);
});
