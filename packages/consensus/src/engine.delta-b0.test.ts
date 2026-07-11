import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import { bytesToHex, encodeEvent, EventType, type RootAnchorEvent } from "@ont/wire";
import { describe, expect, it } from "vitest";

import {
  createEmptyState,
  reduceBlock,
  type BondBackedNameRecord,
  type ConfirmedBlock,
  type OntState,
  type ProvenanceEventRecord,
  type ResolvedAcquisitionFacts,
  type ResolvedBatchMaterial,
  type ResolvedBlockEvidence,
} from "./engine.js";
import type { LaunchParams } from "./params.js";

const h32 = (fill: string): string => fill.repeat(32);

const PREV_ROOT = h32("00");
const ROOT = h32("ab");
const OWNER = h32("11");
const OTHER_OWNER = h32("22");
const ANCHOR_HEIGHT = 300;
const PARAMS: LaunchParams = {
  launchHeight: 0,
  daWindow: { K: 3, W: 1, C: 1 },
  availabilityMode: "O1-collapsed",
};
const BONDED_ACQUISITION: ResolvedAcquisitionFacts = {
  acquisitionKind: "bonded",
  claimCommitTxid: h32("b1"),
  claimRevealTxid: h32("b2"),
  bondOutpointTxid: h32("b3"),
  bondOutpointVout: 1,
  bondValueSats: 150_000n,
  bondFloorSats: 100_000n,
  maturityHeight: 400,
};

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

function block(tx: BitcoinTransactionInBlock): ConfirmedBlock {
  return {
    height: tx.blockHeight,
    txs: [tx],
  };
}

function material(entries: ResolvedBatchMaterial["committedEntries"]): ResolvedBatchMaterial {
  return { committedEntries: entries };
}

function evidence(input: {
  readonly batchSize?: number;
  readonly material: ResolvedBatchMaterial;
}): ResolvedBlockEvidence {
  const batchSize = input.batchSize ?? input.material.committedEntries.length;
  return {
    batchMaterialByAnchor: new Map([[ROOT, input.material]]),
    availabilityByAnchor: new Map([
      [
        ROOT,
        {
          anchorHeight: ANCHOR_HEIGHT,
          anchoredRoot: ROOT,
          batchSize,
          firstServableHeight: ANCHOR_HEIGHT,
        },
      ],
    ]),
  };
}

function reduceRootAnchor(input: {
  readonly state?: OntState;
  readonly tx?: BitcoinTransactionInBlock;
  readonly material: ResolvedBatchMaterial;
}): {
  readonly state: OntState;
  readonly event: ProvenanceEventRecord;
  readonly result: ReturnType<typeof reduceBlock>;
} {
  const state = input.state ?? createEmptyState();
  const tx = input.tx ?? rootAnchorTx({ batchSize: input.material.committedEntries.length });
  const result = reduceBlock(
    state,
    block(tx),
    evidence({ batchSize: input.material.committedEntries.length, material: input.material }),
    PARAMS
  );
  const event = result.provenance[0]?.events[0];
  if (event === undefined) {
    throw new Error("expected one RootAnchor provenance event");
  }
  return { state, event, result };
}

function bondedRecord(name: string): BondBackedNameRecord {
  return {
    name,
    status: "mature",
    currentOwnerPubkey: OTHER_OWNER,
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
    lastStateHeight: 200,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
  };
}

describe("reduceBlock Delta B.0 - accumulator write eligibility and acquisition seam", () => {
  it("applies a short-only RootAnchor batch but writes no accumulator name state", () => {
    const { state, event } = reduceRootAnchor({
      material: material([{ name: "bob", ownerPubkey: OWNER }]),
    });

    expect(event).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(state.names.has("bob")).toBe(false);
    expect(state.names.size).toBe(0);
  });

  it("filters only the accumulator write-set for mixed short and long committed entries", () => {
    const mixed = reduceRootAnchor({
      material: material([
        { name: "bob", ownerPubkey: OTHER_OWNER },
        { name: "david", ownerPubkey: OWNER },
      ]),
    });
    const longOnly = reduceRootAnchor({
      tx: rootAnchorTx({ batchSize: 1 }),
      material: material([{ name: "david", ownerPubkey: OWNER }]),
    });

    expect(mixed.event).toMatchObject({
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
    });
    expect(mixed.state.names.has("bob")).toBe(false);
    expect(mixed.state.names.size).toBe(1);
    expect(mixed.state.names.get("david")).toEqual(longOnly.state.names.get("david"));
    expect(mixed.state.names.get("david")).toMatchObject({
      acquisitionKind: "accumulator-batched",
      currentOwnerPubkey: OWNER,
      leafKeyHex: sha256Hex(utf8ToBytes("david")),
    });
  });

  it("still rejects duplicate short committed names before write filtering", () => {
    const { state, event } = reduceRootAnchor({
      material: material([
        { name: "bob", ownerPubkey: OWNER },
        { name: "bob", ownerPubkey: OTHER_OWNER },
      ]),
    });

    expect(event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_duplicate_committed_name",
      affectedName: "bob",
    });
    expect(state.names.size).toBe(0);
  });

  it("still rejects an already-claimed short committed name before write filtering", () => {
    const state = createEmptyState();
    const incumbent = bondedRecord("bob");
    state.names.set("bob", incumbent);
    const { event } = reduceRootAnchor({
      state,
      material: material([
        { name: "bob", ownerPubkey: OWNER },
        { name: "david", ownerPubkey: OWNER },
      ]),
    });

    expect(event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "bob",
    });
    expect(state.names.get("bob")).toEqual(incumbent);
    expect(state.names.has("david")).toBe(false);
    expect(state.names.size).toBe(1);
  });

  it("leaves reducer output byte-identical when per-entry acquisition facts are present but unread", () => {
    const withoutFacts = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER }]),
    });
    const withFacts = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: BONDED_ACQUISITION }]),
    });

    expect(withFacts.result.provenance).toEqual(withoutFacts.result.provenance);
    expect(withFacts.state.names).toEqual(withoutFacts.state.names);
  });
});
