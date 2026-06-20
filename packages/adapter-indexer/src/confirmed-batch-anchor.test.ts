import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2";
import {
  legacyTxidOf,
  merkleRootFromProof,
  merkleRootHexFromHeaderHex,
  type BitcoinHeaderSource,
  type LegacyTransaction,
} from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import { enforceGateFee } from "@ont/claim-path";
import type { CommittedBatchContents, GateFeeSchedule } from "@ont/consensus";
import {
  buildConfirmedBatchAnchor,
  decodeRootAnchorFields,
  type BuildConfirmedBatchAnchorInput,
} from "./confirmed-batch-anchor.js";

// B4-INDEX-ANCHOR red battery (B4_ADAPTERS_PLAN §9.4). The firewall bar: the minted ConfirmedBatchAnchor +
// fee-tx parts are piped into the REAL B3 enforceGateFee — a valid anchor ADMITS; every hostile path
// (bad merkle / bad header / wrong payload / absent prevout) mints no fact OR a fact the audited predicate
// REJECTS. Plus direct byte-order pins on the promoted merkleRootFromProof primitive. RED until the
// adapter + primitive land (the stubs reject / return null).

// ---------- byte helpers ----------
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
const reversed = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
const dsha256 = (b: Uint8Array): Uint8Array => sha256(sha256(b));
const internal = (displayHex: string): Uint8Array => reversed(hexToBytes(displayHex)); // display → internal leaf

/** OP_RETURN scriptPubKey hex carrying `payload` via the minimal push (direct ≤75, else OP_PUSHDATA1). */
function opReturn(payload: Uint8Array): string {
  const len = payload.length;
  const prefix = len <= 75 ? Uint8Array.of(0x6a, len) : Uint8Array.of(0x6a, 0x4c, len);
  return bytesToHex(prefix) + bytesToHex(payload);
}
/** A minimal 80-byte header carrying `merkleInternal` at bytes 36..68 (ANCHOR does no PoW — that's B4-HEADER). */
function make80ByteHeader(merkleInternal: Uint8Array): string {
  const h = new Uint8Array(80);
  h[0] = 1; // version
  h.set(merkleInternal, 36);
  return bytesToHex(h);
}

// ---------- the synthetic fee-adequate anchor (mirrors the I-FEE-A recipe) ----------
const DUMMY_TXID = "00".repeat(32);
const PREV_ROOT = "00".repeat(32);
const ROOT = "ab".repeat(32);

function makeTx(outputs: readonly { valueSats: bigint; scriptPubKeyHex: string }[], salt: number): LegacyTransaction {
  return { version: 1, inputs: [{ prevoutTxid: DUMMY_TXID, prevoutVout: salt, scriptSigHex: "", sequence: 0xffffffff }], outputs, locktime: 0 };
}
// prevouts 5_000_000 + 3_000_000 spent; anchor change 7_000_000 ⇒ paidFee = 1_000_000.
const prevoutA = makeTx([{ valueSats: 5_000_000n, scriptPubKeyHex: "51" }], 0);
const prevoutB = makeTx([{ valueSats: 3_000_000n, scriptPubKeyHex: "51" }], 1);
const PREVOUTS = [prevoutA, prevoutB] as const;

function anchorTxWith(outputs: readonly { valueSats: bigint; scriptPubKeyHex: string }[]): LegacyTransaction {
  return {
    version: 1,
    inputs: PREVOUTS.map((p) => ({ prevoutTxid: legacyTxidOf(p)!, prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff })),
    outputs,
    locktime: 0,
  };
}
const rootAnchorPayload = (newRoot: string, batchSize: number): Uint8Array =>
  encodeEvent({ type: EventType.RootAnchor, prevRoot: PREV_ROOT, newRoot, batchSize });

const anchorTx = anchorTxWith([
  { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) },
  { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
]);
const ANCHOR_TXID = legacyTxidOf(anchorTx)!;
const MINED_HEIGHT = 800_000;

/** A 1-tx block for `tx` (merkle root = internal(txid), pos 0, no siblings) + a header source serving it. */
function blockFor(tx: LegacyTransaction, height = MINED_HEIGHT): {
  txid: string; headerHex: string; headerSource: BitcoinHeaderSource;
} {
  const txid = legacyTxidOf(tx)!;
  const headerHex = make80ByteHeader(internal(txid));
  return { txid, headerHex, headerSource: { headerHexAtHeight: (h) => (h === height ? headerHex : null) } };
}
const block = blockFor(anchorTx);

