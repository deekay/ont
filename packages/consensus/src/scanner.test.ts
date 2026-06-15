// B2 transaction scanner / skip-bad boundary — conformance tests.
//
// Encodes the classification table + "minimum vector set" of
// docs/core/B2_SKIP_BAD_CLASSIFICATION.md (ratified same-block-order (#55) /
// one-anchor-per-tx (#54)) independently of the implementation. Valid event
// bytes are built with the normative @ont/wire encoder; invalid bytes are
// hand-crafted by mutating valid ones, so an authoring error has to survive
// both the spec doc and the wire codec to pass.

import { describe, expect, it } from "vitest";
import {
  AUCTION_BID_FLAG_INCLUDES_NAME,
  EventType,
  encodeEvent,
  type AuctionBidEvent,
  type RootAnchorEvent,
  type TransferEvent,
} from "@ont/wire";

import { scanBlock, scanBlockTransactions, scanTransaction } from "./scanner.js";

const h32 = (fill: string) => fill.repeat(32); // 64 hex chars = 32 bytes
const sig = "ab".repeat(64); // 64 bytes
const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const rootAnchor = (newRoot = h32("ab")): RootAnchorEvent => ({
  type: EventType.RootAnchor,
  prevRoot: h32("00"),
  newRoot,
  batchSize: 1,
});
const transfer = (newOwner = h32("cd")): TransferEvent => ({
  type: EventType.Transfer,
  prevStateTxid: h32("11"),
  newOwnerPubkey: newOwner,
  flags: 0,
  successorBondVout: 0,
  signature: sig,
});
const auctionBid = (name = "alice"): AuctionBidEvent => ({
  type: EventType.AuctionBid,
  flags: AUCTION_BID_FLAG_INCLUDES_NAME,
  bondVout: 0,
  settlementLockBlocks: 1,
  bidAmountSats: 1000n,
  ownerPubkey: h32("22"),
  auctionLotCommitment: h32("33"),
  auctionStateCommitment: h32("44"),
  bidderCommitment: h32("55"),
  unlockBlock: 100,
  name,
});

const ANCHOR = encodeEvent(rootAnchor());
const TRANSFER = encodeEvent(transfer());
const BID = encodeEvent(auctionBid());

const CTX = { height: 800_000, txIndex: 0, activeVersions: new Set<number>([0x01]) };
const out = (vout: number, payload: Uint8Array | null) => ({ vout, payload });

describe("B2 scanner — non-ONT outputs are ignored", () => {
  it("a non-OP_RETURN output (null payload) beside a valid event applies only the event", () => {
    const r = scanTransaction([out(0, null), out(1, ANCHOR)], CTX);
    expect(r.events.map((e) => e.event.type)).toEqual([EventType.RootAnchor]);
    expect(r.outputs.find((o) => o.vout === 0)?.class).toBe("non-ont");
    expect(r.ontRejected).toBe(false);
  });

  it("empty and sub-3-byte payloads are non-ONT", () => {
    const r = scanTransaction([out(0, new Uint8Array()), out(1, Uint8Array.of(0x4f, 0x4e))], CTX);
    expect(r.outputs.every((o) => o.class === "non-ont")).toBe(true);
    expect(r.events).toEqual([]);
  });

  it("a non-ONT magic beside a valid event is ignored", () => {
    const boo = concatBytes(Uint8Array.of(0x42, 0x4f, 0x4f), TRANSFER.slice(3));
    const r = scanTransaction([out(0, boo), out(1, TRANSFER)], CTX);
    expect(r.outputs.find((o) => o.vout === 0)?.class).toBe("non-ont");
    expect(r.events.map((e) => e.vout)).toEqual([1]);
  });
});

