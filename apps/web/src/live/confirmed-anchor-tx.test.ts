// Slice 5 red battery — confirmedAnchorTxToServedTx projection (go-live confirmed-anchor read path).
// Pins CL's correction: project from the ORIGINAL anchor tx, return its EXACT OP_RETURN payload bytes as
// carrierPayloadHex (not synthesized), cross-check decoded newRoot/batchSize against the confirmed fact and
// fail closed (null) on mismatch / missing / non-RootAnchor / unserializable. blockHash null; blockHeight =
// minedHeight; outputs projected from the tx. RED until implemented (stub throws).
import { describe, expect, it } from "vitest";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import { decodeEvent, encodeEvent, EventType, hexToBytes } from "@ont/wire";
import { confirmedAnchorTxToServedTx, type ConfirmedAnchorTxView } from "./confirmed-anchor-tx.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);
const NEW_ROOT = h32(0x7a);

const payloadHexOf = (p: Uint8Array): string => Buffer.from(p).toString("hex");
const opReturnScriptFor = (p: Uint8Array): string =>
  "6a" + p.length.toString(16).padStart(2, "0") + payloadHexOf(p);

const rootAnchorPayload = (newRoot = NEW_ROOT, batchSize = 5): Uint8Array =>
  encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot, batchSize });
const transferPayload = (): Uint8Array =>
  encodeEvent({
    type: EventType.Transfer,
    prevStateTxid: h32(0x11),
    newOwnerPubkey: h32(0x22),
    flags: 0,
    successorBondVout: 0,
    signature: "cd".repeat(64),
  });

const txWith = (outputs: LegacyTransaction["outputs"], scriptSigHex = ""): LegacyTransaction => ({
  version: 2,
  inputs: [{ prevoutTxid: h32(0xa1), prevoutVout: 0, scriptSigHex, sequence: 0xffffffff }],
  outputs,
  locktime: 0,
});

const anchorPayload = rootAnchorPayload();
const anchorScript = opReturnScriptFor(anchorPayload);
const validAnchorTx = txWith([{ valueSats: 0n, scriptPubKeyHex: anchorScript }]);
const validView: ConfirmedAnchorTxView = { anchorTx: validAnchorTx, minedHeight: 101, anchoredRoot: NEW_ROOT, batchSize: 5 };

describe("confirmedAnchorTxToServedTx (G1 slice 5)", () => {
  it("projects a confirmed RootAnchor tx to a ServedTx with the ORIGINAL carrier bytes", () => {
    const served = confirmedAnchorTxToServedTx(validView);
    expect(served).not.toBeNull();
    expect(served!.txid).toBe(legacyTxidOf(validAnchorTx));
    expect(served!.blockHeight).toBe(101);
    expect(served!.blockHash).toBeNull();
    // carrier = the EXACT OP_RETURN payload bytes, not reconstructed
    expect(served!.carrierPayloadHex).toBe(payloadHexOf(anchorPayload));
    expect(served!.outputs).toEqual([{ valueSats: "0", scriptHex: anchorScript, address: null }]);
    // and it round-trips back to the RootAnchor via the published decoder
    const ev = decodeEvent(hexToBytes(served!.carrierPayloadHex!));
    expect(ev.type).toBe(EventType.RootAnchor);
  });

  it("projects all outputs in order when a payment output precedes the carrier", () => {
    const tx = txWith([
      { valueSats: 5000n, scriptPubKeyHex: "76a90088ac" },
      { valueSats: 0n, scriptPubKeyHex: anchorScript },
    ]);
    const served = confirmedAnchorTxToServedTx({ anchorTx: tx, minedHeight: 7, anchoredRoot: NEW_ROOT, batchSize: 5 });
    expect(served).not.toBeNull();
    expect(served!.outputs).toEqual([
      { valueSats: "5000", scriptHex: "76a90088ac", address: null },
      { valueSats: "0", scriptHex: anchorScript, address: null },
    ]);
    expect(served!.carrierPayloadHex).toBe(payloadHexOf(anchorPayload));
  });

  it("fails closed (null) when the decoded newRoot does not match the confirmed anchoredRoot", () => {
    expect(confirmedAnchorTxToServedTx({ ...validView, anchoredRoot: h32(0x99) })).toBeNull();
  });

  it("fails closed (null) when the decoded batchSize does not match the confirmed batchSize", () => {
    expect(confirmedAnchorTxToServedTx({ ...validView, batchSize: 9 })).toBeNull();
  });

  it("fails closed (null) for a tx with no OP_RETURN carrier", () => {
    const tx = txWith([{ valueSats: 1000n, scriptPubKeyHex: "76a90088ac" }]);
    expect(confirmedAnchorTxToServedTx({ anchorTx: tx, minedHeight: 1, anchoredRoot: NEW_ROOT, batchSize: 5 })).toBeNull();
  });

  it("fails closed (null) when the only carrier is a non-RootAnchor event", () => {
    const tx = txWith([{ valueSats: 0n, scriptPubKeyHex: opReturnScriptFor(transferPayload()) }]);
    expect(confirmedAnchorTxToServedTx({ anchorTx: tx, minedHeight: 1, anchoredRoot: NEW_ROOT, batchSize: 5 })).toBeNull();
  });

  it("fails closed (null) on a non-unique carrier — two decodable RootAnchor OP_RETURN outputs", () => {
    // aligns with the inclusion firewall's exactly-one RootAnchor rule (CL pin)
    const tx = txWith([
      { valueSats: 0n, scriptPubKeyHex: anchorScript },
      { valueSats: 0n, scriptPubKeyHex: anchorScript },
    ]);
    expect(confirmedAnchorTxToServedTx({ anchorTx: tx, minedHeight: 1, anchoredRoot: NEW_ROOT, batchSize: 5 })).toBeNull();
  });

  it("fails closed (null) when the anchor tx is not serializable (txid undefined)", () => {
    const tx = txWith([{ valueSats: 0n, scriptPubKeyHex: anchorScript }], "zz"); // invalid scriptSig hex
    expect(confirmedAnchorTxToServedTx({ anchorTx: tx, minedHeight: 1, anchoredRoot: NEW_ROOT, batchSize: 5 })).toBeNull();
  });
});
