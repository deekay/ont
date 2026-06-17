// Slice 5 red battery — createSnapshotWebReadPort (go-live confirmed-anchor read path).
// Pins CL's watches: value/recovery history stay null (B3-deferred, no minting); tx(txid) projects the
// snapshot view via the pure projection (fail-closed → null on a mismatched view); unknown txid → null;
// reads are pure (no snapshot mutation, lookup count is exactly the reads). RED until implemented (stub throws).
import { describe, expect, it, vi } from "vitest";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import { createSnapshotWebReadPort, type ConfirmedAnchorSnapshot } from "./snapshot-read-port.js";
import type { ConfirmedAnchorTxView } from "./confirmed-anchor-tx.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);
const NEW_ROOT = h32(0x7a);
const payloadHexOf = (p: Uint8Array): string => Buffer.from(p).toString("hex");
const opReturnScriptFor = (p: Uint8Array): string =>
  "6a" + p.length.toString(16).padStart(2, "0") + payloadHexOf(p);

const anchorPayload = encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot: NEW_ROOT, batchSize: 5 });
const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: h32(0xa1), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 0n, scriptPubKeyHex: opReturnScriptFor(anchorPayload) }],
  locktime: 0,
};
const txid = legacyTxidOf(anchorTx)!;
const validView: ConfirmedAnchorTxView = { anchorTx, minedHeight: 101, anchoredRoot: NEW_ROOT, batchSize: 5 };

const snapshotOf = (byTxid: Record<string, ConfirmedAnchorTxView>): ConfirmedAnchorSnapshot => ({
  anchorTxByTxid: (t) => byTxid[t] ?? null,
});

describe("createSnapshotWebReadPort (G1 slice 5)", () => {
  it("value/recovery history are null — per-name ownership is B3-deferred, never minted", () => {
    const port = createSnapshotWebReadPort(snapshotOf({ [txid]: validView }));
    expect(port.valueHistory("alice")).toBeNull();
    expect(port.recoveryHistory("alice")).toBeNull();
  });

  it("tx(txid) projects the snapshot view to a ServedTx", () => {
    const port = createSnapshotWebReadPort(snapshotOf({ [txid]: validView }));
    const served = port.tx(txid);
    expect(served).not.toBeNull();
    expect(served!.txid).toBe(txid);
    expect(served!.blockHeight).toBe(101);
    expect(served!.carrierPayloadHex).toBe(payloadHexOf(anchorPayload));
  });

  it("tx(unknown) → null", () => {
    const port = createSnapshotWebReadPort(snapshotOf({ [txid]: validView }));
    expect(port.tx(h32(0x22))).toBeNull();
  });

  it("tx of a view that fails the projection cross-check → null", () => {
    // snapshot view whose confirmed fact disagrees with the tx's decoded RootAnchor → fail closed
    const port = createSnapshotWebReadPort(snapshotOf({ [txid]: { ...validView, batchSize: 9 } }));
    expect(port.tx(txid)).toBeNull();
  });

  it("tx(requestedTxid) → null when the snapshot view projects to a different txid (bad snapshot key)", () => {
    // a wrong key mapped to a valid view: projected served.txid won't equal the request → the port's own
    // tx(txid) contract fails closed, not just the render layer (CL pin)
    const wrongKey = h32(0x22);
    const port = createSnapshotWebReadPort(snapshotOf({ [wrongKey]: validView }));
    expect(port.tx(wrongKey)).toBeNull();
  });

  it("reads are pure — the port only reads the snapshot, once per tx() call", () => {
    const spy = vi.fn((t: string) => (t === txid ? validView : null));
    const port = createSnapshotWebReadPort({ anchorTxByTxid: spy });
    port.tx(txid);
    port.tx(txid);
    expect(spy).toHaveBeenCalledTimes(2);
    // and the result is stable across reads (no mutation)
    expect(port.tx(txid)).toEqual(port.tx(txid));
  });
});