describe("B2 scanner — invalid ONT-shaped outputs have zero side effects", () => {
  it("truncated frame (magic only / magic+version) is invalid, sibling applies", () => {
    const magicOnly = Uint8Array.of(0x4f, 0x4e, 0x54);
    const magicVersion = Uint8Array.of(0x4f, 0x4e, 0x54, 0x01);
    const r = scanTransaction([out(0, magicOnly), out(1, magicVersion), out(2, ANCHOR)], CTX);
    expect(r.outputs.find((o) => o.vout === 0)?.class).toBe("invalid-ont-shaped");
    expect(r.outputs.find((o) => o.vout === 1)?.class).toBe("invalid-ont-shaped");
    expect(r.events.map((e) => e.vout)).toEqual([2]);
  });

  it("active-version unknown type is invalid", () => {
    const unknown = Uint8Array.of(0x4f, 0x4e, 0x54, 0x01, 0x05);
    const r = scanTransaction([out(0, unknown), out(1, ANCHOR)], CTX);
    expect(r.outputs.find((o) => o.vout === 0)?.class).toBe("invalid-ont-shaped");
    expect(r.events.map((e) => e.vout)).toEqual([1]);
  });

  it("retired 0x0d AvailabilityMarker type is invalid (marker-fold #47), anchor unaffected", () => {
    const retired = Uint8Array.of(0x4f, 0x4e, 0x54, 0x01, 0x0d, 0x00, 0x00);
    const r = scanTransaction([out(0, retired), out(1, ANCHOR)], CTX);
    const o0 = r.outputs.find((o) => o.vout === 0);
    expect(o0?.class).toBe("invalid-ont-shaped");
    expect(o0?.event).toBeNull();
    expect(r.events.map((e) => e.event.type)).toEqual([EventType.RootAnchor]);
  });

  it("RootAnchor truncated or with a trailing byte is invalid", () => {
    const short = ANCHOR.slice(0, ANCHOR.length - 1);
    const long = concatBytes(ANCHOR, Uint8Array.of(0x00));
    const r = scanTransaction([out(0, short), out(1, long), out(2, TRANSFER)], CTX);
    expect(r.outputs.find((o) => o.vout === 0)?.class).toBe("invalid-ont-shaped");
    expect(r.outputs.find((o) => o.vout === 1)?.class).toBe("invalid-ont-shaped");
    expect(r.events.map((e) => e.event.type)).toEqual([EventType.Transfer]);
  });

  it("AuctionBid with a non-canonical (uppercase) name is invalid", () => {
    const bad = BID.slice();
    bad[152] = 0x41; // first name byte 'a' -> 'A'
    const r = scanTransaction([out(0, bad), out(1, ANCHOR)], CTX);
    expect(r.outputs.find((o) => o.vout === 0)?.class).toBe("invalid-ont-shaped");
    expect(r.events.map((e) => e.event.type)).toEqual([EventType.RootAnchor]);
  });

  it("invalid ONT-shaped outputs produce no event (zero partial side effect)", () => {
    const truncatedTransfer = TRANSFER.slice(0, 100);
    const r = scanTransaction([out(0, truncatedTransfer)], CTX);
    expect(r.events).toEqual([]);
    expect(r.outputs[0]?.class).toBe("invalid-ont-shaped");
    expect(r.outputs[0]?.event).toBeNull();
  });
});

describe("B2 scanner — future-version gating", () => {
  it("a version-2 payload is inert (inactive-version) before activation", () => {
    const v2 = Uint8Array.of(0x4f, 0x4e, 0x54, 0x02, 0x0b, 0x00);
    const r = scanTransaction([out(0, v2), out(1, ANCHOR)], CTX);
    const o0 = r.outputs.find((o) => o.vout === 0);
    expect(o0?.class).toBe("inactive-version");
    expect(o0?.event).toBeNull();
    expect(r.events.map((e) => e.event.type)).toEqual([EventType.RootAnchor]);
  });

  it("the version gate is the only thing distinguishing inactive from invalid — it is not hardcoded", () => {
    // Same v2 frame, but with v2 declared active: it is no longer skipped at the
    // version gate; it falls through to decode (which currently rejects it as
    // invalid, since no v2 codec/activation rule exists — that stays for a named
    // decision, never silently). The point: behavior flips at the gate, no
    // accidental hardfork where v2 silently becomes consensus-effective.
    const v2 = Uint8Array.of(0x4f, 0x4e, 0x54, 0x02, 0x0b, 0x00);
    const r = scanTransaction([out(0, v2)], { ...CTX, activeVersions: new Set([0x01, 0x02]) });
    expect(r.outputs[0]?.class).not.toBe("inactive-version");
    expect(r.outputs[0]?.class).toBe("invalid-ont-shaped");
  });
});

