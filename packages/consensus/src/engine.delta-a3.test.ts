import type {
  BitcoinTransactionInBlock,
  BitcoinTransactionInput,
  BitcoinTransactionOutput,
} from "@ont/bitcoin";
import {
  deriveOwnerPubkey,
  sha256Hex,
  signTransferAuthorization,
  utf8ToBytes,
  type TransferAuthorizationFields,
} from "@ont/protocol";
import {
  bytesToHex,
  encodeEvent,
  EventType,
  type RootAnchorEvent,
  type TransferEvent,
} from "@ont/wire";
import { describe, expect, it } from "vitest";

import {
  createEmptyState,
  reduceBlock,
  type AccumulatorBatchedNameRecord,
  type BondBackedNameRecord,
  type ConfirmedBlock,
  type NameRecord,
  type OntState,
  type ProvenanceEventRecord,
  type ResolvedBatchMaterial,
  type ResolvedBlockEvidence,
  type ResolvedBondedAcquisitionFacts,
} from "./engine.js";
import type { LaunchParams } from "./params.js";

const h32 = (fill: string): string => fill.repeat(32);

const PREV_ROOT = h32("00");
const ROOT = h32("ab");
const PRIORITY_ROOT = h32("bc");
const OWNER_PRIV = h32("01");
const OWNER = deriveOwnerPubkey(OWNER_PRIV);
const OTHER_OWNER = deriveOwnerPubkey(h32("02"));
const PRIORITY_OWNER = deriveOwnerPubkey(h32("03"));
const ANCHOR_HEIGHT = 300;
const OLD_BOND_TXID = h32("cc");
const OLD_HEAD_TXID = h32("dd");
const PARAMS: LaunchParams = {
  launchHeight: 0,
  daWindow: { K: 3, W: 1, C: 1 },
  availabilityMode: "O1-collapsed",
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
    batchMaterialByAnchor: new Map([[root, input.material ?? material()]]),
    availabilityByAnchor: new Map([[root, availability]]),
  };
}

function rootAnchorBlock(input: {
  readonly tx?: BitcoinTransactionInBlock;
} = {}): ConfirmedBlock {
  const tx = input.tx ?? rootAnchorTx();
  return {
    height: tx.blockHeight,
    txs: [tx],
  };
}

function stateWith(...records: readonly NameRecord[]): OntState {
  const state = createEmptyState();
  for (const record of records) {
    state.names.set(record.name, record);
  }
  return state;
}

function cloneState(state: OntState): OntState {
  return {
    names: new Map(state.names),
  };
}

function priorityRecord(input: {
  readonly name?: string;
  readonly acquisitionKind?: BondBackedNameRecord["acquisitionKind"];
  readonly ownerPubkey?: string;
  readonly status?: BondBackedNameRecord["status"];
  readonly maturityHeight?: number;
  readonly lastStateTxid?: string;
} = {}): BondBackedNameRecord {
  const acquisitionKind = input.acquisitionKind ?? "auction";
  const base = {
    name: input.name ?? "alice",
    status: input.status ?? "mature",
    currentOwnerPubkey: input.ownerPubkey ?? PRIORITY_OWNER,
    acquisitionKind,
    claimCommitTxid: h32("23"),
    claimRevealTxid: h32("24"),
    claimHeight: 100,
    maturityHeight: input.maturityHeight ?? 200,
    requiredBondSats: 50_000n,
    currentBondTxid: OLD_BOND_TXID,
    currentBondVout: 0,
    currentBondValueSats: 50_000n,
    lastStateTxid: input.lastStateTxid ?? h32("26"),
    lastStateHeight: 100,
    winningCommitBlockHeight: 100,
    winningCommitTxIndex: 0,
  } satisfies BondBackedNameRecord;

  if (acquisitionKind !== "auction") {
    return base;
  }

  return {
    ...base,
    acquisitionAuctionId: h32("31"),
    acquisitionAuctionLotCommitment: h32("32"),
    acquisitionAuctionBidTxid: h32("33"),
    acquisitionAuctionBidderCommitment: h32("34"),
    acquisitionBondReleaseHeight: 10_000,
  };
}

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
    maturityHeight: ANCHOR_HEIGHT + 100,
    ...overrides,
  };
}

function onlyRootAnchorEvent(result: ReturnType<typeof reduceBlock>): ProvenanceEventRecord {
  const rootAnchorEvents = result.provenance.flatMap((record) =>
    record.events.filter((event) => event.typeName === "ROOT_ANCHOR")
  );

  expect(rootAnchorEvents).toHaveLength(1);
  const event = rootAnchorEvents[0];
  if (event === undefined) {
    throw new Error("expected one RootAnchor event");
  }
  return event;
}