const SCHEDULE: GateFeeSchedule = { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n };
const COMMITTED: CommittedBatchContents = {
  anchoredRoot: ROOT,
  batchSize: 2,
  leaves: [
    { leafKeyHex: "cd".repeat(32), canonicalNameByteLength: 7 },
    { leafKeyHex: "ef".repeat(32), canonicalNameByteLength: 9 },
  ],
};

function validInput(over: Partial<BuildConfirmedBatchAnchorInput> = {}): BuildConfirmedBatchAnchorInput {
  return {
    anchorTx,
    prevoutTxs: PREVOUTS,
    blockHeaderHex: block.headerHex,
    minedHeight: MINED_HEIGHT,
    merkle: [],
    pos: 0,
    headerSource: block.headerSource,
    ...over,
  };
}

describe("merkleRootFromProof / merkleRootHexFromHeaderHex — promoted byte-order primitive", () => {
  const A = "11".repeat(32);
  const B = "22".repeat(32);

  it("no-sibling identity → reversed(txid) (display → internal)", () => {
    expect(merkleRootFromProof(A, [], 0)).toEqual(internal(A));
  });

  it("2-leaf pairing: pos 0 puts acc on the left, pos 1 on the right; same root", () => {
    const expected = dsha256(concat(internal(A), internal(B)));
    expect(merkleRootFromProof(A, [B], 0)).toEqual(expected); // acc=A on left, sibling=B on right
    expect(merkleRootFromProof(B, [A], 1)).toEqual(expected); // acc=B on right, sibling=A on left
  });

  it("malformed txid / sibling (bad hex or wrong length) → null", () => {
    expect(merkleRootFromProof("xyz", [], 0)).toBeNull();
    expect(merkleRootFromProof(A, ["beef"], 0)).toBeNull();
  });

  it("malformed pos (negative / non-integer) → null (an empty path must not ignore a bad pos)", () => {
    expect(merkleRootFromProof(A, [], -1)).toBeNull();
    expect(merkleRootFromProof(A, [], 1.5)).toBeNull();
    expect(merkleRootFromProof(A, [B], -1)).toBeNull();
  });

  it("header merkle root = bytes 36..68 (internal hex); malformed header → null", () => {
    expect(merkleRootHexFromHeaderHex(block.headerHex)).toBe(bytesToHex(internal(ANCHOR_TXID)));
    expect(merkleRootHexFromHeaderHex("00")).toBeNull();
  });
});

describe("buildConfirmedBatchAnchor — firewall-positive (minted fact feeds the REAL enforceGateFee)", () => {
  it("a valid anchor + block + prevouts → ConfirmedBatchAnchor + feeTxParts that enforceGateFee ADMITS", () => {
    const r = buildConfirmedBatchAnchor(validInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirmedAnchor).toEqual({ anchorTxid: ANCHOR_TXID, minedHeight: MINED_HEIGHT, anchoredRoot: ROOT, batchSize: 2 });
    const gf = enforceGateFee({ confirmedAnchor: r.confirmedAnchor, committedBatch: COMMITTED, feeWitness: { ...r.feeTxParts, schedule: SCHEDULE } });
    expect(gf.verdict.adequate).toBe(true);
    if (!gf.verdict.adequate) return;
    expect(gf.verdict.kind).toBe("gate-fee-adequate");
  });

  it("anchoredRoot/batchSize come ONLY from the decode (no caller side-channel overrides them)", () => {
    const r = buildConfirmedBatchAnchor(validInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirmedAnchor.anchoredRoot).toBe(ROOT); // = decoded newRoot
    expect(r.confirmedAnchor.batchSize).toBe(2); // = decoded batchSize
    // a committed batch claiming a different root cannot bind → the audited predicate rejects (no false accept)
    const gf = enforceGateFee({ confirmedAnchor: r.confirmedAnchor, committedBatch: { ...COMMITTED, anchoredRoot: "cd".repeat(32) }, feeWitness: { ...r.feeTxParts, schedule: SCHEDULE } });
    expect(gf.verdict.adequate).toBe(false);
  });

  it("feeTxParts.anchorTx is the EXACT tx included + decoded (no facts-from-A / fee-from-B)", () => {
    const r = buildConfirmedBatchAnchor(validInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feeTxParts.anchorTx).toBe(anchorTx); // same reference: one tx for inclusion AND fees
    expect(r.feeTxParts.prevoutTxs).toBe(PREVOUTS);
    expect(legacyTxidOf(r.feeTxParts.anchorTx)).toBe(r.confirmedAnchor.anchorTxid);
  });

  it("explicit anchorVout selects the named RootAnchor OP_RETURN (no silent first-match)", () => {
    const ROOT_Y = "cd".repeat(32);
    const twoAnchors = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) }, // vout 0
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT_Y, 3)) }, // vout 1
      { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
    ]);
    const b = blockFor(twoAnchors);
    const r = buildConfirmedBatchAnchor({ ...validInput(), anchorTx: twoAnchors, blockHeaderHex: b.headerHex, headerSource: b.headerSource, anchorVout: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirmedAnchor.anchoredRoot).toBe(ROOT_Y);
    expect(r.confirmedAnchor.batchSize).toBe(3);
  });
});

