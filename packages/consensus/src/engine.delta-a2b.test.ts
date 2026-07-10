import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import { bytesToHex, encodeEvent, EventType, type RootAnchorEvent } from "@ont/wire";
import { describe, expect, it } from "vitest";

import {
  applyBlockTransactionsWithProvenance,
  createEmptyState,
  reduceBlock,
  refreshDerivedState,
  type AccumulatorBatchedNameRecord,
  type AssuranceProvenance,
  type BondBackedNameRecord,
  type NameRecord,
  type OntEventApplicationOptions,
  type OntState,
  type ProvenanceEventRecord,
  type ResolvedBatchMaterial,
  type ResolvedBlockEvidence,
} from "./engine.js";
import type { AvailabilityMode, LaunchParams } from "./params.js";

type AcceptsAssuranceProvenance<T extends AssuranceProvenance> = T;

// @ts-expect-error S5: accumulator-batched provenance is never priority-bearing.
type S5AccumulatorPriorityBearingTrueRejected = AcceptsAssuranceProvenance<{
  readonly tier: "accumulator-batched";
  readonly availabilityMode: "O1-collapsed";
  readonly priorityBearing: true;
  readonly finalizedAtHeight: null;
  readonly anchorHeight: 300;
}>;

const packageSrc = dirname(fileURLToPath(import.meta.url));
const h32 = (fill: string): string => fill.repeat(32);

const PREV_ROOT = h32("00");
const ROOT = h32("ab");
const OTHER_ROOT = h32("cd");
const OWNER = h32("11");
const OTHER_OWNER = h32("22");
const ANCHOR_HEIGHT = 300;
const PARAMS: LaunchParams = {
  launchHeight: 0,
  daWindow: { K: 3, W: 1, C: 1 },
  availabilityMode: "O1-collapsed",
};
const ROOT_ANCHOR_REASONS = [
  "root_anchor_no_resolved_evidence",
  "root_anchor_no_availability_mode",
  "root_anchor_availability_mode_unimplemented",
  "root_anchor_raw_material_rejected",
  "root_anchor_no_resolved_material",
  "root_anchor_empty_committed_set",
  "root_anchor_batch_size_mismatch",
  "root_anchor_no_availability_evidence",
  "root_anchor_availability_mismatch",
  "root_anchor_o1_first_servable_height_mismatch",
  "root_anchor_duplicate_committed_name",
  "root_anchor_name_already_claimed",
  "root_anchor_batch_minted",
] as const;

function rootAnchorTx(input: {
  readonly txid?: string;
  readonly blockHeight?: number;
  readonly txIndex?: number;
  readonly newRoot?: string;
  readonly batchSize?: number;
} = {}): BitcoinTransactionInBlock {
  const payload: RootAnchorEvent = {
    type: EventType.RootAnchor,
    prevRoot: PREV_ROOT,
    newRoot: input.newRoot ?? ROOT,
    batchSize: input.batchSize ?? 1,
  };

  return {
    tx: {
      txid: input.txid ?? h32("aa"),
      inputs: [],
      outputs: [{ valueSats: 0n, scriptType: "op_return", dataHex: bytesToHex(encodeEvent(payload)) }],
    },
    blockHeight: input.blockHeight ?? ANCHOR_HEIGHT,
    txIndex: input.txIndex ?? 0,
  };
}

function material(entries: ResolvedBatchMaterial["committedEntries"] = [{ name: "alice", ownerPubkey: OWNER }]): ResolvedBatchMaterial {
  return { committedEntries: entries };
}

function evidence(input: {
  readonly root?: string;
  readonly anchorHeight?: number;
  readonly batchSize?: number;
  readonly firstServableHeight?: number;
  readonly availabilityRoot?: string;
  readonly material?: ResolvedBatchMaterial;
  readonly includeMaterial?: boolean;
  readonly includeAvailability?: boolean;
} = {}): ResolvedBlockEvidence {
  const root = input.root ?? ROOT;
  const batchSize = input.batchSize ?? input.material?.committedEntries.length ?? 1;
  const availability = {
    anchorHeight: input.anchorHeight ?? ANCHOR_HEIGHT,
    anchoredRoot: input.availabilityRoot ?? root,
    batchSize,
    firstServableHeight: input.firstServableHeight ?? input.anchorHeight ?? ANCHOR_HEIGHT,
  };

  return {
    batchMaterialByAnchor: input.includeMaterial === false
      ? new Map()
      : new Map([[root, input.material ?? material()]]),
    availabilityByAnchor: input.includeAvailability === false
      ? new Map()
      : new Map([[root, availability]]),
  };
}