function accumulatorRecord(state: OntState, name = "alice"): AccumulatorBatchedNameRecord {
  const record = state.names.get(name);
  expect(record?.acquisitionKind).toBe("accumulator-batched");
  return record as AccumulatorBatchedNameRecord;
}

function opReturn(payload: RootAnchorEvent | TransferEvent): BitcoinTransactionOutput {
  return { valueSats: 0n, scriptType: "op_return", dataHex: bytesToHex(encodeEvent(payload)) };
}

function payment(valueSats: bigint): BitcoinTransactionOutput {
  return { valueSats, scriptType: "payment" };
}

function bondInput(txid: string, vout: number): BitcoinTransactionInput {
  return { txid, vout, coinbase: false };
}

function transferTx(input: {
  readonly txid?: string;
  readonly blockHeight?: number;
  readonly txIndex?: number;
} = {}): BitcoinTransactionInBlock {
  const fields: TransferAuthorizationFields = {
    prevStateTxid: OLD_HEAD_TXID,
    newOwnerPubkey: OTHER_OWNER,
    flags: 0,
    successorBondVout: 1,
  };
  const payload: TransferEvent = {
    type: EventType.Transfer,
    ...fields,
    signature: signTransferAuthorization({ ...fields, ownerPrivateKeyHex: OWNER_PRIV }),
  };

  return {
    tx: {
      txid: input.txid ?? h32("bb"),
      inputs: [bondInput(OLD_BOND_TXID, 0)],
      outputs: [opReturn(payload), payment(50_000n)],
    },
    blockHeight: input.blockHeight ?? ANCHOR_HEIGHT,
    txIndex: input.txIndex ?? 0,
  };
}

