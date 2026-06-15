import { describe, expect, it } from "vitest";

import {
  acceptAuctionBid,
  openingFloor,
  selectAuctionWinner,
  type AuctionBidFacts,
  type AuctionBondFacts,
  type AuctionParams,
  type AuctionResolutionTranscript,
  type PriorAuctionState,
} from "./auction-resolution.js";

const txid = (byte: string): string => byte.repeat(64);
const pubkey = (byte: string): string => byte.repeat(64);

const params: AuctionParams = {
  baseWindowBlocks: 1_008,
  softCloseWindowBlocks: 144,
  minRaiseSats: 1_000n,
  minRaiseBasisPoints: 500,
  softCloseMinRaiseSats: 1_000n,
  softCloseMinRaiseBasisPoints: 1_000,
};

const lotBinding = { kind: "b3-verified-auction-lot-binding" } as const;
const paymentBond = (valueSats: bigint): AuctionBondFacts => ({
  kind: "b3-verified-bidder-controlled-payment",
  valueSats,
});
const bid = (overrides: Partial<AuctionBidFacts> = {}): AuctionBidFacts => ({
  bidAmountSats: 50_000n,
  minedHeight: 900_000,
  bondVout: 1,
  lotBinding,
  ...overrides,
});
const unopened = (openingFloorSats = 50_000n): PriorAuctionState => ({
  openingFloorSats,
  currentLeaderAmountSats: null,
  currentCloseHeight: null,
});
const opened = (overrides: Partial<PriorAuctionState> = {}): PriorAuctionState => ({
  openingFloorSats: 50_000n,
  currentLeaderAmountSats: 100_000n,
  currentCloseHeight: 901_000,
  ...overrides,
});
const complete = { complete: true, reason: "transcript-complete" } as const;

describe("openingFloor", () => {
  it("uses the <=4 short-name curve and the >=5 flat floor under multiple parameterizations", () => {
    expect(
      openingFloor(
        { canonicalNameByteLength: 4 },
        { oneCharPriceSats: 100_000_000n, longNameFloorSats: 50_000n }
      )
    ).toMatchObject({ computed: true, floorSats: 12_500_000n });
    expect(
      openingFloor(
        { canonicalNameByteLength: 5 },
        { oneCharPriceSats: 100_000_000n, longNameFloorSats: 50_000n }
      )
    ).toMatchObject({ computed: true, floorSats: 50_000n });

    expect(
      openingFloor(
        { canonicalNameByteLength: 4 },
        { oneCharPriceSats: 80_000_000n, longNameFloorSats: 70_000n }
      )
    ).toMatchObject({ computed: true, floorSats: 10_000_000n });
    expect(
      openingFloor(
        { canonicalNameByteLength: 5 },
        { oneCharPriceSats: 80_000_000n, longNameFloorSats: 70_000n }
      )
    ).toMatchObject({ computed: true, floorSats: 70_000n });
  });

  it("fails closed on malformed or non-closed floor inputs", () => {
    expect(openingFloor({ canonicalNameByteLength: 4, source: "catalog" } as never, {
      oneCharPriceSats: 100n,
      longNameFloorSats: 10n,
    }).computed).toBe(false);
    expect(openingFloor({ canonicalNameByteLength: 0 }, { oneCharPriceSats: 100n, longNameFloorSats: 10n }).computed).toBe(false);
    expect(openingFloor({ canonicalNameByteLength: 4 }, { oneCharPriceSats: -1n, longNameFloorSats: 10n }).computed).toBe(false);
  });
});