function applyRootAnchorSurface(input: {
  readonly state?: OntState;
  readonly tx?: BitcoinTransactionInBlock;
  readonly rootAnchorEvidence?: ResolvedBlockEvidence;
  readonly availabilityMode?: AvailabilityMode;
}): {
  readonly state: OntState;
  readonly event: ProvenanceEventRecord;
} {
  const state = input.state ?? createEmptyState();
  const options = {
    ...(input.rootAnchorEvidence === undefined ? {} : { rootAnchorEvidence: input.rootAnchorEvidence }),
    ...(input.availabilityMode === undefined ? {} : { availabilityMode: input.availabilityMode }),
  } satisfies OntEventApplicationOptions;
  const provenance = applyBlockTransactionsWithProvenance(
    state,
    [input.tx ?? rootAnchorTx()],
    PARAMS.launchHeight,
    options
  );

  expect(provenance).toHaveLength(1);
  expect(provenance[0]?.events).toHaveLength(1);

  const event = provenance[0]?.events[0];
  if (event === undefined) {
    throw new Error("expected one RootAnchor provenance event");
  }

  return { state, event };
}

function expectIgnoredNoWrites(input: {
  readonly tx?: BitcoinTransactionInBlock;
  readonly rootAnchorEvidence?: ResolvedBlockEvidence;
  readonly availabilityMode?: AvailabilityMode;
  readonly reason: (typeof ROOT_ANCHOR_REASONS)[number];
  readonly affectedName?: string | null;
}): void {
  const { state, event } = applyRootAnchorSurface(input);

  expect(event).toMatchObject({
    typeName: "ROOT_ANCHOR",
    validationStatus: "ignored",
    reason: input.reason,
    affectedName: input.affectedName ?? null,
  });
  expect(state.names.size).toBe(0);
}

function stateWith(...records: readonly NameRecord[]): OntState {
  const state = createEmptyState();
  for (const record of records) {
    state.names.set(record.name, record);
  }
  return state;
}

function bondedRecord(input: {
  readonly name?: string;
  readonly ownerPubkey?: string;
  readonly status?: BondBackedNameRecord["status"];
} = {}): BondBackedNameRecord {
  return {
    name: input.name ?? "alice",
    status: input.status ?? "mature",
    currentOwnerPubkey: input.ownerPubkey ?? OTHER_OWNER,
    acquisitionKind: "bonded",
    claimCommitTxid: h32("23"),
    claimRevealTxid: h32("24"),
    claimHeight: 100,
    maturityHeight: 200,
    requiredBondSats: 50_000n,
    currentBondTxid: h32("25"),
    currentBondVout: 0,
    currentBondValueSats: 50_000n,
    lastStateTxid: h32("26"),
    lastStateHeight: 100,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
  };
}

function accumulatorRecord(input: {
  readonly name?: string;
  readonly status?: AccumulatorBatchedNameRecord["status"];
  readonly firstServableHeight?: number;
  readonly finalizedAtHeight?: number | null;
} = {}): AccumulatorBatchedNameRecord {
  const name = input.name ?? "alice";
  const leafKeyHex = sha256Hex(utf8ToBytes(name));
  return {
    name,
    status: input.status ?? "pending",
    currentOwnerPubkey: OWNER,
    acquisitionKind: "accumulator-batched",
    firstServableHeight: input.firstServableHeight ?? 400,
    anchoredRoot: ROOT,
    leafKeyHex,
    assuranceProvenance: {
      tier: "accumulator-batched",
      availabilityMode: "O1-collapsed",
      priorityBearing: false,
      finalizedAtHeight: input.finalizedAtHeight ?? null,
      anchorHeight: ANCHOR_HEIGHT,
    },
    lastStateTxid: sha256Hex(utf8ToBytes(`${h32("aa")}:${leafKeyHex}`)),
    lastStateHeight: ANCHOR_HEIGHT,
    winningCommitBlockHeight: ANCHOR_HEIGHT,
    winningCommitTxIndex: 0,
  };
}

