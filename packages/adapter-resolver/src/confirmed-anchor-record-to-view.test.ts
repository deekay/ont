// @ont/adapter-resolver — G2 slice 6a: the confirmed-anchor record -> view mapper.
//
// Pins confirmedAnchorRecordToTxView: a persisted record's confirmed fact + original anchor tx map straight to
// ConfirmedAnchorTxView, structurally (no @ont/anchor-store dependency — adapter-resolver stays a pure package).
// A record carrying the real extra fields (anchorTxid, prevoutTxs) is accepted by structural width.
import { describe, expect, it } from "vitest";
import type { LegacyTransaction } from "@ont/bitcoin";
import { confirmedAnchorRecordToTxView } from "./confirmed-anchor-tx.js";

const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 0n, scriptPubKeyHex: "6a49" + "7a".repeat(73) }],
  locktime: 0,
};

describe("confirmedAnchorRecordToTxView (G2 slice 6a)", () => {
  it("maps the confirmed fact + original anchor tx straight to the view", () => {
    const view = confirmedAnchorRecordToTxView({
      confirmedAnchor: { minedHeight: 101, anchoredRoot: "7a".repeat(32), batchSize: 5 },
      feeTxParts: { anchorTx },
    });
    expect(view).toEqual({ anchorTx, minedHeight: 101, anchoredRoot: "7a".repeat(32), batchSize: 5 });
  });

  it("accepts a wider record (extra anchorTxid / prevoutTxs) by structural width — the real record shape", () => {
    const record = {
      confirmedAnchor: { anchorTxid: "cd".repeat(32), minedHeight: 202, anchoredRoot: "5b".repeat(32), batchSize: 3 },
      feeTxParts: { anchorTx, prevoutTxs: [] as LegacyTransaction[] },
    };
    const view = confirmedAnchorRecordToTxView(record);
    expect(view.minedHeight).toBe(202);
    expect(view.anchoredRoot).toBe("5b".repeat(32));
    expect(view.batchSize).toBe(3);
    expect(view.anchorTx).toBe(anchorTx);
  });
});
