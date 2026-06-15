import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const authoredDir = join(repoRoot, "docs/core/vectors");
const provisionalDir = join(authoredDir, "provisional");

const areaByPrefix: Record<string, string> = {
  A: "Anchor acceptance",
  D: "DA verdict",
  F: "Gate-fee validation",
  T: "Transcript completeness",
  B: "Batched-path transitions",
  V: "Value-record authority",
  Z: "Reorg re-derivation and replay determinism",
  S: "Settlement consequences (bond release)",
  R: "Recovery authority (arming + cross-object)",
  X: "Transfer authority",
  Q: "Winner selection and bid acceptance",
  G: "Kernel-wide glue (ordering, evidence deadlines, parameter surface)",
};

const requiredTiers = new Set(["normative", "ratified"]);
const allowedTiers = new Set(["normative", "ratified", "candidate"]);
const allowedKinds = new Set(["negative", "positive"]);

// These required vectors have a resident @ont/consensus predicate/test surface
// today. This is deliberately per-vector rather than per-area because areas are
// mixed: e.g. G9 is params-ready, while G1 is still winner-selection work.
const readyBindingTargetById: Record<string, string> = {
  "A1-neg-01": "scanner: ONT frame decode reject/ignore",
  "A3-neg-01": "params: h+K eligibility and K>=W+C construction",
  "A10-neg-01": "b2-boundary: zero host-I/O purity gate",
  "D3-pos-01": "da-verdict: h+W inclusive priority boundary",
  "D3-neg-01": "da-verdict: reorg re-derives the h deadline clock (#49 S1)",
  "D4-neg-01": "da-verdict: absent/insufficient evidence fails closed",
  "D6-neg-01": "da-verdict: h+W+1 forfeits priority",
  "D9-neg-01": "params: reject K<W+C",
  "D12-neg-01": "params: no baked K/W/C constants",
  "D13-pos-01": "da-verdict: h+W and h+W+C inclusive boundaries",
  "F8-pos-01": "gate-fee: pure structural gate over (anchor, batch, fee), no publisher-identity channel",
  "T18-neg-01": "da-verdict: a claim past the h+W holdsPriority deadline does not enter the transcript",
  "B10-neg-01": "da-verdict: DA verdict is a witnessed input, no local-fetch channel",
  "B3-neg-01": "da-verdict: eligible-claim count evaluated at one #49 S1 clock",
  "B4-neg-01": "da-verdict: only DA-includable claims count toward a collision",
  "B1-neg-02": "da-verdict: state re-derives from the witnessed DA verdict, no cache across a flip",
  "B6-neg-01": "bond-qualification: a qualifying bond is at/above the floor; sub-floor is a no-op (#37)",
  "S5-neg-01": "settlement: settlementLockBlocks must equal the protocol maturity parameter (#12)",
  "S15-neg-01": "settlement: ownership materializes only from an accepted winning bid (#37)",
  "Z13-neg-01": "params: #49 S6 strong-form K>=W+C + lower bounds, no baked constant",
  "Z4-neg-01": "params: confirmed-root membership only at depth >= K; sub-K reorg-invariant",
  "Z12-neg-01": "value-record/boundary: no kernel wall-clock; issuedAt opaque, byte-identical replay",
  "T1-neg-01": "transcript-completeness: pure verdict, no out-of-kernel override channel",
  "T2-neg-01": "transcript-completeness: absent/producer-asserted completeness witness fails closed",
  "T21-neg-01": "transcript-completeness: distinct/well-formed L1 bid txids, no silent dedup",
  "G7-neg-01": "b2-boundary: no provenance-less callback or host-I/O seam",
  "G9-neg-01": "params: no defaults and two-parameterization readiness",
  "V1-neg-01": "value-record-authority: issuedAt never compared to host clock (purity)",
  "V3-neg-01": "value-record-authority: v1 signature/domain binding",
  "V4-neg-01": "value-record-authority: ownershipRef binding",
  "V6-neg-01": "value-record-authority: first-record sequence",
  "V7-neg-01": "value-record-authority: sequence monotonicity",
  "V8-neg-01": "value-record-authority: recomputed previous hash",
  "V10-neg-01": "value-record-authority: transfer-clears composition",
  "V11-pos-01": "value-record-authority: issuedAt ignored",
  "X14-neg-01": "value-record: post-transfer authority moves to the new owner (cleared-by-default)",
  "X2-neg-01": "engine: current-owner transfer signature only",
  "X6-neg-01": "engine: successor bond amount threshold",
  "X6-neg-02": "wire/engine: successorBondVout u8 ceiling",
  "X8-pos-01": "engine: mature transfer ignores bond byte",
  "R1-neg-01": "recovery-invoke-authority: acceptRecoverOwner fails closed with no witnessed descriptor evidence",
  "R2-neg-01": "recovery-invoke-authority: arming signature bound to the current owner key (not the descriptor's self-claim)",
  "R7-neg-01": "recovery-invoke-authority: only the v2 descriptor profile is invokable",
  "R9-neg-01": "recovery-invoke-authority: no wallet-proof channel — an invalid W13 event sig still rejects (#50-b1 non-substitution)",
  "R10-neg-01": "recovery-invoke-authority: a replayed arming signature in the invoke slot is rejected",
  "R10-neg-02": "recovery-invoke-authority: a legacy commitment in the signature slot is verified as a signature and rejected",
  "T19-pos-01": "recovery-invoke-authority: a matching challenge-window invoke is admitted (R8 equality)",
  "R18-pos-01": "engine: recovery completion is a deterministic function of (chain height, prior pendingRecovery), via refreshDerivedState",
  "G6-neg-01": "recovery-invoke-authority: pending-create is pure over witnessed evidence — no eval-time availability callback",
  "Q1-pos-01": "auction-resolution: opening bid acceptance is a conjunction and opens the auction only when every clause holds",
  "Q2-pos-01": "auction-resolution: opening floor keys off canonical byte length with <=4 curve / >=5 flat floor",
  "Q3-neg-01": "auction-resolution: bond output value must be >= bid amount; under-bond or missing output rejects (PR-21)",
  "Q4-neg-01": "auction-resolution: OP_RETURN / provably-unspendable bond outputs reject",
  "Q7-neg-01": "auction-resolution: only accepted bids inside the soft-close window extend the close",
  "Q9-pos-01": "auction-resolution: largest accepted bid wins; rejected larger bid cannot win; #25 tie order",
  "Q9-neg-01": "auction-resolution: incomplete transcript fails closed; no next-lower reselection",
  "Q10-neg-01": "auction-resolution: below-floor / non-qualifying bid has null effect",
  "T7-neg-01": "auction-resolution: zero accepted bids yields no auction winner / no owner",
  "T9-neg-01": "auction-resolution: declared lower or phantom winner rejects",
  "G1-pos-01": "auction-resolution: same-block equal-amount tie resolves by lower txIndex (#25)",
  "T17-neg-01": "notice-window: two distinct-owner DA-valid bondless claims nullify; one finalizes; a qualifying bond escalates (#37)",
  "F11-neg-01": "notice-window: collision counting consumes the resolved DA verdict (holdsPriority h+W boundary); two DA-valid bondless claims nullify",
  "T22-neg-01": "reopen-resolution: pure verdict over witnessed bond-break facts — no actor/indexer recognizer; non-latest anchor opens nothing",
  "T22-neg-02": "reopen-resolution: an incomplete bond-continuity witness fails closed before matching",
  "B19-neg-01": "reopen-resolution: release height is kernel-derived from witnessed bond-break facts, not adapter-minted",
  "A11-pos-01": "occupancy: a forfeited (DA-failed) prior insertion does not block re-claim; post-DA-verdict occupancy, insertion-only no-takeover-of-final",
  "B10-pos-01": "batch-exclusion: a DA-excluded batch's leaves vanish uniformly; exclusion removes only that batch, every other name byte-identical, no final unseated",
  "D7-pos-01": "batch-exclusion: excluding a batch yields exactly the as-if-never-anchored state (insert-only state-equivalence, DA §5)",
  "Z9-neg-01": "notice-window/bondInNoticeWindow: the qualifying-bond window test reads the re-derived current-chain mined height (#49 S1); a first-seen-height reading is non-conformant",
  "B14-neg-01": "auction-resolution: a rejected below-minimum soft-close bid does not extend the close (extension is acceptance-only)",
  "B15-pos-01": "auction-resolution: chained accepted soft-close bids extend the close monotonically with no hard cap",
  "S9-neg-01": "reopen-resolution: a reauction bid not anchored to the latest recorded release height does not open/join the live generation",
  "S4-neg-01": "settlement: maturity is the fixed MATURITY_BLOCKS param; an epoch-halving / override value does not settle",
  "Z1-neg-01": "b2-boundary/batch-exclusion: name state is a pure function of (canonical chain + served evidence) only — no local receipt time; arrival-order independent",
  "T20-neg-01": "b2-boundary/notice-window: deadlines are computed from block heights only — no issuedAt / wall-clock input channel",
  "B22-neg-01": "window-schedule: the window length has no market-signal input channel (closed shape) — a market-derived shrink is rejected by construction",
  "Z11-neg-01": "window-schedule: extend-only; a computed window below the height-keyed floor (negative/shrink extension) is rejected; windows reduce only by block height",
  "A6-neg-01": "name-canonicalization: non-canonical leaf name bytes are rejected, never normalized (WIRE §2 / isCanonicalName)",
  "F15-pos-01": "claim-path-eligibility: a name of canonical length <= threshold T is bond-first only; length > T may cheap-claim (PR-15, parameterized)",
  "B7-neg-01": "post-final-attempt: a post-final claim/bond attempt is refused as already-owned with no state effect; the incumbent record is byte-unchanged",
  "B12-neg-01": "lot-commitment-match: a bid whose claimed lot commitment != the WIRE §6 recomputation over (auctionId, name, unlockBlock) is refused (no parallel lot minted)",
  "S6-neg-01": "bond-continuity-break: a pre-maturity bond-outpoint spend with no same-tx valid successor releases the name, regardless of which key signed (no signer channel)",
  "X11-neg-01": "transfer-authority-state: transfer authority requires an owned state; every non-owned lifecycle state (provisional/live-auction/nullified/broken-bond/nonexistent) is non-transferable",
  "S12-pos-01": "engine applyTransfer: a pre-maturity transfer chain preserves maturityHeight byte-identical across every hop (no reset/extend) — conformance binding to resident engine behavior",
  "F9-neg-01": "fee-fact-eligibility: an anchor reorged out before K-depth contributes no fee fact; a K-deep anchor's fee fact is its own intrinsic fee (never an orphan's)",
};