describe("acceptAuctionBid", () => {
  it("accepts an at-floor opening bid and gives a below-floor bid null effect", () => {
    const accepted = acceptAuctionBid(bid(), paymentBond(50_000n), unopened(), params);
    expect(accepted).toMatchObject({
      accepted: true,
      stateEffect: "opens-auction",
      requiredMinimumBidSats: 50_000n,
      nextLeaderAmountSats: 50_000n,
      nextCloseHeight: 901_008,
    });

    const rejected = acceptAuctionBid(
      bid({ bidAmountSats: 49_999n }),
      paymentBond(49_999n),
      unopened(),
      params
    );
    expect(rejected).toMatchObject({
      accepted: false,
      stateEffect: "none",
      reason: "q10-non-qualifying-bid-null-effect",
      nextCloseHeight: null,
    });
  });

  it("implements PR-21 bond value >= bid amount and fails closed on missing outputs", () => {
    expect(acceptAuctionBid(bid(), paymentBond(50_000n), unopened(), params).accepted).toBe(true);
    expect(acceptAuctionBid(bid(), paymentBond(60_000n), unopened(), params).accepted).toBe(true);
    expect(acceptAuctionBid(bid(), paymentBond(49_999n), unopened(), params)).toMatchObject({
      accepted: false,
      reason: "q3-underbonded-output-rejected",
    });
    expect(acceptAuctionBid(bid(), { kind: "missing", valueSats: null }, unopened(), params)).toMatchObject({
      accepted: false,
      reason: "q3-bond-output-missing",
    });
  });

  it("rejects non-returnable bond outputs even when the value is sufficient", () => {
    for (const kind of ["op_return", "provably-unspendable", "unknown"] as const) {
      expect(acceptAuctionBid(bid(), { kind, valueSats: 50_000n }, unopened(), params)).toMatchObject({
        accepted: false,
        reason: "q4-non-returnable-bond-output-rejected",
      });
    }
  });

  it("uses PR-19 minimum increments and only accepted soft-close bids extend", () => {
    const under = acceptAuctionBid(
      bid({ bidAmountSats: 109_999n, minedHeight: 900_900 }),
      paymentBond(109_999n),
      opened(),
      params
    );
    expect(under).toMatchObject({
      accepted: false,
      reason: "q10-non-qualifying-bid-null-effect",
      nextCloseHeight: 901_000,
    });

    const extended = acceptAuctionBid(
      bid({ bidAmountSats: 110_000n, minedHeight: 900_900 }),
      paymentBond(110_000n),
      opened(),
      params
    );
    expect(extended).toMatchObject({
      accepted: true,
      reason: "q7-accepted-bid-extends-soft-close",
      nextCloseHeight: 901_044,
    });
  });

  it("fails closed on missing lot binding and rejects close+1 bids", () => {
    expect(acceptAuctionBid({ ...bid(), lotBinding: { kind: "producer-asserted" } as never }, paymentBond(50_000n), unopened(), params)).toMatchObject({
      accepted: false,
      reason: "q1-bid-facts-malformed",
    });
    expect(acceptAuctionBid(bid({ bidAmountSats: 200_000n, minedHeight: 901_001 }), paymentBond(200_000n), opened(), params)).toMatchObject({
      accepted: false,
      reason: "q1-auction-closed",
    });
  });
});

describe("selectAuctionWinner", () => {
  const transcript = (bids: AuctionResolutionTranscript["bids"]): AuctionResolutionTranscript => ({ bids });
  const acceptedBid = (overrides: Partial<AuctionResolutionTranscript["bids"][number]> = {}) => ({
    txid: txid("a"),
    bondVout: 1,
    bidderPubkey: pubkey("1"),
    bidAmountSats: 100_000n,
    accepted: true,
    blockHeight: 900_000,
    txIndex: 1,
    ...overrides,
  });

  it("fails closed on incomplete transcripts and zero accepted bids yields no owner", () => {
    expect(selectAuctionWinner(transcript([acceptedBid()]), { complete: false, reason: "incomplete" })).toMatchObject({
      selected: false,
      reason: "q9-incomplete-transcript-no-selection",
    });
    expect(selectAuctionWinner(transcript([{ ...acceptedBid(), accepted: false }]), complete)).toMatchObject({
      selected: false,
      reason: "t7-zero-accepted-bids-no-owner",
    });
  });

  it("selects the largest accepted bid and ignores rejected larger bids", () => {
    const result = selectAuctionWinner(
      transcript([
        acceptedBid({ txid: txid("a"), bidAmountSats: 100_000n, txIndex: 1 }),
        acceptedBid({ txid: txid("b"), bidAmountSats: 200_000n, txIndex: 2 }),
        acceptedBid({ txid: txid("c"), bidAmountSats: 300_000n, accepted: false, txIndex: 3 }),
      ]),
      complete
    );
    expect(result.selected).toBe(true);
    expect(result.winner).toMatchObject({ txid: txid("b"), bidAmountSats: 200_000n });
  });

  it("uses lower txIndex for same-block equal-amount ties", () => {
    const result = selectAuctionWinner(
      transcript([
        acceptedBid({ txid: txid("a"), bidAmountSats: 100_000n, blockHeight: 900_000, txIndex: 5 }),
        acceptedBid({ txid: txid("b"), bidAmountSats: 100_000n, blockHeight: 900_000, txIndex: 2 }),
      ]),
      complete
    );
    expect(result.winner).toMatchObject({ txid: txid("b"), txIndex: 2 });
  });

  it("rejects lower or phantom declared winners", () => {
    const bids = [
      acceptedBid({ txid: txid("a"), bondVout: 1, bidAmountSats: 100_000n }),
      acceptedBid({ txid: txid("b"), bondVout: 2, bidAmountSats: 200_000n }),
    ];
    expect(selectAuctionWinner(transcript(bids), complete, { txid: txid("a"), bondVout: 1 })).toMatchObject({
      selected: false,
      reason: "t9-lower-declared-winner-rejected",
    });
    expect(selectAuctionWinner(transcript(bids), complete, { txid: txid("c"), bondVout: 1 })).toMatchObject({
      selected: false,
      reason: "t9-phantom-winner-rejected",
    });
  });

  it("rejects source fields and malformed bid facts", () => {
    expect(selectAuctionWinner({ bids: [acceptedBid()], source: "catalog" } as never, complete)).toMatchObject({
      selected: false,
      reason: "q9-transcript-malformed",
    });
    expect(selectAuctionWinner(transcript([{ ...acceptedBid(), bidderPubkey: "not-hex" }]), complete)).toMatchObject({
      selected: false,
      reason: "q9-transcript-bid-malformed",
    });
  });
});
