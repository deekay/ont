import { describe, expect, it } from "vitest";
import { legacyTxidOf, type BitcoinHeaderSource, type LegacyTransaction } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import { buildConfirmedBatchAnchor } from "@ont/adapter-indexer";
import {
  assembleRootAnchorTx,
  type AssembleRootAnchorInput,
  type RootAnchorFundingInput,
} from "./assemble-root-anchor.js";

// B4-PUB-ANCHOR red battery (B4_ADAPTERS_PLAN §11.1). A write-side adapter validates no untrusted input;
// the bar is the WRITE→READ round-trip — the assembled RootAnchor tx, in a synthetic block, is ACCEPTED by
// the audited read-side buildConfirmedBatchAnchor (no anchorVout: exactly one RootAnchor at vout 0). RED
// until the assembler lands (the stub returns null).

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
const reversed = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
const internal = (displayHex: string): Uint8Array => reversed(hexToBytes(displayHex));
function make80ByteHeader(merkleInternal: Uint8Array): string {
  const h = new Uint8Array(80);
  h[0] = 1;
  h.set(merkleInternal, 36);
  return bytesToHex(h);
}

const PREV_ROOT = "0a".repeat(32); // letter-containing so .toUpperCase() actually differs (uppercase-reject pin)
const NEW_ROOT = "ab".repeat(32);
const BATCH_SIZE = 2;
const MINED_HEIGHT = 800_000;
const fundingInputs: readonly RootAnchorFundingInput[] = [
  { prevoutTxid: "11".repeat(32), prevoutVout: 0 },
  { prevoutTxid: "22".repeat(32), prevoutVout: 1, sequence: 0xfffffffe },
];

function validInput(over: Partial<AssembleRootAnchorInput> = {}): AssembleRootAnchorInput {
  return { prevRoot: PREV_ROOT, newRoot: NEW_ROOT, batchSize: BATCH_SIZE, fundingInputs, ...over };
}

/** Drop the assembled tx into a 1-tx synthetic block and run the read-side firewall (no anchorVout). */
function roundTrip(tx: LegacyTransaction): ReturnType<typeof buildConfirmedBatchAnchor> {
  const headerHex = make80ByteHeader(internal(legacyTxidOf(tx)!));
  const headerSource: BitcoinHeaderSource = { headerHexAtHeight: (h) => (h === MINED_HEIGHT ? headerHex : null) };
  return buildConfirmedBatchAnchor({ anchorTx: tx, prevoutTxs: [], blockHeaderHex: headerHex, minedHeight: MINED_HEIGHT, merkle: [], pos: 0, headerSource });
}

describe("assembleRootAnchorTx — WRITE→READ round-trip (the bar)", () => {
  it("the assembled tx is accepted by buildConfirmedBatchAnchor (no anchorVout; exactly one RootAnchor at vout 0)", () => {
    const tx = assembleRootAnchorTx(validInput());
    expect(tx).not.toBeNull();
    if (tx === null) return;
    const r = roundTrip(tx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirmedAnchor.anchoredRoot).toBe(NEW_ROOT);
    expect(r.confirmedAnchor.batchSize).toBe(BATCH_SIZE);
    expect(r.confirmedAnchor.anchorTxid).toBe(legacyTxidOf(tx));
  });

  it("a change output appended after vout 0 still round-trips (exactly-one rule holds)", () => {
    const tx = assembleRootAnchorTx(validInput({ changeOutput: { valueSats: 50_000n, scriptPubKeyHex: "51" } }));
    expect(tx).not.toBeNull();
    if (tx === null) return;
    expect(tx.outputs.length).toBe(2);
    expect(tx.outputs[1]).toEqual({ valueSats: 50_000n, scriptPubKeyHex: "51" });
    expect(roundTrip(tx).ok).toBe(true);
  });
});

