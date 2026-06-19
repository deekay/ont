// @ont/indexer live — G2 slice 2a RED battery: the strict, bigint-safe ConfirmedAnchorRecord codec.
//
// Pins ChatLunatique's 2a watches (event 67d116fe): closed encoded shape (reject missing AND extra fields),
// validated primitives (anchorTxid/anchoredRoot 64-hex, minedHeight/batchSize u32), encode fails closed on a
// non-serializable tx, decode fails closed on a non-parseable tx hex, prevoutTxHexes order preserved exactly,
// and the storage-corruption guard legacyTxidOf(decoded.anchorTx) === confirmedAnchor.anchorTxid. Plus the core
// property: decode∘JSON∘encode is identity over a real record carrying a >2^53 bigint output value, and the
// encoded form is JSON-safe (no bigint). Negative assertions match the impl's SPECIFIC reason strings so the
// generic not-implemented stub stays red for the right reason.
import { describe, it, expect } from "vitest";
import { serializeLegacyTransaction, legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import type { ConfirmedAnchorRecord } from "./record.js";
import {
  encodeConfirmedAnchorRecord,
  decodeConfirmedAnchorRecord,
} from "./confirmed-anchor-codec.js";

// ── Fixtures: real legacy txs (valid serialize), incl. an output value beyond Number.MAX_SAFE_INTEGER. ──
const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [
    { valueSats: 0n, scriptPubKeyHex: "6a49" + "7a".repeat(73) }, // RootAnchor OP_RETURN carrier
    { valueSats: 9_007_199_254_740_993n, scriptPubKeyHex: "0014" + "11".repeat(20) }, // 2^53 + 1
  ],
  locktime: 0,
};
const prevout0: LegacyTransaction = {
  version: 1,
  inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 0, scriptSigHex: "51", sequence: 0 }],
  outputs: [{ valueSats: 1000n, scriptPubKeyHex: "76a914" + "22".repeat(20) + "88ac" }],
  locktime: 0,
};
const prevout1: LegacyTransaction = {
  version: 1,
  inputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: 2, scriptSigHex: "52", sequence: 7 }],
  outputs: [{ valueSats: 2000n, scriptPubKeyHex: "0014" + "33".repeat(20) }],
  locktime: 9,
};

function hexOf(tx: LegacyTransaction): string {
  const bytes = serializeLegacyTransaction(tx);
  if (!bytes) throw new Error("fixture tx must serialize");
  return Buffer.from(bytes).toString("hex");
}

const ANCHOR_TXID = (() => {
  const t = legacyTxidOf(anchorTx);
  if (!t) throw new Error("fixture anchor txid");
  return t;
})();

const baseRecord: ConfirmedAnchorRecord = {
  confirmedAnchor: { anchorTxid: ANCHOR_TXID, minedHeight: 101, anchoredRoot: "7a".repeat(32), batchSize: 5 },
  feeTxParts: { anchorTx, prevoutTxs: [prevout0, prevout1] },
};

/** A valid encoded record built directly from @ont/bitcoin (not via the codec) — the base for decode tampering. */
function validEncoded() {
  return {
    confirmedAnchor: { anchorTxid: ANCHOR_TXID, minedHeight: 101, anchoredRoot: "7a".repeat(32), batchSize: 5 },
    feeTxParts: { anchorTxHex: hexOf(anchorTx), prevoutTxHexes: [hexOf(prevout0), hexOf(prevout1)] },
  };
}

