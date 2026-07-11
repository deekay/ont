import type { BitcoinTransactionInBlock } from "@ont/bitcoin";
import { bytesToHex, encodeEvent, EventType, type RootAnchorEvent } from "@ont/wire";
import { describe, expect, it } from "vitest";

import type {
  AuctionResolutionTranscript,
  AuctionTranscriptCompleteness,
} from "./auction-resolution.js";
import {
  createEmptyState,
  reduceBlock,
  type BondBackedNameRecord,
  type ConfirmedBlock,
  type OntState,
  type ProvenanceEventRecord,
  type ResolvedAuctionAcquisitionFacts,
  type ResolvedBatchMaterial,
  type ResolvedBlockEvidence,
  type ResolvedBondedAcquisitionFacts,
} from "./engine.js";
import type { LaunchParams } from "./params.js";
import { getClaimedNameStatus } from "./state.js";

const h32 = (fill: string): string => fill.repeat(32);

const PREV_ROOT = h32("00");
const ROOT = h32("ab");
const ALT_ROOT = h32("bc");
const OTHER_ROOT = h32("cd");
const OWNER = h32("11");
const OTHER_OWNER = h32("22");
const ANCHOR_HEIGHT = 300;
const PARAMS: LaunchParams = {
  launchHeight: 0,
  daWindow: { K: 3, W: 1, C: 1 },
  availabilityMode: "O1-collapsed",
};

const COMPLETE: AuctionTranscriptCompleteness = { complete: true, reason: "transcript-complete" };

function auctionTranscript(input: {
  readonly txid?: string;
  readonly bondVout?: number;
  readonly bidderPubkey?: string;
  readonly bidAmountSats?: bigint;
  readonly accepted?: boolean;
  readonly blockHeight?: number;
  readonly txIndex?: number;
} = {}): AuctionResolutionTranscript {
  return {
    bids: [{
      txid: input.txid ?? h32("d1"),
      bondVout: input.bondVout ?? 2,
      bidderPubkey: input.bidderPubkey ?? OWNER,
      bidAmountSats: input.bidAmountSats ?? 200_000n,
      accepted: input.accepted ?? true,
      blockHeight: input.blockHeight ?? 210,
      txIndex: input.txIndex ?? 4,
    }],
  };
}

