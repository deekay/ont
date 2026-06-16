// I-HARNESS red battery (B3_INTEGRATION_PLAN §6) — the batched-claim enforcement orchestrator threads
// the audited §2 pipeline and FAILS CLOSED in a fixed precedence (CL, event 1265ad74):
// inclusion/header → before availability/completeness; missing served bytes → before any canonical-root
// accept; completeness → before any name-state delta. No non-content (timestamp/receipt) channel.
//
// RED PHASE: enforceBatchedClaim is stubbed to reject ("hrns-pending-green-impl") with an empty trace;
// every assertion below is therefore red until the threaded green lands.
import { describe, expect, it } from "vitest";

import type { BitcoinHeaderSource } from "@ont/consensus";
import type { ServedLeaf } from "@ont/evidence";

import {
  enforceBatchedClaim,
  type BatchDataSource,
  type BatchedClaimInput,
  type BatchedClaimSources,
} from "./enforce-batched-claim.js";

const PREV_ROOT = "aa".repeat(32);
const ANCHORED_ROOT = "bb".repeat(32);
const ANCHOR_TXID = "ee".repeat(32);
const ANCHOR_HEIGHT = 800_000;
const HEADER_HEX = "00".repeat(80); // fixture canonical 80-byte header

const LEAVES: readonly ServedLeaf[] = [
  { keyHex: "c1".repeat(32), valueHex: "d1".repeat(32) },
  { keyHex: "c2".repeat(32), valueHex: "d2".repeat(32) },
];
const BASE_LEAVES: ReadonlyMap<string, string> = new Map([["b0".repeat(32), "e0".repeat(32)]]);

function headerSource(at?: (h: number) => string | null): BitcoinHeaderSource {
  return { headerHexAtHeight: at ?? ((h) => (h === ANCHOR_HEIGHT ? HEADER_HEX : null)) };
}

function batchDataSource(over: Partial<BatchDataSource> = {}): BatchDataSource {
  return {
    baseLeavesForPrevRoot: over.baseLeavesForPrevRoot ?? ((r) => (r === PREV_ROOT ? BASE_LEAVES : null)),
    servedLeavesForRoot: over.servedLeavesForRoot ?? ((r) => (r === ANCHORED_ROOT ? LEAVES : null)),
  };
}

function claim(over: Partial<BatchedClaimInput> = {}): BatchedClaimInput {
  return {
    proofBundle: {
      bitcoinInclusion: {
        anchors: [{ txid: ANCHOR_TXID, height: ANCHOR_HEIGHT, blockHeaderHex: HEADER_HEX, merkle: [], pos: 0 }],
      },
    },
    anchor: { txid: ANCHOR_TXID, prevRoot: PREV_ROOT, anchoredRoot: ANCHORED_ROOT, anchorHeight: ANCHOR_HEIGHT, batchSize: 2 },
    window: { K: 6, W: 8, C: 4 },
    ...over,
  };
}

function sources(over: { header?: BitcoinHeaderSource; batch?: BatchDataSource } = {}): BatchedClaimSources {
  return { headerSource: over.header ?? headerSource(), batchDataSource: over.batch ?? batchDataSource() };
}

const stepOk = (r: { trace: readonly { step: string; ok: boolean }[] }, step: string): boolean | undefined =>
  r.trace.find((e) => e.step === step)?.ok;
const reached = (r: { trace: readonly { step: string }[] }, step: string): boolean =>
  r.trace.some((e) => e.step === step);

describe("I-HARNESS enforceBatchedClaim — end-to-end batched-claim enforcement", () => {
  it("accepts an honest claim: every stage ok, a clean trace, and a name-state delta", () => {
    const r = enforceBatchedClaim(claim(), sources());
    expect(r.accepted).toBe(true);
    expect(r.reason).toBe("batched-claim-accepted");
    expect(r.trace.every((e) => e.ok)).toBe(true);
    expect(r.nameStateDelta).toEqual({ anchoredRoot: ANCHORED_ROOT, firstServableHeight: ANCHOR_HEIGHT });
  });

  it("is pure + deterministic — identical inputs give a byte-identical result", () => {
    expect(enforceBatchedClaim(claim(), sources())).toEqual(enforceBatchedClaim(claim(), sources()));
  });

  it("rejects absent / corrupt Bitcoin inclusion at the inclusion step", () => {
    const r = enforceBatchedClaim(claim({ proofBundle: {} }), sources());
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
  });

  it("rejects a stale / noncanonical fixture header at the inclusion step", () => {
    const r = enforceBatchedClaim(claim(), sources({ header: headerSource(() => null) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "inclusion")).toBe(false);
  });

  it("precedence: inclusion failure stops BEFORE availability/completeness are evaluated", () => {
    // A claim bad at inclusion AND missing served bytes must reject at inclusion, never reaching availability.
    const r = enforceBatchedClaim(claim({ proofBundle: {} }), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    expect(stepOk(r, "inclusion")).toBe(false);
    expect(reached(r, "availability")).toBe(false);
    expect(reached(r, "completeness")).toBe(false);
  });

  it("rejects missing served bytes at availability — before any canonical-root accept can stand", () => {
    const r = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "availability")).toBe(false);
    // canonical-root may be evaluated, but it must NOT yield an accepted claim without availability.
    expect(reached(r, "completeness")).toBe(false);
  });

  it("rejects a wrong leaf count (N-1 / N+1 / duplicate) at the completeness step", () => {
    const nMinus1 = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => [LEAVES[0]!] }) }));
    expect(nMinus1.accepted).toBe(false);
    expect(stepOk(nMinus1, "completeness")).toBe(false);

    const nPlus1 = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => [...LEAVES, { keyHex: "c3".repeat(32), valueHex: "d3".repeat(32) }] }) }));
    expect(stepOk(nPlus1, "completeness")).toBe(false);

    const dup = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => [LEAVES[0]!, LEAVES[0]!] }) }));
    expect(stepOk(dup, "completeness")).toBe(false);
  });

  it("precedence: completeness failure stops BEFORE any name-state delta is produced", () => {
    const r = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => [LEAVES[0]!] }) }));
    expect(r.accepted).toBe(false);
    expect(stepOk(r, "completeness")).toBe(false);
    expect(r.nameStateDelta).toBeUndefined();
  });

  it("no non-content channel: only the actual served content flips a reject to accept (no timestamp/receipt revival)", () => {
    // Identical honest claim; the ONLY difference is whether the content is present. Withheld → reject;
    // present → accept. There is no source-timestamp / receipt seam that could substitute for content.
    const withheld = enforceBatchedClaim(claim(), sources({ batch: batchDataSource({ servedLeavesForRoot: () => null }) }));
    const present = enforceBatchedClaim(claim(), sources());
    expect(withheld.accepted).toBe(false);
    expect(present.accepted).toBe(true);
  });

  it("the trace preserves the underlying audited reason at the failed step (top-level reason may wrap, never erase)", () => {
    const r = enforceBatchedClaim(claim({ proofBundle: {} }), sources());
    const inclusion = r.trace.find((e) => e.step === "inclusion");
    expect(inclusion?.ok).toBe(false);
    expect(typeof inclusion?.reason).toBe("string");
    expect(inclusion?.reason.length).toBeGreaterThan(0);
    expect(r.reason).toContain(inclusion!.reason);
  });
});