describe("ConfirmedAnchorRecord codec", () => {
  // ── Core round-trip + JSON safety ──
  it("round-trips decode∘JSON∘encode as identity, incl. a >2^53 bigint output value", () => {
    const wire = JSON.parse(JSON.stringify(encodeConfirmedAnchorRecord(baseRecord)));
    expect(decodeConfirmedAnchorRecord(wire)).toEqual(baseRecord);
  });

  it("produces a JSON-safe encoded form (no bigint reaches JSON; tx bodies are hex strings)", () => {
    const encoded = encodeConfirmedAnchorRecord(baseRecord);
    expect(() => JSON.stringify(encoded)).not.toThrow();
    expect(typeof encoded.feeTxParts.anchorTxHex).toBe("string");
  });

  it("preserves prevoutTxHexes order exactly", () => {
    const encoded = encodeConfirmedAnchorRecord(baseRecord);
    expect(encoded.feeTxParts.prevoutTxHexes).toEqual([hexOf(prevout0), hexOf(prevout1)]);
  });

  // ── encode fails closed on a non-serializable tx ──
  it("encode fails closed when the anchor tx cannot serialize", () => {
    const bad: ConfirmedAnchorRecord = {
      confirmedAnchor: baseRecord.confirmedAnchor,
      feeTxParts: { anchorTx: { ...anchorTx, outputs: [{ valueSats: -1n, scriptPubKeyHex: "51" }] }, prevoutTxs: [] },
    };
    expect(() => encodeConfirmedAnchorRecord(bad)).toThrow(/cannot serialize/i);
  });

  it("encode fails closed when a prevout tx cannot serialize", () => {
    const bad: ConfirmedAnchorRecord = {
      confirmedAnchor: baseRecord.confirmedAnchor,
      feeTxParts: { anchorTx, prevoutTxs: [prevout0, { ...prevout1, version: -1 }] },
    };
    expect(() => encodeConfirmedAnchorRecord(bad)).toThrow(/cannot serialize/i);
  });

  // ── decode closed shape: reject missing AND extra fields ──
  it("decode rejects an extra top-level field", () => {
    expect(() => decodeConfirmedAnchorRecord({ ...validEncoded(), extra: 1 })).toThrow(
      /invalid encoded confirmed-anchor record/i,
    );
  });

  it("decode rejects a missing top-level field (feeTxParts)", () => {
    const { confirmedAnchor } = validEncoded();
    expect(() => decodeConfirmedAnchorRecord({ confirmedAnchor })).toThrow(
      /invalid encoded confirmed-anchor record/i,
    );
  });

  it("decode rejects an extra field inside confirmedAnchor", () => {
    const v = validEncoded();
    const tampered = { ...v, confirmedAnchor: { ...v.confirmedAnchor, surprise: true } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  it("decode rejects an extra field inside feeTxParts", () => {
    const v = validEncoded();
    const tampered = { ...v, feeTxParts: { ...v.feeTxParts, surprise: "x" } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  it("decode rejects a missing primitive field (batchSize)", () => {
    const v = validEncoded();
    const tampered = {
      ...v,
      confirmedAnchor: { anchorTxid: v.confirmedAnchor.anchorTxid, minedHeight: 101, anchoredRoot: v.confirmedAnchor.anchoredRoot },
    };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  // ── decode primitive validation ──
  it("decode rejects a non-64-hex anchorTxid (uppercase is not canonical)", () => {
    const v = validEncoded();
    const tampered = { ...v, confirmedAnchor: { ...v.confirmedAnchor, anchorTxid: ANCHOR_TXID.toUpperCase() } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  it("decode rejects a non-64-hex anchoredRoot", () => {
    const v = validEncoded();
    const tampered = { ...v, confirmedAnchor: { ...v.confirmedAnchor, anchoredRoot: "7a".repeat(31) } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  it("decode rejects a non-u32 minedHeight (negative / float / > u32)", () => {
    const v = validEncoded();
    for (const minedHeight of [-1, 1.5, 0x1_0000_0000]) {
      const tampered = { ...v, confirmedAnchor: { ...v.confirmedAnchor, minedHeight } };
      expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
    }
  });

  it("decode rejects a non-u32 batchSize", () => {
    const v = validEncoded();
    const tampered = { ...v, confirmedAnchor: { ...v.confirmedAnchor, batchSize: -3 } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  // ── decode fails closed on non-parseable tx hex ──
  it("decode fails closed when the anchor tx hex cannot parse", () => {
    const tampered = { ...validEncoded(), feeTxParts: { anchorTxHex: "zz", prevoutTxHexes: [hexOf(prevout0)] } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  it("decode fails closed when a prevout tx hex cannot parse", () => {
    const v = validEncoded();
    const tampered = { ...v, feeTxParts: { anchorTxHex: v.feeTxParts.anchorTxHex, prevoutTxHexes: ["00ff"] } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/invalid encoded confirmed-anchor record/i);
  });

  // ── decode storage-corruption guard: anchorTx must hash to the stored anchorTxid ──
  it("decode rejects when the anchor tx does not hash to the stored anchorTxid", () => {
    const v = validEncoded();
    const tampered = { ...v, confirmedAnchor: { ...v.confirmedAnchor, anchorTxid: "cd".repeat(32) } };
    expect(() => decodeConfirmedAnchorRecord(tampered)).toThrow(/anchor txid/i);
  });
});