function expectAccumulatorFinalizationOnlyChanged(
  before: AccumulatorBatchedNameRecord,
  after: AccumulatorBatchedNameRecord,
  input: { readonly status: AccumulatorBatchedNameRecord["status"]; readonly finalizedAtHeight: number | null }
): void {
  const { status: _beforeStatus, assuranceProvenance: beforeProvenance, ...beforeRest } = before;
  const { status: _afterStatus, assuranceProvenance: afterProvenance, ...afterRest } = after;
  const { finalizedAtHeight: _beforeFinalizedAtHeight, ...beforeProvenanceRest } = beforeProvenance;
  const { finalizedAtHeight: _afterFinalizedAtHeight, ...afterProvenanceRest } = afterProvenance;

  expect(after.status).toBe(input.status);
  expect(after.assuranceProvenance.finalizedAtHeight).toBe(input.finalizedAtHeight);
  expect(afterRest).toEqual(beforeRest);
  expect(afterProvenanceRest).toEqual(beforeProvenanceRest);
}

describe("reduceBlock Delta A.2b - RootAnchor acceptance matrix", () => {
  it("keeps the source verdict inventory to the locked 13 RootAnchor reasons", () => {
    const source = readFileSync(resolve(packageSrc, "engine.ts"), "utf8");
    const reasons = new Set(
      [...source.matchAll(/reason: "(root_anchor_[^"]+)"/g)].map((match) => match[1])
    );

    expect([...reasons].sort()).toEqual([...ROOT_ANCHOR_REASONS].sort());
  });

  it("R1 ignores a RootAnchor when no resolved evidence object is supplied", () => {
    expectIgnoredNoWrites({
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_no_resolved_evidence",
    });
  });

  it("R2 ignores a RootAnchor when no availability mode is supplied", () => {
    expectIgnoredNoWrites({
      rootAnchorEvidence: evidence(),
      reason: "root_anchor_no_availability_mode",
    });
  });

  it("R3 ignores non-O1 birth modes without minting", () => {
    expectIgnoredNoWrites({
      rootAnchorEvidence: evidence(),
      availabilityMode: "O2-in-band",
      reason: "root_anchor_availability_mode_unimplemented",
    });
  });

  it("R4 ignores raw-leaf-bearing evidence before consuming resolved material", () => {
    const rawEvidence = {
      ...evidence(),
      baseLeaves: new Map<string, string>(),
    } as unknown as ResolvedBlockEvidence;

    expectIgnoredNoWrites({
      rootAnchorEvidence: rawEvidence,
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_raw_material_rejected",
    });
  });

  it("R5 ignores a RootAnchor without material resolved for its root", () => {
    expectIgnoredNoWrites({
      rootAnchorEvidence: evidence({ includeMaterial: false }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_no_resolved_material",
    });
  });

  it("R6 ignores zero-sized or empty committed batches", () => {
    expectIgnoredNoWrites({
      tx: rootAnchorTx({ batchSize: 0 }),
      rootAnchorEvidence: evidence({ batchSize: 0, material: material([]) }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_empty_committed_set",
    });
  });

  it("R7 ignores non-empty material whose length does not match the RootAnchor batch size", () => {
    expectIgnoredNoWrites({
      tx: rootAnchorTx({ batchSize: 2 }),
      rootAnchorEvidence: evidence({ batchSize: 2, material: material([{ name: "alice", ownerPubkey: OWNER }]) }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_batch_size_mismatch",
    });
  });

  it("R8 ignores material without an availability witness", () => {
    expectIgnoredNoWrites({
      rootAnchorEvidence: evidence({ includeAvailability: false }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_no_availability_evidence",
    });
  });

  it("R9 ignores availability witnesses that do not bind to the RootAnchor", () => {
    expectIgnoredNoWrites({
      rootAnchorEvidence: evidence({ availabilityRoot: OTHER_ROOT }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_availability_mismatch",
    });
  });

  it("R10 ignores O1 witnesses whose first servable height is not the mined height", () => {
    expectIgnoredNoWrites({
      rootAnchorEvidence: evidence({ firstServableHeight: ANCHOR_HEIGHT + 1 }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_o1_first_servable_height_mismatch",
    });
  });

  it("R11 ignores duplicate names inside a batch and identifies the duplicate", () => {
    expectIgnoredNoWrites({
      tx: rootAnchorTx({ batchSize: 2 }),
      rootAnchorEvidence: evidence({
        batchSize: 2,
        material: material([
          { name: "alice", ownerPubkey: OWNER },
          { name: "alice", ownerPubkey: OTHER_OWNER },
        ]),
      }),
      availabilityMode: "O1-collapsed",
      reason: "root_anchor_duplicate_committed_name",
      affectedName: "alice",
    });
  });

  it("R12 and S2 ignore collisions with bonded incumbents without displacing them", () => {
    const incumbent = bondedRecord();
    const state = stateWith(incumbent);
    const { event } = applyRootAnchorSurface({
      state,
      rootAnchorEvidence: evidence(),
      availabilityMode: "O1-collapsed",
    });

    expect(event).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(state.names.size).toBe(1);
    expect(state.names.get("alice")).toEqual(incumbent);
  });

  it("R13 mints the full accumulator batch with literal non-priority assurance provenance", () => {
    const tx = rootAnchorTx({ batchSize: 2 });
    const { state, event } = applyRootAnchorSurface({
      tx,
      rootAnchorEvidence: evidence({
        batchSize: 2,
        material: material([
          { name: "alice", ownerPubkey: OWNER },
          { name: "bob", ownerPubkey: OTHER_OWNER },
        ]),
      }),
      availabilityMode: "O1-collapsed",
    });

    expect(event).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect([...state.names.keys()].sort()).toEqual(["alice", "bob"]);
    expect(state.names.get("alice")).toMatchObject({
      name: "alice",
      status: "pending",
      currentOwnerPubkey: OWNER,
      acquisitionKind: "accumulator-batched",
      firstServableHeight: ANCHOR_HEIGHT,
      anchoredRoot: ROOT,
      leafKeyHex: sha256Hex(utf8ToBytes("alice")),
      assuranceProvenance: {
        tier: "accumulator-batched",
        availabilityMode: "O1-collapsed",
        priorityBearing: false,
        finalizedAtHeight: null,
        anchorHeight: ANCHOR_HEIGHT,
      },
      lastStateTxid: sha256Hex(utf8ToBytes(`${tx.tx.txid}:${sha256Hex(utf8ToBytes("alice"))}`)),
      lastStateHeight: ANCHOR_HEIGHT,
      winningCommitBlockHeight: ANCHOR_HEIGHT,
      winningCommitTxIndex: 0,
    });
    expect(state.names.get("bob")).toMatchObject({
      name: "bob",
      status: "pending",
      currentOwnerPubkey: OTHER_OWNER,
      assuranceProvenance: {
        priorityBearing: false,
        finalizedAtHeight: null,
      },
    });
  });

  it("P1 gives top-level raw-material rejection precedence over batch-size mismatch", () => {
    const tx = rootAnchorTx({ batchSize: 2 });
    const rawMismatchEvidence = {
      ...evidence({ batchSize: 2, material: material([{ name: "alice", ownerPubkey: OWNER }]) }),
      baseLeaves: new Map<string, string>(),
    } as unknown as ResolvedBlockEvidence;
    const rawResult = applyRootAnchorSurface({
      tx,
      rootAnchorEvidence: rawMismatchEvidence,
      availabilityMode: "O1-collapsed",
    });
    const controlResult = applyRootAnchorSurface({
      tx,
      rootAnchorEvidence: evidence({ batchSize: 2, material: material([{ name: "alice", ownerPubkey: OWNER }]) }),
      availabilityMode: "O1-collapsed",
    });

    expect(rawResult.event.reason).toBe("root_anchor_raw_material_rejected");
    expect(rawResult.state.names.size).toBe(0);
    expect(controlResult.event.reason).toBe("root_anchor_batch_size_mismatch");
    expect(controlResult.state.names.size).toBe(0);
  });

  it("S1 rejects a late failing batch member atomically with zero partial writes", () => {
    const state = createEmptyState();
    const { event } = applyRootAnchorSurface({
      state,
      tx: rootAnchorTx({ batchSize: 3 }),
      rootAnchorEvidence: evidence({
        batchSize: 3,
        material: material([
          { name: "alice", ownerPubkey: OWNER },
          { name: "bob", ownerPubkey: OWNER },
          { name: "bob", ownerPubkey: OTHER_OWNER },
        ]),
      }),
      availabilityMode: "O1-collapsed",
    });

    expect(event.reason).toBe("root_anchor_duplicate_committed_name");
    expect(event.affectedName).toBe("bob");
    expect(state.names.size).toBe(0);
  });

  it("S3 treats a second accumulator batch for the same name as first-writer-wins R12", () => {
    const state = createEmptyState();
    const first = applyRootAnchorSurface({
      state,
      rootAnchorEvidence: evidence(),
      availabilityMode: "O1-collapsed",
    });
    const firstRecord = state.names.get("alice");
    const second = applyRootAnchorSurface({
      state,
      tx: rootAnchorTx({ txid: h32("bb"), newRoot: OTHER_ROOT }),
      rootAnchorEvidence: evidence({ root: OTHER_ROOT, availabilityRoot: OTHER_ROOT }),
      availabilityMode: "O1-collapsed",
    });

    expect(first.event.reason).toBe("root_anchor_batch_minted");
    expect(second.event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(state.names.size).toBe(1);
    expect(state.names.get("alice")).toEqual(firstRecord);
  });

  it("S4 re-reduction from a checkpoint drops names whose RootAnchor is absent", () => {
    const withAnchor = createEmptyState();
    const withoutAnchor = createEmptyState();

    reduceBlock(withAnchor, { height: ANCHOR_HEIGHT, txs: [rootAnchorTx()] }, evidence(), PARAMS);
    reduceBlock(withoutAnchor, { height: ANCHOR_HEIGHT, txs: [] }, evidence(), PARAMS);

    expect(withAnchor.names.has("alice")).toBe(true);
    expect(withoutAnchor.names.size).toBe(0);
  });

  it("S5 records accumulator runtime provenance as non-priority-bearing", () => {
    const { state } = applyRootAnchorSurface({
      rootAnchorEvidence: evidence(),
      availabilityMode: "O1-collapsed",
    });

    const record = state.names.get("alice");
    expect(record?.acquisitionKind).toBe("accumulator-batched");
    expect((record as AccumulatorBatchedNameRecord).assuranceProvenance.priorityBearing).toBe(false);
  });

  it("N1 keeps cross-path reorg-symmetric unblocking explicit as a cutover deferral", () => {
    const source = readFileSync(resolve(packageSrc, "engine.ts"), "utf8");

    expect(source).toMatch(/^\s+acquisitionKind: "accumulator-batched"/m);
    expect(source).not.toMatch(/^\s+acquisitionKind: "bonded"/m);
    expect(source).not.toMatch(/^\s+acquisitionKind: "auction"/m);
    expect(source).toContain('reason: "root_anchor_name_already_claimed"');
  });
});

describe("reduceBlock Delta A.2b - accumulator finalization refresh", () => {
  it("F1 finalizes at exact firstServableHeight, preserves tier fields, and never emits immature", () => {
    const firstServableHeight = 400;
    const before = accumulatorRecord({ firstServableHeight });
    const state = stateWith(before);

    refreshDerivedState(state, firstServableHeight + 50);

    const after = state.names.get("alice") as AccumulatorBatchedNameRecord;
    expectAccumulatorFinalizationOnlyChanged(before, after, {
      status: "mature",
      finalizedAtHeight: firstServableHeight,
    });
    expect(after.assuranceProvenance).toEqual({
      tier: "accumulator-batched",
      availabilityMode: "O1-collapsed",
      priorityBearing: false,
      finalizedAtHeight: firstServableHeight,
      anchorHeight: ANCHOR_HEIGHT,
    });
    expect(after.status).not.toBe("immature");
  });

  it("F1 below firstServableHeight stays pending with null finalization on a fresh state", () => {
    const before = accumulatorRecord({ firstServableHeight: 400 });
    const state = stateWith(before);

    refreshDerivedState(state, 399);

    const after = state.names.get("alice") as AccumulatorBatchedNameRecord;
    expectAccumulatorFinalizationOnlyChanged(before, after, {
      status: "pending",
      finalizedAtHeight: null,
    });
    expect(after.status).not.toBe("immature");
  });

  it("F1 recomputes down across the servability boundary without ratcheting", () => {
    const state = stateWith(accumulatorRecord({ firstServableHeight: 400 }));

    refreshDerivedState(state, 450);
    expect(state.names.get("alice")).toMatchObject({
      status: "mature",
      assuranceProvenance: { finalizedAtHeight: 400 },
    });

    refreshDerivedState(state, 399);
    expect(state.names.get("alice")).toMatchObject({
      status: "pending",
      assuranceProvenance: { finalizedAtHeight: null },
    });
  });

  it("F1 computes finalization height independently from invalid status", () => {
    const state = stateWith(accumulatorRecord({ status: "invalid", firstServableHeight: 400 }));

    refreshDerivedState(state, 450);

    expect(state.names.get("alice")).toMatchObject({
      status: "invalid",
      assuranceProvenance: { finalizedAtHeight: 400 },
    });
  });
});