describe("assembleRootAnchorTx — structural conformance", () => {
  it("vout 0 OP_RETURN is the exact minimal direct-push RootAnchor payload (no pre-encoded side channel)", () => {
    const tx = assembleRootAnchorTx(validInput());
    expect(tx).not.toBeNull();
    if (tx === null) return;
    const payload = encodeEvent({ type: EventType.RootAnchor, prevRoot: PREV_ROOT, newRoot: NEW_ROOT, batchSize: BATCH_SIZE });
    expect(tx.outputs[0]!.valueSats).toBe(0n);
    expect(tx.outputs[0]!.scriptPubKeyHex).toBe("6a49" + bytesToHex(payload));
  });

  it("tx conformance: legacyTxidOf non-null, version 1, locktime 0, inputs preserved, scriptSig empty, sequences", () => {
    const tx = assembleRootAnchorTx(validInput());
    expect(tx).not.toBeNull();
    if (tx === null) return;
    expect(legacyTxidOf(tx)).not.toBeNull();
    expect(tx.version).toBe(1);
    expect(tx.locktime).toBe(0);
    expect(tx.inputs.length).toBe(2);
    expect(tx.inputs[0]).toEqual({ prevoutTxid: "11".repeat(32), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff });
    expect(tx.inputs[1]).toEqual({ prevoutTxid: "22".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xfffffffe });
  });

  it("explicit valid version / locktime are preserved (and the tx stays serializable)", () => {
    const tx = assembleRootAnchorTx(validInput({ version: 2, locktime: 500_000 }));
    expect(tx).not.toBeNull();
    if (tx === null) return;
    expect(tx.version).toBe(2);
    expect(tx.locktime).toBe(500_000);
    expect(legacyTxidOf(tx)).not.toBeNull();
  });
});

describe("assembleRootAnchorTx — malformed operator intent → null (never throws)", () => {
  it("bad / uppercase roots → null", () => {
    expect(assembleRootAnchorTx(validInput({ prevRoot: PREV_ROOT.toUpperCase() }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ newRoot: NEW_ROOT.toUpperCase() }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ newRoot: "xyz" }))).toBeNull();
  });

  it("non-u32 batchSize → null", () => {
    expect(assembleRootAnchorTx(validInput({ batchSize: 2.5 }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ batchSize: -1 }))).toBeNull();
  });

  it("empty / malformed fundingInputs → null", () => {
    expect(assembleRootAnchorTx(validInput({ fundingInputs: [] }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ fundingInputs: [{ prevoutTxid: "AA".repeat(32), prevoutVout: 0 }] }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ fundingInputs: [{ prevoutTxid: "11".repeat(16), prevoutVout: 0 }] }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ fundingInputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: -1 }] }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ fundingInputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: 0, sequence: -1 }] }))).toBeNull();
  });

  it("malformed changeOutput (negative value / odd-hex / uppercase-hex / OP_RETURN script) → null", () => {
    expect(assembleRootAnchorTx(validInput({ changeOutput: { valueSats: -1n, scriptPubKeyHex: "51" } }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ changeOutput: { valueSats: 1n << 64n, scriptPubKeyHex: "51" } }))).toBeNull(); // > u64 max → not serializable → null
    expect(assembleRootAnchorTx(validInput({ changeOutput: { valueSats: 1000n, scriptPubKeyHex: "xyz" } }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ changeOutput: { valueSats: 1000n, scriptPubKeyHex: "AB".repeat(11) } }))).toBeNull(); // valid-hex UPPERCASE → not serializable → null
    expect(assembleRootAnchorTx(validInput({ changeOutput: { valueSats: 1000n, scriptPubKeyHex: "6a04deadbeef" } }))).toBeNull(); // no OP_RETURN change
  });

  it("non-u32 version / locktime → null", () => {
    expect(assembleRootAnchorTx(validInput({ version: 2.5 }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ version: -1 }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ locktime: 2.5 }))).toBeNull();
    expect(assembleRootAnchorTx(validInput({ locktime: -1 }))).toBeNull();
  });

  it("never throws on bogus input", () => {
    expect(() => assembleRootAnchorTx(null as unknown as AssembleRootAnchorInput)).not.toThrow();
    expect(() => assembleRootAnchorTx(validInput({ fundingInputs: null as unknown as RootAnchorFundingInput[] }))).not.toThrow();
  });
});

describe("assembleRootAnchorTx — determinism + immutability", () => {
  it("is deterministic", () => {
    const a = assembleRootAnchorTx(validInput());
    expect(a).not.toBeNull();
    expect(a).toEqual(assembleRootAnchorTx(validInput()));
  });

  it("does not mutate the caller's fundingInputs array", () => {
    const callerInputs: RootAnchorFundingInput[] = [{ prevoutTxid: "11".repeat(32), prevoutVout: 0 }];
    const snapshot = JSON.parse(JSON.stringify(callerInputs));
    assembleRootAnchorTx(validInput({ fundingInputs: callerInputs }));
    expect(JSON.parse(JSON.stringify(callerInputs))).toEqual(snapshot);
  });
});
