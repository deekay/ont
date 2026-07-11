import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { bytesToHex, encodeEvent, EventType, type RootAnchorEvent } from "@ont/wire";
import { describe, expect, it } from "vitest";

import {
  createEmptyState,
  reduceBlock,
  type BondBackedNameRecord,
  type ConfirmedBlock,
  type OntState,
  type ProvenanceEventRecord,
  type ResolvedBatchMaterial,
  type ResolvedBlockEvidence,
  type ResolvedBondedAcquisitionFacts,
} from "./engine.js";
import type { LaunchParams } from "./params.js";
import { getClaimedNameStatus } from "./state.js";

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

function bondedAcquisition(
  overrides: Partial<ResolvedBondedAcquisitionFacts> = {}
): ResolvedBondedAcquisitionFacts {
  return {
    acquisitionKind: "bonded",
    claimCommitTxid: h32("b1"),
    claimRevealTxid: h32("b2"),
    claimHeight: 240,
    winningCommitBlockHeight: 200,
    winningCommitTxIndex: 3,
    bondOutpointTxid: h32("b3"),
    bondOutpointVout: 1,
    bondValueSats: 150_000n,
    bondFloorSats: 100_000n,
    maturityHeight: 400,
    ...overrides,
  };
}

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
  return { state, event };
}

function expectBondedRecord(state: OntState, name: string): BondBackedNameRecord {
  const record = state.names.get(name);
  expect(record?.acquisitionKind).toBe("bonded");
  return record as BondBackedNameRecord;
}

describe("reduceBlock Delta B.1 - bonded RootAnchor mint", () => {
  it("mints an immature BondBackedNameRecord from resolved bonded acquisition facts", () => {
    const facts = bondedAcquisition();
    const { state, event } = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: facts }]),
    });

    expect(event).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(expectBondedRecord(state, "david")).toEqual({
      name: "david",
      status: getClaimedNameStatus({
        isRevealConfirmed: true,
        continuityIntact: true,
        currentHeight: ANCHOR_HEIGHT,
        maturityHeight: facts.maturityHeight,
      }),
      currentOwnerPubkey: OWNER,
      acquisitionKind: "bonded",
      claimCommitTxid: facts.claimCommitTxid,
      claimRevealTxid: facts.claimRevealTxid,
      claimHeight: facts.claimHeight,
      maturityHeight: facts.maturityHeight,
      requiredBondSats: facts.bondFloorSats,
      currentBondTxid: facts.bondOutpointTxid,
      currentBondVout: facts.bondOutpointVout,
      currentBondValueSats: facts.bondValueSats,
      lastStateTxid: facts.claimRevealTxid,
      lastStateHeight: facts.claimHeight,
      winningCommitBlockHeight: facts.winningCommitBlockHeight,
      winningCommitTxIndex: facts.winningCommitTxIndex,
    });
    expect(state.names.get("david")).not.toHaveProperty("assuranceProvenance");
  });

  it("composes bonded maturity through getClaimedNameStatus at the reduced block height", () => {
    const facts = bondedAcquisition({ maturityHeight: ANCHOR_HEIGHT });
    const { state } = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: facts }]),
    });

    expect(expectBondedRecord(state, "david").status).toBe(
      getClaimedNameStatus({
        isRevealConfirmed: true,
        continuityIntact: true,
        currentHeight: ANCHOR_HEIGHT,
        maturityHeight: facts.maturityHeight,
      })
    );
    expect(expectBondedRecord(state, "david").status).toBe("mature");
  });

  it("writes short names through bonded acquisition while accumulator short names stay filtered", () => {
    const bonded = reduceRootAnchor({
      material: material([{ name: "bob", ownerPubkey: OWNER, acquisition: bondedAcquisition() }]),
    });
    const accumulator = reduceRootAnchor({
      material: material([{ name: "bob", ownerPubkey: OWNER }]),
    });

    expect(bonded.event).toMatchObject({ validationStatus: "applied" });
    expect(expectBondedRecord(bonded.state, "bob")).toMatchObject({
      acquisitionKind: "bonded",
      currentOwnerPubkey: OWNER,
    });
    expect(accumulator.event).toMatchObject({ validationStatus: "applied" });
    expect(accumulator.state.names.has("bob")).toBe(false);
    expect(accumulator.state.names.size).toBe(0);
  });

  it("rejects a bonded and accumulator duplicate committed name before any write", () => {
    const { state, event } = reduceRootAnchor({
      material: material([
        { name: "alice", ownerPubkey: OWNER, acquisition: bondedAcquisition() },
        { name: "alice", ownerPubkey: OTHER_OWNER },
      ]),
    });

    expect(event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_duplicate_committed_name",
      affectedName: "alice",
    });
    expect(state.names.size).toBe(0);
  });

  it("rejects a bonded committed name that is already claimed", () => {
    const state = createEmptyState();
    const first = reduceRootAnchor({
      state,
      material: material([{ name: "alice", ownerPubkey: OWNER, acquisition: bondedAcquisition() }]),
    });
    const incumbent = state.names.get("alice");
    const second = reduceRootAnchor({
      state,
      tx: rootAnchorTx({ txid: h32("ac") }),
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER, acquisition: bondedAcquisition() }]),
    });

    expect(first.event).toMatchObject({ validationStatus: "applied" });
    expect(second.event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(state.names.get("alice")).toEqual(incumbent);
    expect(state.names.size).toBe(1);
  });
});
