// G1 red battery — live publisher broadcast seam (go-live phase).
// Pins the contract CL flagged: the publisher serializes an already-signed tx and
// submits the raw hex; it NEVER signs; it fails closed on unserializable tx and on
// node rejection. RED until createLivePublisherBroadcastPort is implemented (green
// follows CL red-OK). See docs/core/GO_LIVE_PLAN.md (G1).
import { describe, expect, it, vi } from "vitest";
import { serializeLegacyTransaction, type LegacyTransaction } from "@ont/bitcoin";
import { createLivePublisherBroadcastPort, type RawTxSubmit } from "./broadcast.js";

// A minimal already-signed tx: non-empty scriptSig stands in for the signature the
// wallet (B5) produced before this seam. The publisher must pass it through unchanged.
const SIGNED_TX: LegacyTransaction = {
  version: 2,
  inputs: [
    { prevoutTxid: "11".repeat(32), prevoutVout: 0, scriptSigHex: "47304402deadbeef", sequence: 0xffffffff },
  ],
  outputs: [{ valueSats: 1000n, scriptPubKeyHex: "76a914" + "00".repeat(20) + "88ac" }],
  locktime: 0,
};

const expectedHex = (tx: LegacyTransaction): string =>
  Buffer.from(serializeLegacyTransaction(tx)!).toString("hex");

describe("live publisher broadcast (G1)", () => {
  it("serializes the signed tx and submits the exact raw hex, returning the node txid", async () => {
    const submit = vi.fn<RawTxSubmit>(async () => "node-returned-txid");
    const port = createLivePublisherBroadcastPort(submit);

    const result = await port.broadcast(SIGNED_TX);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(expectedHex(SIGNED_TX));
    expect(result).toEqual({ ok: true, txid: "node-returned-txid" });
  });

  it("never signs — the submitted hex is the input tx serialized unchanged", async () => {
    let captured = "";
    const submit: RawTxSubmit = async (hex) => {
      captured = hex;
      return "txid";
    };
    const port = createLivePublisherBroadcastPort(submit);

    await port.broadcast(SIGNED_TX);

    // Byte-identical to serializing the input — no added witness/signature/mutation.
    expect(captured).toBe(expectedHex(SIGNED_TX));
  });

  it("fails closed on an unserializable tx and does not call submit", async () => {
    const submit = vi.fn<RawTxSubmit>(async () => "txid");
    const port = createLivePublisherBroadcastPort(submit);

    const result = await port.broadcast({ ...SIGNED_TX, version: -1 });

    expect(submit).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, reason: "tx-not-serializable" });
  });

  it("reports broadcast-rejected when the node rejects the raw tx", async () => {
    const submit: RawTxSubmit = async () => {
      throw new Error("sendrawtransaction: txn-already-in-mempool");
    };
    const port = createLivePublisherBroadcastPort(submit);

    const result = await port.broadcast(SIGNED_TX);

    expect(result).toEqual({ ok: false, reason: "broadcast-rejected" });
  });
});
