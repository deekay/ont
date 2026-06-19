// @ont/web — G2 slice 5b-1 RED battery: renderServedTx parity with renderTxView.
//
// The render-from-served core is being extracted so the sync snapshot path and the live resolver path render
// through ONE implementation (CL, event 418e9b78). These parity tests make the extraction behavior-preserving
// BEFORE the live path uses it: renderServedTx(rawTxid, served) must produce byte-identical HTML to the current
// renderTxView({ txid, port }) for served / absent / bad-txid / mismatch / no-carrier. RED until the extraction
// lands (the stub returns "").
import { describe, expect, it } from "vitest";
import { encodeEvent, EventType } from "@ont/wire";
import type { ServedTx, WebReadPort } from "./web-read-port.js";
import { renderServedTx, renderTxView } from "./render-tx-view.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);
const TXID = h32(0xab);
const carrierHex = Buffer.from(
  encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot: h32(0x7a), batchSize: 5 }),
).toString("hex");
const served: ServedTx = {
  txid: TXID,
  blockHash: null,
  blockHeight: 101,
  outputs: [{ valueSats: "0", scriptHex: "6a", address: null }],
  carrierPayloadHex: carrierHex,
};
const portReturning = (s: ServedTx | null): WebReadPort => ({
  valueHistory: () => null,
  recoveryHistory: () => null,
  tx: () => s,
});

describe("renderServedTx parity with renderTxView (G2 slice 5b-1)", () => {
  it("renders a served tx (with carrier) identically", () => {
    expect(renderServedTx(TXID, served)).toBe(renderTxView({ txid: TXID, port: portReturning(served) }));
  });

  it("renders a tx with no carrier identically", () => {
    const noCarrier: ServedTx = { ...served, carrierPayloadHex: null };
    expect(renderServedTx(TXID, noCarrier)).toBe(renderTxView({ txid: TXID, port: portReturning(noCarrier) }));
  });

  it("renders an absent (null) tx identically — unavailable view", () => {
    expect(renderServedTx(TXID, null)).toBe(renderTxView({ txid: TXID, port: portReturning(null) }));
  });

  it("renders a bad txid identically — error view, never touches a served value", () => {
    expect(renderServedTx("not-a-hex32", served)).toBe(
      renderTxView({ txid: "not-a-hex32", port: portReturning(served) }),
    );
  });

  it("renders a txid mismatch identically — unavailable view", () => {
    const mismatched: ServedTx = { ...served, txid: h32(0xcd) };
    expect(renderServedTx(TXID, mismatched)).toBe(renderTxView({ txid: TXID, port: portReturning(mismatched) }));
  });
});
