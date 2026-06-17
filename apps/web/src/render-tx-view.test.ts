import { describe, expect, it } from "vitest";
import { encodeEvent, bytesToHex, EventType, AUCTION_BID_FLAG_INCLUDES_NAME } from "@ont/wire";
import { renderTxView, shapeTxid } from "./render-tx-view.js";
import type { WebReadPort, ServedTx } from "./web-read-port.js";

// B5-WEB tx-display red battery (CL design-concur event adc4cc64). SSR HTML, read/display only. Pins: reject-
// don't-normalize txid (typeof before isHex32Rendering); bitcoin-chain / not-ownership-authority copy; carrier
// decoded ONLY via @ont/wire decodeEvent; AuctionBid renders decoded W16 commitments; HTML-escape; fail-closed to
// unavailable on null/throwing tx read; never throws.

const TXID = "33".repeat(32);
const NEW_OWNER = "22".repeat(32);
const LOT = "cd".repeat(32);
const AUCTION_STATE = "ef".repeat(32);
const BIDDER = "12".repeat(32);

const transferCarrier = bytesToHex(
  encodeEvent({
    type: EventType.Transfer,
    prevStateTxid: "11".repeat(32),
    newOwnerPubkey: NEW_OWNER,
    flags: 0,
    successorBondVout: 0,
    signature: "ab".repeat(64),
  })
);
const auctionCarrier = bytesToHex(
  encodeEvent({
    type: EventType.AuctionBid,
    flags: AUCTION_BID_FLAG_INCLUDES_NAME,
    bondVout: 0,
    settlementLockBlocks: 144,
    bidAmountSats: 50000n,
    ownerPubkey: "22".repeat(32),
    auctionLotCommitment: LOT,
    auctionStateCommitment: AUCTION_STATE,
    bidderCommitment: BIDDER,
    unlockBlock: 100,
    name: "alice",
  })
);

function servedTx(carrierPayloadHex: string | null): ServedTx {
  return {
    txid: TXID,
    blockHash: "44".repeat(32),
    blockHeight: 800000,
    outputs: [{ valueSats: "100000", scriptHex: "0014abcd", address: "bc1qexampleaddress" }],
    carrierPayloadHex,
  };
}
function port(carrierPayloadHex: string | null): WebReadPort {
  return {
    valueHistory: () => null,
    recoveryHistory: () => null,
    tx: (txid) => (txid === TXID ? servedTx(carrierPayloadHex) : null),
  };
}

describe("shapeTxid — reject-don't-normalize", () => {
  it("rejects non-strings and non-hex32; accepts a hex32 txid", () => {
    expect(shapeTxid(123 as unknown).ok).toBe(false);
    expect(shapeTxid("not-a-txid").ok).toBe(false);
    expect(shapeTxid(TXID).ok).toBe(true);
  });
});

describe("renderTxView — served tx", () => {
  it("renders tx fields + decoded Transfer carrier with bitcoin-chain / not-ownership-authority copy, no upgrade language", () => {
    const out = renderTxView({ txid: TXID, port: port(transferCarrier) });
    expect(out).toContain(TXID);
    expect(out).toContain("800000");
    expect(out).toContain("100000");
    expect(out).toContain("bitcoin-chain");
    expect(out).toContain("not-ownership-authority");
    expect(out).toContain(NEW_OWNER); // decoded Transfer carrier field (via @ont/wire)
    expect(out).not.toMatch(/canonical|longest|winning|owner[- ]authority/i);
  });
});

describe("renderTxView — carrier handling", () => {
  it("AuctionBid carrier → decoded W16 bid fields, including 32-byte commitments", () => {
    const out = renderTxView({ txid: TXID, port: port(auctionCarrier) });
    expect(out).toContain("Carrier — AuctionBid");
    expect(out).toContain("50000");
    expect(out).toContain("alice");
    expect(out).toContain(LOT);
    expect(out).toContain(AUCTION_STATE);
    expect(out).toContain(BIDDER);
    expect(out).not.toMatch(/parked|wire-codec-consolidation/i);
  });
  it("malformed carrier → degraded decode line, tx still rendered, never throws", () => {
    let out = "";
    expect(() => {
      out = renderTxView({ txid: TXID, port: port("deadbeef") });
    }).not.toThrow();
    expect(out).toContain(TXID); // the tx itself still renders
    expect(out).toContain("could not be decoded");
  });
});

describe("renderTxView — fail-closed", () => {
  it("invalid txid → escaped error view (does not touch the port, never throws)", () => {
    let out = "";
    expect(() => {
      out = renderTxView({ txid: "<script>alert(1)</script>", port: port(transferCarrier) });
    }).not.toThrow();
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("<script>");
  });
  it("unknown txid (port null) → unavailable view", () => {
    const out = renderTxView({ txid: "99".repeat(32), port: port(transferCarrier) });
    expect(out).toContain("not currently served");
  });
  it("served tx whose txid differs from the request → unavailable (malformed)", () => {
    const mismatchPort: WebReadPort = {
      valueHistory: () => null,
      recoveryHistory: () => null,
      tx: () => ({ ...servedTx(transferCarrier), txid: "00".repeat(32) }),
    };
    const out = renderTxView({ txid: TXID, port: mismatchPort });
    expect(out).toContain("not currently served");
  });
  it("throwing tx read → unavailable view, never throws", () => {
    const throwingPort: WebReadPort = {
      valueHistory: () => null,
      recoveryHistory: () => null,
      tx() {
        throw new Error("read failed");
      },
    };
    let out = "";
    expect(() => {
      out = renderTxView({ txid: TXID, port: throwingPort });
    }).not.toThrow();
    expect(out).toContain("not currently served");
  });
});
