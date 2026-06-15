// D-CW completeness witness + lot block/soft-close range conformance battery (B3 §13 / cw.*;
// ratified PR-19 increment/soft-close/close-boundary + PR-29 close-boundary inclusivity via #66).
// `transcriptCompleteness` RECOMPUTES acceptance by folding the resident `acceptAuctionBid` over the
// witnessed lot bids in canonical (minedHeight, txIndex) order — soft-close extension is
// acceptance-only, so the final close + the in-range set fall out of the fold. It never trusts a
// B3-supplied `effect` (asserted, cross-checked, fail-closed on mismatch). Completeness = symmetric
// set-equality of the counted txid set vs the witnessed in-range lot bids over [openHeight, finalClose].
//
// Tests-first RED battery: positives expect `complete:true`; negatives assert the SPECIFIC cw-*
// reason — both are red against the slice stub (`cw-range-not-implemented`) until the fold lands.
//
// Small launch-freeze params for legible heights: baseWindow=10, softCloseWindow=3, normal
// minRaise=100, soft-close minRaise=200 (soft-close raise is stronger, per AUCTION.md). openingFloor=1000.
import { describe, expect, it } from "vitest";

import type { AuctionBidStateEffect, AuctionBondOutputKind, AuctionParams } from "./auction-resolution.js";
import {
  transcriptCompleteness,
  type AuctionTranscript,
  type CompletenessWitness,
  type CompletenessWitnessBid,
} from "./transcript-completeness.js";

const LOT_BINDING = { kind: "b3-verified-auction-lot-binding" } as const;
const PARAMS: AuctionParams = {
  baseWindowBlocks: 10,
  softCloseWindowBlocks: 3,
  minRaiseSats: 100n,
  minRaiseBasisPoints: 0,
  softCloseMinRaiseSats: 200n,
  softCloseMinRaiseBasisPoints: 0,
};
const LOT = { openingFloorSats: 1000n, params: PARAMS };

const txidFor = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);

const wbid = (
  n: number,
  minedHeight: number,
  bidAmountSats: bigint,
  opts: {
    txIndex?: number;
    bondValueSats?: bigint | null;
    bondKind?: AuctionBondOutputKind;
    effect?: AuctionBidStateEffect;
  } = {},
): CompletenessWitnessBid => ({
  txid: txidFor(n),
  txIndex: opts.txIndex ?? 0,
  bidFacts: { bidAmountSats, minedHeight, bondVout: 0, lotBinding: LOT_BINDING },
  bondFacts: {
    kind: opts.bondKind ?? "b3-verified-bidder-controlled-payment",
    valueSats: opts.bondValueSats === undefined ? bidAmountSats : opts.bondValueSats,
  },
  ...(opts.effect !== undefined ? { effect: opts.effect } : {}),
});

const witness = (
  bids: readonly CompletenessWitnessBid[],
  over: Partial<{ openingFloorSats: bigint; params: AuctionParams; openHeight: number }> = {},
): CompletenessWitness => ({
  kind: "b3-verified-completeness-witness",
  lot: { openingFloorSats: over.openingFloorSats ?? LOT.openingFloorSats, params: over.params ?? LOT.params, ...(over.openHeight !== undefined ? { openHeight: over.openHeight } : {}) },
  bids,
});

const transcript = (ns: readonly number[]): AuctionTranscript => ({ bids: ns.map((n) => ({ txid: txidFor(n) })) });

// Canonical accepted run: opener@100/1000 (close0=110) → raise@105/1100 (not soft-close, no extend)
// → late@108/1300 (soft-close [107,110], extends to 108+3=111). finalClose=111, range [100,111].
const OPENER = wbid(1, 100, 1000n);
const RAISE = wbid(2, 105, 1100n);
const LATE = wbid(3, 108, 1300n);