describe("reduceBlock Delta A.3 - cross-kind RootAnchor precedence", () => {
  it("blocks accumulator creation against an auction incumbent and preserves the priority record", () => {
    const incumbent = priorityRecord({ acquisitionKind: "auction" });
    const state = stateWith(incumbent);
    const result = reduceBlock(state, rootAnchorBlock(), evidence(), PARAMS);

    expect(onlyRootAnchorEvent(result)).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(state.names.size).toBe(1);
    expect(state.names.get("alice")).toStrictEqual(incumbent);
    expect(state.names.get("alice")).not.toHaveProperty("assuranceProvenance");
  });

  it("rejects a mixed batch atomically when any accumulator entry collides with a priority incumbent", () => {
    const incumbent = priorityRecord({ acquisitionKind: "auction" });
    const state = stateWith(incumbent);
    const tx = rootAnchorTx({ batchSize: 2 });
    const result = reduceBlock(
      state,
      rootAnchorBlock({ tx }),
      evidence({
        batchSize: 2,
        material: material([
          { name: "alice", ownerPubkey: OWNER },
          { name: "bob", ownerPubkey: OTHER_OWNER },
        ]),
      }),
      PARAMS
    );

    expect(onlyRootAnchorEvent(result)).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect([...state.names.keys()]).toEqual(["alice"]);
    expect(state.names.get("alice")).toStrictEqual(incumbent);
    expect(state.names.has("bob")).toBe(false);
  });

  it("replays a bonded-priority branch and lets the accumulator claim apply when that branch drops", () => {
    const sharedSnapshot = createEmptyState();
    const bondedTx = rootAnchorTx({ txid: h32("a1"), newRoot: PRIORITY_ROOT });
    const bondedEvidence = evidence({
      root: PRIORITY_ROOT,
      availabilityRoot: PRIORITY_ROOT,
      material: material([
        {
          name: "alice",
          ownerPubkey: PRIORITY_OWNER,
          acquisition: bondedAcquisition(),
        },
      ]),
    });
    const accumulatorTx = rootAnchorTx({ txid: h32("a2") });
    const accumulatorEvidence = evidence();

    const withPriorityBranch = cloneState(sharedSnapshot);
    const priorityMint = reduceBlock(
      withPriorityBranch,
      rootAnchorBlock({ tx: bondedTx }),
      bondedEvidence,
      PARAMS
    );
    const blocked = reduceBlock(
      withPriorityBranch,
      rootAnchorBlock({ tx: accumulatorTx }),
      accumulatorEvidence,
      PARAMS
    );

    const withoutPriorityBranch = cloneState(sharedSnapshot);
    const applied = reduceBlock(
      withoutPriorityBranch,
      rootAnchorBlock({ tx: accumulatorTx }),
      accumulatorEvidence,
      PARAMS
    );

    expect(sharedSnapshot.names.size).toBe(0);
    expect(onlyRootAnchorEvent(priorityMint)).toMatchObject({
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(withPriorityBranch.names.get("alice")).toMatchObject({
      acquisitionKind: "bonded",
      currentOwnerPubkey: PRIORITY_OWNER,
    });
    expect(onlyRootAnchorEvent(blocked)).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(withPriorityBranch.names.get("alice")).toMatchObject({
      acquisitionKind: "bonded",
      currentOwnerPubkey: PRIORITY_OWNER,
    });
    expect(onlyRootAnchorEvent(applied)).toMatchObject({
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(accumulatorRecord(withoutPriorityBranch)).toMatchObject({
      name: "alice",
      status: "mature",
      currentOwnerPubkey: OWNER,
      acquisitionKind: "accumulator-batched",
      firstServableHeight: ANCHOR_HEIGHT,
      anchoredRoot: ROOT,
      leafKeyHex: sha256Hex(utf8ToBytes("alice")),
      assuranceProvenance: {
        tier: "accumulator-batched",
        priorityBearing: false,
        finalizedAtHeight: ANCHOR_HEIGHT,
        anchorHeight: ANCHOR_HEIGHT,
      },
    });
  });

  it("replays an accumulator branch and lets bonded priority apply when that branch drops", () => {
    const sharedSnapshot = createEmptyState();
    const accumulatorTx = rootAnchorTx({ txid: h32("a3") });
    const accumulatorEvidence = evidence();
    const bondedTx = rootAnchorTx({ txid: h32("a4"), newRoot: PRIORITY_ROOT });
    const bondedEvidence = evidence({
      root: PRIORITY_ROOT,
      availabilityRoot: PRIORITY_ROOT,
      material: material([
        {
          name: "alice",
          ownerPubkey: PRIORITY_OWNER,
          acquisition: bondedAcquisition(),
        },
      ]),
    });

    const withAccumulatorBranch = cloneState(sharedSnapshot);
    const accumulatorMint = reduceBlock(
      withAccumulatorBranch,
      rootAnchorBlock({ tx: accumulatorTx }),
      accumulatorEvidence,
      PARAMS
    );
    const bondedBlocked = reduceBlock(
      withAccumulatorBranch,
      rootAnchorBlock({ tx: bondedTx }),
      bondedEvidence,
      PARAMS
    );

    const withoutAccumulatorBranch = cloneState(sharedSnapshot);
    const bondedApplied = reduceBlock(
      withoutAccumulatorBranch,
      rootAnchorBlock({ tx: bondedTx }),
      bondedEvidence,
      PARAMS
    );

    expect(sharedSnapshot.names.size).toBe(0);
    expect(onlyRootAnchorEvent(accumulatorMint)).toMatchObject({
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(accumulatorRecord(withAccumulatorBranch)).toMatchObject({
      acquisitionKind: "accumulator-batched",
      currentOwnerPubkey: OWNER,
    });
    expect(onlyRootAnchorEvent(bondedBlocked)).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(withAccumulatorBranch.names.get("alice")).toMatchObject({
      acquisitionKind: "accumulator-batched",
      currentOwnerPubkey: OWNER,
    });
    expect(onlyRootAnchorEvent(bondedApplied)).toMatchObject({
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(withoutAccumulatorBranch.names.get("alice")).toMatchObject({
      acquisitionKind: "bonded",
      currentOwnerPubkey: PRIORITY_OWNER,
    });
  });

  it("applies an incumbent transition before the same-block accumulator collision is checked", () => {
    const state = stateWith(priorityRecord({
      acquisitionKind: "bonded",
      ownerPubkey: OWNER,
      status: "immature",
      maturityHeight: ANCHOR_HEIGHT + 100,
      lastStateTxid: OLD_HEAD_TXID,
    }));
    const transfer = transferTx({ txIndex: 0 });
    const anchor = rootAnchorTx({ txid: h32("ba"), txIndex: 1 });
    const result = reduceBlock(
      state,
      { height: ANCHOR_HEIGHT, txs: [transfer, anchor] },
      evidence(),
      PARAMS
    );
    const events = result.provenance.flatMap((record) => record.events);

    expect(events).toMatchObject([
      {
        typeName: "TRANSFER",
        validationStatus: "applied",
        reason: "transfer_applied_immature",
        affectedName: "alice",
      },
      {
        typeName: "ROOT_ANCHOR",
        validationStatus: "ignored",
        reason: "root_anchor_name_already_claimed",
        affectedName: "alice",
      },
    ]);
    expect(state.names.get("alice")).toMatchObject({
      acquisitionKind: "bonded",
      status: "immature",
      currentOwnerPubkey: OTHER_OWNER,
      currentBondTxid: transfer.tx.txid,
      lastStateTxid: transfer.tx.txid,
    });
    expect(state.names.get("alice")).not.toHaveProperty("assuranceProvenance");
  });
});
