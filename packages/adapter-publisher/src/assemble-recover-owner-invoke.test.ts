import { describe, expect, it } from "vitest";
import { legacyTxidOf, type BitcoinHeaderSource, type LegacyTransaction } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import { buildConfirmedRecoverOwnerInvoke } from "@ont/adapter-indexer";
import {
  assembleRecoverOwnerInvokeTx,
  type AssembleRecoverOwnerInvokeInput,
  type RecoverOwnerInvokeFundingInput,
} from "./assemble-recover-owner-invoke.js";

// B4-PUB-INVOKE red battery (B4_ADAPTERS_PLAN §11.2). A write-side adapter validates no untrusted input; the
// bar is the WRITE→READ round-trip — the assembled recover-owner invoke tx, in a synthetic 1-tx block, is
// ACCEPTED by the audited read-side buildConfirmedRecoverOwnerInvoke (no invokeVout: exactly one RecoverOwner
// at vout 0) with every decoded field equal to the operator intent. RED until the assembler lands (stub null).

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

const PREV_STATE_TXID = "0a".repeat(32); // letter-containing so .toUpperCase() actually differs
const NEW_OWNER_PUBKEY = "ab".repeat(32);
const RECOVERY_DESCRIPTOR_HASH = "cd".repeat(32);
const SIGNATURE = "ef".repeat(64); // 64-byte schnorr sig, 128 hex
const FLAGS = 0;
const SUCCESSOR_BOND_VOUT = 1;
const CHALLENGE_WINDOW_BLOCKS = 144;
const MINED_HEIGHT = 800_000;
const fundingInputs: readonly RecoverOwnerInvokeFundingInput[] = [
  { prevoutTxid: "11".repeat(32), prevoutVout: 0 },
  { prevoutTxid: "22".repeat(32), prevoutVout: 1, sequence: 0xfffffffe },
];

function validInput(over: Partial<AssembleRecoverOwnerInvokeInput> = {}): AssembleRecoverOwnerInvokeInput {
  return {
    prevStateTxid: PREV_STATE_TXID,
    newOwnerPubkey: NEW_OWNER_PUBKEY,
    flags: FLAGS,
    successorBondVout: SUCCESSOR_BOND_VOUT,
    challengeWindowBlocks: CHALLENGE_WINDOW_BLOCKS,
    recoveryDescriptorHash: RECOVERY_DESCRIPTOR_HASH,
    signature: SIGNATURE,
    fundingInputs,
    ...over,
  };
}

/** Drop the assembled tx into a 1-tx synthetic block and run the read-side firewall (no invokeVout). */
function roundTrip(tx: LegacyTransaction): ReturnType<typeof buildConfirmedRecoverOwnerInvoke> {
  const headerHex = make80ByteHeader(internal(legacyTxidOf(tx)!));
  const headerSource: BitcoinHeaderSource = { headerHexAtHeight: (h) => (h === MINED_HEIGHT ? headerHex : null) };
  return buildConfirmedRecoverOwnerInvoke({ invokeTx: tx, blockHeaderHex: headerHex, minedHeight: MINED_HEIGHT, merkle: [], pos: 0, headerSource });
}

describe("assembleRecoverOwnerInvokeTx — WRITE→READ round-trip (the bar)", () => {
  it("the assembled tx is accepted by buildConfirmedRecoverOwnerInvoke; decoded fields equal operator intent", () => {
    const tx = assembleRecoverOwnerInvokeTx(validInput());
    expect(tx).not.toBeNull();
    if (tx === null) return;
    const r = roundTrip(tx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirmedInvoke.txid).toBe(legacyTxidOf(tx));
    expect(r.confirmedInvoke.minedHeight).toBe(MINED_HEIGHT);
    expect(r.confirmedInvoke.recoveryDescriptorHash).toBe(RECOVERY_DESCRIPTOR_HASH);
    expect(r.confirmedInvoke.invokeFields).toEqual({
      prevStateTxid: PREV_STATE_TXID,
      newOwnerPubkey: NEW_OWNER_PUBKEY,
      flags: FLAGS,
      successorBondVout: SUCCESSOR_BOND_VOUT,
      challengeWindowBlocks: CHALLENGE_WINDOW_BLOCKS,
      recoveryDescriptorHash: RECOVERY_DESCRIPTOR_HASH,
      signature: SIGNATURE,
    });
  });

  it("a change output appended after vout 0 still round-trips (exactly-one rule holds)", () => {
    const tx = assembleRecoverOwnerInvokeTx(validInput({ changeOutput: { valueSats: 50_000n, scriptPubKeyHex: "51" } }));
    expect(tx).not.toBeNull();
    if (tx === null) return;
    expect(tx.outputs.length).toBe(2);
    expect(tx.outputs[1]).toEqual({ valueSats: 50_000n, scriptPubKeyHex: "51" });
    expect(roundTrip(tx).ok).toBe(true);
  });

  it("valid-but-authority-bad flags=1 still assembles and round-trips (publisher encodes intent, does not judge authority)", () => {
    const tx = assembleRecoverOwnerInvokeTx(validInput({ flags: 1 }));
    expect(tx).not.toBeNull();
    if (tx === null) return;
    const r = roundTrip(tx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirmedInvoke.invokeFields.flags).toBe(1);
  });
});