type VectorOrigin = "vector-now" | "provisional-origin";
type BindingState = "ready-for-binding" | "pending-predicate" | "pending-dk";

interface B2Vector {
  id: string;
  ruleId: string;
  area: string;
  authorityTier: string;
  sources: string[];
  kind: string;
  inputs: Record<string, unknown>;
  expected: {
    verdict: string;
    reason: string;
  };
  status: string;
  attackFlagRef: string | null;
  flipMarker: unknown;
  decisionDeps?: unknown;
}

interface LoadedVector extends B2Vector {
  file: string;
  origin: VectorOrigin;
}

interface VectorBindingPlan {
  vector: LoadedVector;
  state: BindingState;
  target: string;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function jsonFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(dir, file))
    .sort();
}

function loadVectorFile(path: string, origin: VectorOrigin): LoadedVector[] {
  const data = readJson(path);
  expect(Array.isArray(data), `${relative(repoRoot, path)} must contain a JSON array`).toBe(true);
  return (data as B2Vector[]).map((vector) => ({
    ...vector,
    file: relative(repoRoot, path),
    origin,
  }));
}

function loadVectors(): LoadedVector[] {
  return [
    ...jsonFilesIn(authoredDir).flatMap((path) => loadVectorFile(path, "vector-now")),
    ...jsonFilesIn(provisionalDir).flatMap((path) => loadVectorFile(path, "provisional-origin")),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

function expectVectorShape(vector: LoadedVector): void {
  const label = `${vector.file}:${vector.id}`;
  expect(vector.id, label).toMatch(/^[A-Z]+[0-9]+[a-z]?-(neg|pos)-[0-9]{2}$/);
  expect(vector.ruleId, label).toMatch(/^(A|D|F|T|B|V|Z|S|R|X|Q|G)[0-9]+[a-z]?$/);
  expect(vector.area, label).toBe(areaByPrefix[vector.ruleId[0] as string]);
  expect(allowedTiers.has(vector.authorityTier), label).toBe(true);
  expect(allowedKinds.has(vector.kind), label).toBe(true);
  expect(vector.status, label).toBe("locked");
  expect(Array.isArray(vector.sources) && vector.sources.length > 0, label).toBe(true);
  expect(typeof vector.inputs === "object" && vector.inputs !== null && !Array.isArray(vector.inputs), label).toBe(true);
  expect(vector.inputs.sourceCategory, label).toBe(vector.origin === "vector-now" ? "vector-now" : "provisional-vector");
  expect(vector.expected.verdict, label).toBe(vector.kind === "negative" ? "reject" : "accept");
  expect(typeof vector.expected.reason === "string" && vector.expected.reason.length > 0, label).toBe(true);
  expect(vector.flipMarker, label).toBeNull();
  expect("decisionDeps" in vector, `${label} should have shed decisionDeps after ratification`).toBe(false);
}

function bindingPlan(vector: LoadedVector): VectorBindingPlan {
  if (!requiredTiers.has(vector.authorityTier)) {
    return {
      vector,
      state: "pending-dk",
      target: "candidate-tier vector; do not execute until DK/spec promotion",
    };
  }

  const target = readyBindingTargetById[vector.id];
  if (target) {
    return { vector, state: "ready-for-binding", target };
  }

  return {
    vector,
    state: "pending-predicate",
    target: "required vector, but its predicate slice is not resident in @ont/consensus yet",
  };
}

function countsBy<T extends string>(values: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

describe("B2 executable vector suite inventory", () => {
  const vectors = loadVectors();
  const plans = vectors.map(bindingPlan);

  it("loads the complete locked B2 vector surface (68 vector-now + 26 provisional-origin)", () => {
    expect(vectors).toHaveLength(94);
    expect(countsBy(vectors.map((vector) => vector.origin))).toEqual({
      "provisional-origin": 26,
      "vector-now": 68,
    });
    expect(countsBy(vectors.map((vector) => (requiredTiers.has(vector.authorityTier) ? "required" : "pending")))).toEqual({
      pending: 8,
      required: 86,
    });
  });

  it("keeps every loaded vector schema-valid for the executable harness", () => {
    const ids = new Set<string>();
    const refs = new Set<string>();

    for (const vector of vectors) {
      expectVectorShape(vector);
      expect(ids.has(vector.id), `${vector.id} duplicated`).toBe(false);
      ids.add(vector.id);
      expect(typeof vector.attackFlagRef === "string" && vector.attackFlagRef.length > 0, `${vector.id} attackFlagRef`).toBe(true);
      expect(refs.has(vector.attackFlagRef as string), `${vector.attackFlagRef} duplicated`).toBe(false);
      refs.add(vector.attackFlagRef as string);
    }
  });

  it("does not execute candidate-tier vectors until DK/spec promotion", () => {
    const pendingDk = plans.filter((plan) => plan.state === "pending-dk");
    expect(pendingDk).toHaveLength(8);
    expect(pendingDk.every((plan) => plan.vector.authorityTier === "candidate")).toBe(true);
  });

  it("declares the first kernel-resident binding queue explicitly", () => {
    const readyIds = new Set(Object.keys(readyBindingTargetById));
    const plansById = new Map(plans.map((plan) => [plan.vector.id, plan]));

    for (const id of readyIds) {
      const plan = plansById.get(id);
      expect(plan, `${id} binding target references a missing vector`).toBeDefined();
      expect(plan?.state, `${id} must be ready-for-binding`).toBe("ready-for-binding");
      expect(requiredTiers.has(plan?.vector.authorityTier ?? ""), `${id} must not bind candidate authority`).toBe(true);
    }

    expect(countsBy(plans.map((plan) => plan.state))).toEqual({
      "pending-dk": 8,
      "pending-predicate": 1,
      "ready-for-binding": 85,
    });
  });

  it("leaves required non-resident vectors visible instead of silently skipping them", () => {
    const pendingRequired = plans
      .filter((plan) => plan.state === "pending-predicate")
      .map((plan) => plan.vector.id)
      .sort();

    expect(pendingRequired).toHaveLength(1);
    // the entire recovery-parked group (R1/R2/R7/R9/R10-01/R10-02/T19 + now R18 completion / G6
    // no-callback purity) is bound to the resident recovery surface — no recovery vector remains.
    // the winner-selection / bid-acceptance group (Q1/Q2/Q3/Q4/Q7/Q9/Q10 + T7/T9/G1) is bound to
    // auction-resolution; the notice-window group (T17/F11) is bound to notice-window — no auction
    // or notice-window vector remains pending-predicate.
    // T2-neg-02 is the SOLE remaining pending-predicate: its soft-close completeness RANGE is a B3
    // witness concern (transcript-completeness is deliberately range-agnostic), so it is B3-deferred
    // and stays a visible pending-predicate target rather than being silently skipped. With every
    // other required vector resident, the B2 audited-core predicate surface is buildable-complete.
    expect(pendingRequired).toEqual(["T2-neg-02"]);
    expect(pendingRequired).not.toContain("T17-neg-01"); // now resident in notice-window
    expect(pendingRequired).not.toContain("F11-neg-01");
    // the reopen/re-auction group (T22/B19) is bound to reopen-resolution — no longer pending.
    expect(pendingRequired).not.toContain("T22-neg-01");
    expect(pendingRequired).not.toContain("T22-neg-02");
    expect(pendingRequired).not.toContain("B19-neg-01");
    // occupancy (A11) is bound to occupancy.ts — no longer pending.
    expect(pendingRequired).not.toContain("A11-pos-01");
    // the DA-locality trio (B10/D7 exclusion locality + Z9 one-clock bond) is now resident.
    expect(pendingRequired).not.toContain("B10-pos-01");
    expect(pendingRequired).not.toContain("D7-pos-01");
    expect(pendingRequired).not.toContain("Z9-neg-01");
    // bind-to-resident closing batch now resident (auction #68 / reopen #70 / settlement #65)
    expect(pendingRequired).not.toContain("B14-neg-01");
    expect(pendingRequired).not.toContain("B15-pos-01");
    expect(pendingRequired).not.toContain("S9-neg-01");
    expect(pendingRequired).not.toContain("S4-neg-01");
    // purity closing batch now resident (structural b2-boundary bindings)
    expect(pendingRequired).not.toContain("Z1-neg-01");
    expect(pendingRequired).not.toContain("T20-neg-01");
    // window-schedule (#74) now resident
    expect(pendingRequired).not.toContain("B22-neg-01");
    expect(pendingRequired).not.toContain("Z11-neg-01");
    // name-canonicalization (#75) + claim-path-eligibility (#76) now resident
    expect(pendingRequired).not.toContain("A6-neg-01");
    expect(pendingRequired).not.toContain("F15-pos-01");
    // post-final-attempt (#77) now resident
    expect(pendingRequired).not.toContain("B7-neg-01");
    // lot-commitment-match (#78) now resident
    expect(pendingRequired).not.toContain("B12-neg-01");
    // bond-continuity-break (#79) + transfer-authority-state (#80) now resident
    expect(pendingRequired).not.toContain("S6-neg-01");
    expect(pendingRequired).not.toContain("X11-neg-01");
    // S12 maturity-preservation now bound to the resident engine transfer path
    expect(pendingRequired).not.toContain("S12-pos-01");
    // fee-fact-eligibility (#81) now resident — the last buildable predicate
    expect(pendingRequired).not.toContain("F9-neg-01");
  });
});