describe("D-CW completeness witness + soft-close range (B3 §13; PR-19/PR-29 over acceptAuctionBid fold)", () => {
  it("cw.complete: counted set equals the witnessed in-range lot bids ⇒ complete", () => {
    const v = transcriptCompleteness(transcript([1, 2, 3]), witness([OPENER, RAISE, LATE]));
    expect(v).toEqual({ complete: true, reason: "transcript-complete" });
  });

  it("cw.t2-neg-02-hidden-late-accepted: a late accepted bid present in the witness but omitted from the transcript ⇒ incomplete", () => {
    // The hidden late@108 extends close to 111 (computed from the WITNESS, not the count), so it is
    // in-range and its omission makes the transcript incomplete — the hidden-extension attack fails.
    const v = transcriptCompleteness(transcript([1, 2]), witness([OPENER, RAISE, LATE]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-incomplete");
  });

  it("cw.rejected-in-soft-close-no-extend: a rejected soft-close bid does NOT extend the close", () => {
    // lowSoftClose@108/1100 is in the soft-close window but below the soft-close min-raise (1200) ⇒
    // rejected ⇒ no extend (close stays 110). probe@111 is then mined above close ⇒ out of range. The
    // counted set {opener, lowSoftClose} (both in [100,110]) equals the in-range set ⇒ complete.
    const lowSoftClose = wbid(2, 108, 1100n);
    const probe = wbid(3, 111, 2000n);
    const v = transcriptCompleteness(transcript([1, 2]), witness([OPENER, lowSoftClose, probe]));
    expect(v).toEqual({ complete: true, reason: "transcript-complete" });
  });

  it("cw.cascade: a late accepted bid extends the close, bringing a further bid into the new window", () => {
    // opener@100 (110) → late1@108/1300 (→111) → late2@111/1500 (in [108,111], →114) → late3@113/1700
    // (in [111,114], →116). finalClose=116; all four in range.
    const late1 = wbid(2, 108, 1300n);
    const late2 = wbid(3, 111, 1500n);
    const late3 = wbid(4, 113, 1700n);
    const v = transcriptCompleteness(transcript([1, 2, 3, 4]), witness([OPENER, late1, late2, late3]));
    expect(v).toEqual({ complete: true, reason: "transcript-complete" });
  });

  it("cw.boundary-close-extends: a bid mined AT close (inclusive) extends the range (PR-29)", () => {
    // atClose@110/1200 is in the soft-close window [107,110] ⇒ extends to 113; probe@112/1100 is then
    // in-range (≤113) but below soft-close min-raise ⇒ rejected, no further extend. counted == in-range.
    const atClose = wbid(2, 110, 1200n);
    const probe = wbid(3, 112, 1100n);
    const v = transcriptCompleteness(transcript([1, 2, 3]), witness([OPENER, atClose, probe]));
    expect(v).toEqual({ complete: true, reason: "transcript-complete" });
  });

  it("cw.boundary-close-plus-1-rejected: a bid mined at close+1 is auction-closed and out of range", () => {
    // beyond@111/2000 is mined above close (110) ⇒ acceptAuctionBid rejects (auction-closed) and it is
    // out of [100,110]. Counting it ⇒ padded/incomplete; the in-range set is just {opener}.
    const beyond = wbid(2, 111, 2000n);
    const v = transcriptCompleteness(transcript([1, 2]), witness([OPENER, beyond]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-padded");
  });

  it("cw.boundary-start: the soft-close trigger is inclusive at start (close - softCloseWindow)", () => {
    // At 107 (= 110-3, inclusive start) the soft-close min-raise (1200) applies, so b@107/1100 is
    // rejected; it is still an in-range L1 bid (counted). The transcript that counts it is complete.
    const atStart = wbid(2, 107, 1100n);
    const v = transcriptCompleteness(transcript([1, 2]), witness([OPENER, atStart]));
    expect(v).toEqual({ complete: true, reason: "transcript-complete" });
  });

  it("cw.boundary-start-minus-1: just before the window the normal min-raise applies (107-1 not soft-close)", () => {
    // At 106 (= start-1) the normal min-raise (1100) applies, so b@106/1100 is accepted; not in the
    // soft-close window ⇒ no extend. In-range, counted ⇒ complete.
    const beforeStart = wbid(2, 106, 1100n);
    const v = transcriptCompleteness(transcript([1, 2]), witness([OPENER, beforeStart]));
    expect(v).toEqual({ complete: true, reason: "transcript-complete" });
  });

  it("cw.omitted-in-range-accepted: omitting an in-range accepted bid ⇒ incomplete", () => {
    const v = transcriptCompleteness(transcript([1, 3]), witness([OPENER, RAISE, LATE]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-incomplete");
  });

  it("cw.omitted-in-range-rejected: omitting an in-range REJECTED lot bid ⇒ incomplete", () => {
    // lowBid@104/1050 is below the opening leader+raise ⇒ rejected, but it is an in-range L1 lot bid
    // (in [100,110]) and MUST be counted; omitting it is still an incomplete transcript.
    const lowBid = wbid(4, 104, 1050n);
    const v = transcriptCompleteness(transcript([1, 2, 3]), witness([OPENER, RAISE, LATE, lowBid]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-incomplete");
  });

  it("cw.out-of-range-padding: counting a bid mined after the final close ⇒ incomplete", () => {
    // afterClose@130/3000 is far above finalClose (111); counting it pads the transcript.
    const afterClose = wbid(4, 130, 3000n);
    const v = transcriptCompleteness(transcript([1, 2, 3, 4]), witness([OPENER, RAISE, LATE, afterClose]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-padded");
  });

  it("cw.unwitnessed-padding: counting a txid that is not in the witnessed enumeration ⇒ incomplete", () => {
    const v = transcriptCompleteness(transcript([1, 2, 3, 99]), witness([OPENER, RAISE, LATE]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-padded");
  });

  it("cw.effect-forgery-hidden-extension: a bid whose supplied effect says `none` but recomputation accepts it fails closed", () => {
    // LATE is a real soft-close acceptance; the witness forges effect:"none" to shrink the close and
    // hide it. The kernel recomputes "updates-leading-bid" ≠ asserted "none" ⇒ fail closed (not shrink).
    const forgedLate = wbid(3, 108, 1300n, { effect: "none" });
    const v = transcriptCompleteness(transcript([1, 2, 3]), witness([OPENER, RAISE, forgedLate]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-effect-forgery");
  });

  it("cw.no-opener: a witness whose bids never open the auction (all below floor) fails closed", () => {
    const lowA = wbid(1, 100, 500n);
    const lowB = wbid(2, 101, 600n);
    const v = transcriptCompleteness(transcript([1, 2]), witness([lowA, lowB]));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-no-opener");
  });

  it("cw.open-height-mismatch: lot.openHeight that disagrees with the recomputed opening-bid height fails closed", () => {
    const v = transcriptCompleteness(transcript([1, 2, 3]), witness([OPENER, RAISE, LATE], { openHeight: 999 }));
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("cw-open-height-mismatch");
  });

  it("cw.producer-asserted: a producer-asserted witness is never verifier-checkable ⇒ fail closed (T2)", () => {
    const v = transcriptCompleteness(transcript([1]), { kind: "producer-asserted" });
    expect(v.complete).toBe(false);
    expect(v.reason).toBe("t2-completeness-not-verifier-checkable");
  });

  it("cw.malformed-params: a non-positive base window / soft-close window fails closed, never throws", () => {
    const badParams: AuctionParams = { ...PARAMS, softCloseWindowBlocks: -1 };
    let v: ReturnType<typeof transcriptCompleteness>;
    expect(() => {
      v = transcriptCompleteness(transcript([1, 2, 3]), witness([OPENER, RAISE, LATE], { params: badParams }));
    }).not.toThrow();
    expect(v!.complete).toBe(false);
    expect(v!.reason).toBe("cw-witness-malformed");
  });
});