describe("assembleRecoverOwnerInvokeTx — structural conformance", () => {
  it("vout 0 OP_RETURN is the exact minimal PUSHDATA1 RecoverOwner payload (no pre-encoded side channel)", () => {
    const tx = assembleRecoverOwnerInvokeTx(validInput());
    expect(tx).not.toBeNull();
    if (tx === null) return;
    const payload = encodeEvent({
      type: EventType.RecoverOwner,
      prevStateTxid: PREV_STATE_TXID,
      newOwnerPubkey: NEW_OWNER_PUBKEY,
      flags: FLAGS,
      successorBondVout: SUCCESSOR_BOND_VOUT,
      challengeWindowBlocks: CHALLENGE_WINDOW_BLOCKS,
      recoveryDescriptorHash: RECOVERY_DESCRIPTOR_HASH,
      signature: SIGNATURE,
    });
    expect(payload.length).toBe(171);
    expect(tx.outputs[0]!.valueSats).toBe(0n);
    expect(tx.outputs[0]!.scriptPubKeyHex).toBe("6a4cab" + bytesToHex(payload));
  });

  it("tx conformance: legacyTxidOf non-null, version 1, locktime 0, inputs preserved, scriptSig empty, sequences", () => {
    const tx = assembleRecoverOwnerInvokeTx(validInput());
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
    const tx = assembleRecoverOwnerInvokeTx(validInput({ version: 2, locktime: 500_000 }));
    expect(tx).not.toBeNull();
    if (tx === null) return;
    expect(tx.version).toBe(2);
    expect(tx.locktime).toBe(500_000);
    expect(legacyTxidOf(tx)).not.toBeNull();
  });
});

describe("assembleRecoverOwnerInvokeTx — malformed operator intent → null (never throws)", () => {
  it("bad / uppercase 32-byte hex fields → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ prevStateTxid: PREV_STATE_TXID.toUpperCase() }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ newOwnerPubkey: NEW_OWNER_PUBKEY.toUpperCase() }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ recoveryDescriptorHash: RECOVERY_DESCRIPTOR_HASH.toUpperCase() }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ recoveryDescriptorHash: "xyz" }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ prevStateTxid: "11".repeat(16) }))).toBeNull(); // wrong length
  });

  it("bad 64-byte signature → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ signature: SIGNATURE.toUpperCase() }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ signature: "ef".repeat(32) }))).toBeNull(); // wrong length
    expect(assembleRecoverOwnerInvokeTx(validInput({ signature: "zz".repeat(64) }))).toBeNull(); // non-hex
  });

  it("non-byte flags / successorBondVout → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ flags: 256 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ flags: -1 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ successorBondVout: 256 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ successorBondVout: 2.5 }))).toBeNull();
  });

  it("non-u32 challengeWindowBlocks → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ challengeWindowBlocks: 2.5 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ challengeWindowBlocks: -1 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ challengeWindowBlocks: 0x1_0000_0000 }))).toBeNull();
  });

  it("empty / malformed fundingInputs → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: [] }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: [{ prevoutTxid: "AA".repeat(32), prevoutVout: 0 }] }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: [{ prevoutTxid: "11".repeat(16), prevoutVout: 0 }] }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: -1 }] }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: 0, sequence: -1 }] }))).toBeNull();
  });

  it("malformed changeOutput (negative value / > u64 / odd-hex / uppercase-hex / OP_RETURN script) → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ changeOutput: { valueSats: -1n, scriptPubKeyHex: "51" } }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ changeOutput: { valueSats: 1n << 64n, scriptPubKeyHex: "51" } }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ changeOutput: { valueSats: 1000n, scriptPubKeyHex: "xyz" } }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ changeOutput: { valueSats: 1000n, scriptPubKeyHex: "AB".repeat(11) } }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ changeOutput: { valueSats: 1000n, scriptPubKeyHex: "6a04deadbeef" } }))).toBeNull();
  });

  it("non-u32 version / locktime → null", () => {
    expect(assembleRecoverOwnerInvokeTx(validInput({ version: 2.5 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ version: -1 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ locktime: 2.5 }))).toBeNull();
    expect(assembleRecoverOwnerInvokeTx(validInput({ locktime: -1 }))).toBeNull();
  });

  it("never throws on bogus input", () => {
    expect(() => assembleRecoverOwnerInvokeTx(null as unknown as AssembleRecoverOwnerInvokeInput)).not.toThrow();
    expect(() => assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: null as unknown as RecoverOwnerInvokeFundingInput[] }))).not.toThrow();
  });
});

describe("assembleRecoverOwnerInvokeTx — determinism + immutability", () => {
  it("is deterministic", () => {
    const a = assembleRecoverOwnerInvokeTx(validInput());
    expect(a).not.toBeNull();
    expect(a).toEqual(assembleRecoverOwnerInvokeTx(validInput()));
  });

  it("does not mutate the caller's fundingInputs array", () => {
    const callerInputs: RecoverOwnerInvokeFundingInput[] = [{ prevoutTxid: "11".repeat(32), prevoutVout: 0 }];
    const snapshot = JSON.parse(JSON.stringify(callerInputs));
    assembleRecoverOwnerInvokeTx(validInput({ fundingInputs: callerInputs }));
    expect(JSON.parse(JSON.stringify(callerInputs))).toEqual(snapshot);
  });
});