describe("buildConfirmedBatchAnchor — firewall-negatives (no fact, or a fact the kernel rejects)", () => {
  it("anchor tx not in the block (forged merkle path) → anchor-not-included", () => {
    const r = buildConfirmedBatchAnchor(validInput({ merkle: ["22".repeat(32)], pos: 0 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-not-included");
  });

  it("header source has no header at minedHeight → anchor-noncanonical-header", () => {
    const r = buildConfirmedBatchAnchor(validInput({ minedHeight: 999_999 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-noncanonical-header");
  });

  it("block header ≠ the source's header at minedHeight → anchor-noncanonical-header", () => {
    const r = buildConfirmedBatchAnchor(validInput({ blockHeaderHex: make80ByteHeader(internal("99".repeat(32))) }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-noncanonical-header");
  });

  it("a throwing header source → anchor-noncanonical-header (never throws)", () => {
    const throwing: BitcoinHeaderSource = { headerHexAtHeight: () => { throw new Error("rpc down"); } };
    let r: ReturnType<typeof buildConfirmedBatchAnchor> | undefined;
    expect(() => { r = buildConfirmedBatchAnchor(validInput({ headerSource: throwing })); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("anchor-noncanonical-header");
  });

  it("no RootAnchor OP_RETURN (missing payload) → anchor-malformed", () => {
    const noAnchor = anchorTxWith([{ valueSats: 7_000_000n, scriptPubKeyHex: "51" }]);
    const b = blockFor(noAnchor);
    const r = buildConfirmedBatchAnchor({ ...validInput(), anchorTx: noAnchor, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-malformed");
  });

  it("wrong-type OP_RETURN (a Transfer 0x03, not a RootAnchor) → anchor-malformed", () => {
    const transferPayload = encodeEvent({ type: EventType.Transfer, prevStateTxid: "00".repeat(32), newOwnerPubkey: "02".repeat(32), flags: 0, successorBondVout: 0, signature: "00".repeat(64) });
    const wrongType = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(transferPayload) },
      { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
    ]);
    const b = blockFor(wrongType);
    const r = buildConfirmedBatchAnchor({ ...validInput(), anchorTx: wrongType, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-malformed");
  });

  it("an OP_RETURN with trailing bytes after the push → anchor-malformed (script consumed exactly, no loose parse)", () => {
    const withTrailing = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) + "00" }, // valid push + 1 trailing byte
      { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
    ]);
    const b = blockFor(withTrailing);
    const r = buildConfirmedBatchAnchor({ ...validInput(), anchorTx: withTrailing, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-malformed");
  });

  it("multiple RootAnchor OP_RETURNs without an explicit anchorVout → anchor-malformed (no first-match)", () => {
    const twoAnchors = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) },
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload("cd".repeat(32), 3)) },
      { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
    ]);
    const b = blockFor(twoAnchors);
    const r = buildConfirmedBatchAnchor({ ...validInput(), anchorTx: twoAnchors, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-malformed");
  });

  it("a minted anchor whose fee parts lack prevouts yields NO admitted fee fact (firewall-negative pipe)", () => {
    const r = buildConfirmedBatchAnchor(validInput({ prevoutTxs: [] }));
    expect(r.ok).toBe(true); // ANCHOR mints — it does not judge fee adequacy (that is gateFeeValidation)
    if (!r.ok) return;
    const gf = enforceGateFee({ confirmedAnchor: r.confirmedAnchor, committedBatch: COMMITTED, feeWitness: { ...r.feeTxParts, schedule: SCHEDULE } });
    expect(gf.verdict.adequate).toBe(false); // no prevouts → the audited predicate cannot recompute the fee
  });

  // round 2 (CL): a malformed inclusion coordinate must not mint. With a 1-tx block + empty path, pos is
  // otherwise ignored, so a bad pos could falsely accept unless the merkle helper rejects it.
  it("malformed pos (negative / non-integer) → anchor-not-included (no mint)", () => {
    for (const pos of [-1, 1.5]) {
      const r = buildConfirmedBatchAnchor(validInput({ pos }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("anchor-not-included");
    }
  });

  // round 2 (CL): an explicit anchorVout must NOT fall back to scanning other outputs.
  it("explicit anchorVout pointing at a non-anchor OP_RETURN → anchor-malformed (no fallback to a valid vout 0)", () => {
    const mixed = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) }, // valid RootAnchor at vout 0
      { valueSats: 0n, scriptPubKeyHex: "6a04deadbeef" }, // garbage OP_RETURN at vout 1
      { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
    ]);
    const b = blockFor(mixed);
    const r = buildConfirmedBatchAnchor({ ...validInput(), anchorTx: mixed, blockHeaderHex: b.headerHex, headerSource: b.headerSource, anchorVout: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("anchor-malformed");
  });

  it("out-of-range / non-integer anchorVout → anchor-malformed", () => {
    for (const anchorVout of [99, 1.5, -1]) {
      const r = buildConfirmedBatchAnchor(validInput({ anchorVout }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("anchor-malformed");
    }
  });

  // round 2 (CL): a malformed minedHeight must not call through into a header-source lookup and mint a
  // seam fact with a bad height.
  it("non-integer / negative minedHeight → anchor-noncanonical-header (no header-source call, no mint)", () => {
    let probed = false;
    const tripwire: BitcoinHeaderSource = { headerHexAtHeight: () => { probed = true; return block.headerHex; } };
    for (const minedHeight of [-1, 1.5]) {
      const r = buildConfirmedBatchAnchor(validInput({ minedHeight, headerSource: tripwire }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("anchor-noncanonical-header");
    }
    expect(probed).toBe(false); // a malformed height never reaches the header source
  });
});

describe("buildConfirmedBatchAnchor — totality", () => {
  it("is deterministic", () => {
    expect(buildConfirmedBatchAnchor(validInput())).toEqual(buildConfirmedBatchAnchor(validInput()));
  });

  it("never throws on bogus input", () => {
    expect(() => buildConfirmedBatchAnchor({ ...validInput(), anchorTx: null as unknown as LegacyTransaction })).not.toThrow();
    expect(() => buildConfirmedBatchAnchor(null as unknown as BuildConfirmedBatchAnchorInput)).not.toThrow();
  });
});

describe("decodeRootAnchorFields (LE-INDEX prevRoot decode — reuses the firewall decode path)", () => {
  it("decodes prevRoot/newRoot/batchSize from the anchor (prevRoot is what the ConfirmedBatchAnchor mint drops)", () => {
    expect(decodeRootAnchorFields(anchorTx)).toEqual({ prevRoot: PREV_ROOT, newRoot: ROOT, batchSize: 2 });
  });

  it("explicit anchorVout selects the NAMED RootAnchor (no fallback to another output)", () => {
    const ROOT_Y = "cd".repeat(32);
    const twoAnchors = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) }, // vout 0
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT_Y, 3)) }, // vout 1
      { valueSats: 7_000_000n, scriptPubKeyHex: "51" },
    ]);
    expect(decodeRootAnchorFields(twoAnchors, 1)).toEqual({ prevRoot: PREV_ROOT, newRoot: ROOT_Y, batchSize: 3 });
  });

  it("two decodable RootAnchors without anchorVout → null (exactly-one, no silent first-match)", () => {
    const ROOT_Y = "cd".repeat(32);
    const twoAnchors = anchorTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT, 2)) },
      { valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchorPayload(ROOT_Y, 3)) },
    ]);
    expect(decodeRootAnchorFields(twoAnchors)).toBeNull();
  });

  it("no RootAnchor OP_RETURN → null", () => {
    expect(decodeRootAnchorFields(anchorTxWith([{ valueSats: 7_000_000n, scriptPubKeyHex: "51" }]))).toBeNull();
  });

  it("anchorVout out of range → null (no fallback)", () => {
    expect(decodeRootAnchorFields(anchorTx, 99)).toBeNull();
  });
});