function auctionAcquisition(
  overrides: Partial<ResolvedAuctionAcquisitionFacts> = {}
): ResolvedAuctionAcquisitionFacts {
  const winningBidTxid = overrides.winningBidTxid ?? h32("d1");
  const winningBidBondVout = overrides.winningBidBondVout ?? 2;

  return {
    acquisitionKind: "auction",
    claimCommitTxid: h32("c1"),
    claimRevealTxid: h32("c2"),
    claimHeight: 240,
    winningCommitBlockHeight: 200,
    winningCommitTxIndex: 3,
    bondOutpointTxid: winningBidTxid,
    bondOutpointVout: winningBidBondVout,
    bondValueSats: 200_000n,
    bondFloorSats: 100_000n,
    maturityHeight: 400,
    auctionId: h32("c4"),
    auctionLotCommitment: h32("c5"),
    winningBidderCommitment: h32("c6"),
    winningBidTxid,
    winningBidBondVout,
    bondReleaseHeight: 10_000,
    transcript: auctionTranscript({ txid: winningBidTxid, bondVout: winningBidBondVout }),
    completeness: COMPLETE,
    ...overrides,
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
  readonly root?: string;
  readonly batchSize?: number;
  readonly material: ResolvedBatchMaterial;
}): ResolvedBlockEvidence {
  const root = input.root ?? ROOT;
  const batchSize = input.batchSize ?? input.material.committedEntries.length;
  return {
    batchMaterialByAnchor: new Map([[root, input.material]]),
    availabilityByAnchor: new Map([
      [
        root,
        {
          anchorHeight: ANCHOR_HEIGHT,
          anchoredRoot: root,
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
  readonly root?: string;
  readonly material: ResolvedBatchMaterial;
}): {
  readonly state: OntState;
  readonly event: ProvenanceEventRecord;
} {
  const state = input.state ?? createEmptyState();
  const root = input.root ?? ROOT;
  const tx = input.tx ?? rootAnchorTx({ newRoot: root, batchSize: input.material.committedEntries.length });
  const result = reduceBlock(
    state,
    block(tx),
    evidence({ root, batchSize: input.material.committedEntries.length, material: input.material }),
    PARAMS
  );
  const event = result.provenance[0]?.events[0];
  if (event === undefined) {
    throw new Error("expected one RootAnchor provenance event");
  }
  return { state, event };
}

function expectBondBackedRecord(state: OntState, name: string): BondBackedNameRecord {
  const record = state.names.get(name);
  expect(record?.acquisitionKind === "bonded" || record?.acquisitionKind === "auction").toBe(true);
  return record as BondBackedNameRecord;
}

describe("reduceBlock Delta B.2 - auction RootAnchor mint", () => {
  it("mints an auction BondBackedNameRecord only after recomputing the selected winner", () => {
    const facts = auctionAcquisition();
    const { state, event } = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: facts }]),
    });

    expect(event).toMatchObject({
      typeName: "ROOT_ANCHOR",
      validationStatus: "applied",
      reason: "root_anchor_batch_minted",
      affectedName: null,
    });
    expect(expectBondBackedRecord(state, "david")).toEqual({
      name: "david",
      status: getClaimedNameStatus({
        isRevealConfirmed: true,
        continuityIntact: true,
        currentHeight: ANCHOR_HEIGHT,
        maturityHeight: facts.maturityHeight,
      }),
      currentOwnerPubkey: OWNER,
      acquisitionKind: "auction",
      acquisitionAuctionId: facts.auctionId,
      acquisitionAuctionLotCommitment: facts.auctionLotCommitment,
      acquisitionAuctionBidTxid: facts.winningBidTxid,
      acquisitionAuctionBidderCommitment: facts.winningBidderCommitment,
      acquisitionBondReleaseHeight: facts.bondReleaseHeight,
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

  it("writes short names through selected auction acquisition while accumulator short names stay filtered", () => {
    const auction = reduceRootAnchor({
      material: material([{ name: "bob", ownerPubkey: OWNER, acquisition: auctionAcquisition() }]),
    });
    const accumulator = reduceRootAnchor({
      material: material([{ name: "bob", ownerPubkey: OWNER }]),
    });

    expect(auction.event).toMatchObject({ validationStatus: "applied" });
    expect(expectBondBackedRecord(auction.state, "bob")).toMatchObject({
      acquisitionKind: "auction",
      currentOwnerPubkey: OWNER,
    });
    expect(accumulator.event).toMatchObject({ validationStatus: "applied" });
    expect(accumulator.state.names.has("bob")).toBe(false);
  });

  it("fails closed when the declared auction winner is not the selected transcript winner", () => {
    const lowerDeclaredTxid = h32("d1");
    const selectedTxid = h32("d2");
    const facts = auctionAcquisition({
      winningBidTxid: lowerDeclaredTxid,
      winningBidBondVout: 1,
      bondOutpointTxid: lowerDeclaredTxid,
      bondOutpointVout: 1,
      transcript: {
        bids: [
          ...auctionTranscript({
            txid: lowerDeclaredTxid,
            bondVout: 1,
            bidderPubkey: OWNER,
            bidAmountSats: 100_000n,
            txIndex: 1,
          }).bids,
          ...auctionTranscript({
            txid: selectedTxid,
            bondVout: 2,
            bidderPubkey: OTHER_OWNER,
            bidAmountSats: 200_000n,
            txIndex: 2,
          }).bids,
        ],
      },
    });
    const { state, event } = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: facts }]),
    });

    expect(event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_auction_winner_not_selected",
      affectedName: "david",
    });
    expect(state.names.size).toBe(0);
  });

  it("fails closed when the selected winner owner does not match the committed entry owner", () => {
    const facts = auctionAcquisition({
      transcript: auctionTranscript({ bidderPubkey: OTHER_OWNER }),
    });
    const { state, event } = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: facts }]),
    });

    expect(event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_auction_winner_owner_mismatch",
      affectedName: "david",
    });
    expect(state.names.size).toBe(0);
  });

  it("fails closed when the auction transcript is incomplete", () => {
    const facts = auctionAcquisition({
      completeness: { complete: false, reason: "incomplete" },
    });
    const { state, event } = reduceRootAnchor({
      material: material([{ name: "david", ownerPubkey: OWNER, acquisition: facts }]),
    });

    expect(event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_auction_winner_not_selected",
      affectedName: "david",
    });
    expect(state.names.size).toBe(0);
  });

  it("replays an auction branch blocking accumulator and bonded claims, then lets each apply when auction drops", () => {
    const withAuction = createEmptyState();
    const auctionMint = reduceRootAnchor({
      state: withAuction,
      root: ROOT,
      material: material([{ name: "alice", ownerPubkey: OWNER, acquisition: auctionAcquisition() }]),
    });
    const accumulatorBlocked = reduceRootAnchor({
      state: withAuction,
      root: ALT_ROOT,
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER }]),
    });
    const bondedBlocked = reduceRootAnchor({
      state: withAuction,
      root: OTHER_ROOT,
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER, acquisition: bondedAcquisition() }]),
    });

    const accumulatorReplay = reduceRootAnchor({
      root: ALT_ROOT,
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER }]),
    });
    const bondedReplay = reduceRootAnchor({
      root: OTHER_ROOT,
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER, acquisition: bondedAcquisition() }]),
    });

    expect(auctionMint.event).toMatchObject({ validationStatus: "applied" });
    expect(accumulatorBlocked.event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(bondedBlocked.event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(withAuction.names.get("alice")).toMatchObject({
      acquisitionKind: "auction",
      currentOwnerPubkey: OWNER,
    });
    expect(accumulatorReplay.event).toMatchObject({ validationStatus: "applied" });
    expect(accumulatorReplay.state.names.get("alice")).toMatchObject({
      acquisitionKind: "accumulator-batched",
      currentOwnerPubkey: OTHER_OWNER,
    });
    expect(bondedReplay.event).toMatchObject({ validationStatus: "applied" });
    expect(bondedReplay.state.names.get("alice")).toMatchObject({
      acquisitionKind: "bonded",
      currentOwnerPubkey: OTHER_OWNER,
    });
  });

  it("replays accumulator and bonded branches blocking auction, then lets auction apply when either branch drops", () => {
    const withAccumulator = createEmptyState();
    const accumulatorMint = reduceRootAnchor({
      state: withAccumulator,
      root: ALT_ROOT,
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER }]),
    });
    const auctionBlockedByAccumulator = reduceRootAnchor({
      state: withAccumulator,
      root: ROOT,
      material: material([{ name: "alice", ownerPubkey: OWNER, acquisition: auctionAcquisition() }]),
    });

    const withBonded = createEmptyState();
    const bondedMint = reduceRootAnchor({
      state: withBonded,
      root: OTHER_ROOT,
      material: material([{ name: "alice", ownerPubkey: OTHER_OWNER, acquisition: bondedAcquisition() }]),
    });
    const auctionBlockedByBonded = reduceRootAnchor({
      state: withBonded,
      root: ROOT,
      material: material([{ name: "alice", ownerPubkey: OWNER, acquisition: auctionAcquisition() }]),
    });

    const auctionReplayFromAccumulatorDrop = reduceRootAnchor({
      root: ROOT,
      material: material([{ name: "alice", ownerPubkey: OWNER, acquisition: auctionAcquisition() }]),
    });
    const auctionReplayFromBondedDrop = reduceRootAnchor({
      root: ROOT,
      material: material([{ name: "alice", ownerPubkey: OWNER, acquisition: auctionAcquisition() }]),
    });

    expect(accumulatorMint.event).toMatchObject({ validationStatus: "applied" });
    expect(auctionBlockedByAccumulator.event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(withAccumulator.names.get("alice")).toMatchObject({
      acquisitionKind: "accumulator-batched",
      currentOwnerPubkey: OTHER_OWNER,
    });
    expect(bondedMint.event).toMatchObject({ validationStatus: "applied" });
    expect(auctionBlockedByBonded.event).toMatchObject({
      validationStatus: "ignored",
      reason: "root_anchor_name_already_claimed",
      affectedName: "alice",
    });
    expect(withBonded.names.get("alice")).toMatchObject({
      acquisitionKind: "bonded",
      currentOwnerPubkey: OTHER_OWNER,
    });
    expect(auctionReplayFromAccumulatorDrop.event).toMatchObject({ validationStatus: "applied" });
    expect(auctionReplayFromAccumulatorDrop.state.names.get("alice")).toMatchObject({
      acquisitionKind: "auction",
      currentOwnerPubkey: OWNER,
    });
    expect(auctionReplayFromBondedDrop.event).toMatchObject({ validationStatus: "applied" });
    expect(auctionReplayFromBondedDrop.state.names.get("alice")).toMatchObject({
      acquisitionKind: "auction",
      currentOwnerPubkey: OWNER,
    });
  });
});