describe("B2 scanner — valid events, ordering, and the decoder/kernel boundary", () => {
  it("a syntactically valid Transfer is 'valid' at scan regardless of signature authority", () => {
    // The scanner does not verify Schnorr — a decodable-but-unauthorized Transfer
    // is a valid decoded event here; semantic authority is a downstream kernel
    // predicate, not 'bad bytes'.
    const r = scanTransaction([out(0, TRANSFER)], CTX);
    expect(r.outputs[0]?.class).toBe("valid");
    expect(r.events[0]?.event.type).toBe(EventType.Transfer);
  });

  it("multiple valid events apply in ascending vout order within a tx (same-block-order #55)", () => {
    const r = scanTransaction([out(2, BID), out(0, TRANSFER), out(1, ANCHOR)], CTX);
    expect(r.events.map((e) => e.vout)).toEqual([0, 1, 2]);
    expect(r.events.map((e) => e.event.type)).toEqual([
      EventType.Transfer,
      EventType.RootAnchor,
      EventType.AuctionBid,
    ]);
  });

  it("scanBlock orders valid events by (txIndex, vout) across a block (same-block-order #55)", () => {
    const events = scanBlock(
      [
        { txIndex: 1, outputs: [out(0, TRANSFER)] },
        { txIndex: 0, outputs: [out(1, ANCHOR), out(0, BID)] },
      ],
      { height: 800_000, activeVersions: new Set([0x01]) },
    );
    expect(events.map((e) => [e.txIndex, e.vout])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });
});

describe("B2 scanner — one-anchor-per-tx (#54)", () => {
  it("one valid RootAnchor plus malformed/non-ONT outputs keeps the anchor", () => {
    const malformed = ANCHOR.slice(0, 40);
    const r = scanTransaction([out(0, malformed), out(1, ANCHOR), out(2, null)], CTX);
    expect(r.ontRejected).toBe(false);
    expect(r.events.map((e) => e.event.type)).toEqual([EventType.RootAnchor]);
  });

  it("more than one valid RootAnchor in one tx rejects ALL ONT effects (whole-tx reject)", () => {
    const anchorA = encodeEvent(rootAnchor(h32("aa")));
    const anchorB = encodeEvent(rootAnchor(h32("bb")));
    const r = scanTransaction([out(0, anchorA), out(1, TRANSFER), out(2, anchorB)], CTX);
    expect(r.ontRejected).toBe(true);
    expect(r.rejectReason).toMatch(/one-anchor-per-tx/);
    expect(r.events).toEqual([]); // no accepted anchor AND no sibling side effects
  });

  it("a whole-tx reject contributes zero events to the block scan", () => {
    const anchorA = encodeEvent(rootAnchor(h32("aa")));
    const anchorB = encodeEvent(rootAnchor(h32("bb")));
    const events = scanBlock(
      [
        { txIndex: 0, outputs: [out(0, anchorA), out(1, anchorB)] },
        { txIndex: 1, outputs: [out(0, TRANSFER)] },
      ],
      { height: 800_000, activeVersions: new Set([0x01]) },
    );
    expect(events.map((e) => e.txIndex)).toEqual([1]);

    // The reject must remain visible (not silently vanish) via the detailed API.
    const detailed = scanBlockTransactions(
      [
        { txIndex: 0, outputs: [out(0, anchorA), out(1, anchorB)] },
        { txIndex: 1, outputs: [out(0, TRANSFER)] },
      ],
      { height: 800_000, activeVersions: new Set([0x01]) },
    );
    expect(detailed[0]?.ontRejected).toBe(true);
    expect(detailed[0]?.rejectReason).toMatch(/one-anchor-per-tx/);
    expect(detailed[1]?.ontRejected).toBe(false);
  });
});
