import { describe, expect, it } from "vitest";
import { schnorr } from "@noble/curves/secp256k1.js";
import {
  encodeEvent,
  EventType,
  RECOVERY_DESCRIPTOR_FORMAT,
  RECOVERY_DESCRIPTOR_VERSION_V2,
  bytesToHex,
  hexToBytes,
  recoveryDescriptorDigest,
  recoverAuthDigest,
} from "@ont/wire";
import { legacyTxidOf, type BitcoinHeaderSource, type LegacyTransaction } from "@ont/bitcoin";
import { enforceRecoveryInvoke } from "@ont/claim-path";
import {
  buildConfirmedRecoverOwnerInvoke,
  type BuildConfirmedRecoverOwnerInvokeInput,
} from "./confirmed-recover-invoke.js";

// B4-INDEX-INVOKE red battery (B4_ADAPTERS_PLAN §9.10). The firewall: the minted ConfirmedRecoverOwner
// Invoke is piped into the REAL B3 enforceRecoveryInvoke — a valid invoke authorizes; the adapter decodes
// + BINDS but does NOT pre-decide authority (a non-invoke-flags event still mints, the kernel rejects). The
// 171-byte RecoverOwner rides an OP_RETURN PUSHDATA1 carrier. RED until the adapter lands (the stub rejects).

// ---------- byte helpers ----------
const reversed = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
const internal = (displayHex: string): Uint8Array => reversed(hexToBytes(displayHex));
function make80ByteHeader(merkleInternal: Uint8Array): string {
  const h = new Uint8Array(80);
  h[0] = 1;
  h.set(merkleInternal, 36);
  return bytesToHex(h);
}
/** OP_RETURN scriptPubKey hex carrying `payload` via the minimal push (direct ≤75, else OP_PUSHDATA1). */
function opReturn(payload: Uint8Array): string {
  const len = payload.length;
  const prefix = len <= 75 ? Uint8Array.of(0x6a, len) : Uint8Array.of(0x6a, 0x4c, len);
  return bytesToHex(prefix) + bytesToHex(payload);
}

// ---------- the I-REC fixture (mirrors enforce-recovery-invoke.test.ts buildValid) ----------
const AUX = new Uint8Array(32);
const xonly = (privHex: string): string => bytesToHex(schnorr.getPublicKey(hexToBytes(privHex)));
const OWNER_PRIV = "11".repeat(32);
const OWNER_PUB = xonly(OWNER_PRIV);
const RECOVERY_PRIV = "33".repeat(32);
const RECOVERY_PUB = xonly(RECOVERY_PRIV);
const REF = "aa".repeat(32);
const HEAD_TXID = "cc".repeat(32);
const NEW_OWNER = "dd".repeat(32);
const NAME = "alice";
const T0 = "2026-01-01T00:00:00Z";
const SEQ = 3;
const CWB = 144;
const W_R = 20;
const H_R = 100000;

const unsignedDescriptor: Record<string, unknown> = {
  format: RECOVERY_DESCRIPTOR_FORMAT,
  descriptorVersion: RECOVERY_DESCRIPTOR_VERSION_V2,
  name: NAME,
  ownerPubkey: OWNER_PUB,
  ownershipRef: REF,
  sequence: SEQ,
  previousDescriptorHash: null,
  recoveryAddress: "bc1qrecoveryexampleaddr0000000000000000",
  signingProfile: "bip322",
  challengeWindowBlocks: CWB,
  issuedAt: T0,
  recoveryPubkey: RECOVERY_PUB,
  signature: "00".repeat(64),
};
const descriptorDigest = recoveryDescriptorDigest(unsignedDescriptor);
const descriptor = { ...unsignedDescriptor, signature: bytesToHex(schnorr.sign(descriptorDigest, hexToBytes(OWNER_PRIV), AUX)) };
const descHash = bytesToHex(descriptorDigest);

function invokeSignature(flags: number): string {
  const w13 = recoverAuthDigest({ prevStateTxid: HEAD_TXID, newOwnerPubkey: NEW_OWNER, flags, successorBondVout: 0, challengeWindowBlocks: CWB, recoveryDescriptorHash: descHash });
  return bytesToHex(schnorr.sign(w13, hexToBytes(RECOVERY_PRIV), AUX));
}
function recoverOwnerPayload(flags: number): Uint8Array {
  return encodeEvent({ type: EventType.RecoverOwner, prevStateTxid: HEAD_TXID, newOwnerPubkey: NEW_OWNER, flags, successorBondVout: 0, challengeWindowBlocks: CWB, recoveryDescriptorHash: descHash, signature: invokeSignature(flags) });
}

const NAME_STATE = { ownerPubkey: OWNER_PUB, headTxid: HEAD_TXID, currentOwnershipRef: REF, recoveryDescriptorHeadHash: descHash, recoveryDescriptorHeadSequence: SEQ };
const RECOVERY_PARAMS = { recoveryEvidenceWindowBlocks: W_R };

// ---------- the invoke tx + 1-tx block ----------
function invokeTxWith(outputs: readonly { valueSats: bigint; scriptPubKeyHex: string }[]): LegacyTransaction {
  return { version: 1, inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }], outputs, locktime: 0 };
}
const invokeTx = invokeTxWith([{ valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(0)) }]);
const MINED_HEIGHT = H_R;

function blockFor(tx: LegacyTransaction, height = MINED_HEIGHT): { headerHex: string; headerSource: BitcoinHeaderSource } {
  const headerHex = make80ByteHeader(internal(legacyTxidOf(tx)!));
  return { headerHex, headerSource: { headerHexAtHeight: (h) => (h === height ? headerHex : null) } };
}
const block = blockFor(invokeTx);

function validInput(over: Partial<BuildConfirmedRecoverOwnerInvokeInput> = {}): BuildConfirmedRecoverOwnerInvokeInput {
  return { invokeTx, blockHeaderHex: block.headerHex, minedHeight: MINED_HEIGHT, merkle: [], pos: 0, headerSource: block.headerSource, ...over };
}

const INVOKE_FIELD_KEYS = ["challengeWindowBlocks", "flags", "newOwnerPubkey", "prevStateTxid", "recoveryDescriptorHash", "signature", "successorBondVout"];

describe("buildConfirmedRecoverOwnerInvoke — firewall-positive (minted fact feeds the REAL enforceRecoveryInvoke)", () => {
  it("a valid RecoverOwner invoke (171-byte PUSHDATA1) → a fact enforceRecoveryInvoke AUTHORIZES", () => {
    const r = buildConfirmedRecoverOwnerInvoke(validInput());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // structured-tx discipline: txid is the included/decoded tx; fields + descriptor hash from the DECODE.
    expect(r.confirmedInvoke.txid).toBe(legacyTxidOf(invokeTx));
    expect(r.confirmedInvoke.recoveryDescriptorHash).toBe(descHash);
    expect(r.confirmedInvoke.invokeFields.recoveryDescriptorHash).toBe(descHash);
    expect(Object.keys(r.confirmedInvoke.invokeFields).sort()).toEqual(INVOKE_FIELD_KEYS); // no type/minedHeight/source
    const { verdict } = enforceRecoveryInvoke({ confirmedInvoke: r.confirmedInvoke, descriptor, nameState: NAME_STATE, recoveryParams: RECOVERY_PARAMS });
    expect(verdict.authorized).toBe(true);
    if (!verdict.authorized) return;
    expect(verdict.kind).toBe("recovery-invoke-authorized");
    expect(verdict.proposedOwnerPubkey).toBe(NEW_OWNER);
  });

  it("a well-formed RecoverOwner with non-invoke flags STILL mints; the kernel rejects (non-invoke-flags)", () => {
    const flagged = invokeTxWith([{ valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(1)) }]);
    const b = blockFor(flagged);
    const r = buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: flagged, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(true); // the adapter decodes + binds; it does NOT pre-decide authority
    if (!r.ok) return;
    expect(r.confirmedInvoke.invokeFields.flags).toBe(1);
    const { verdict } = enforceRecoveryInvoke({ confirmedInvoke: r.confirmedInvoke, descriptor, nameState: NAME_STATE, recoveryParams: RECOVERY_PARAMS });
    expect(verdict.authorized).toBe(false);
    if (verdict.authorized) return;
    expect(verdict.reason).toBe("non-invoke-flags");
  });

  it("explicit invokeVout selects the named RecoverOwner OP_RETURN (no first-match)", () => {
    const two = invokeTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(0)) },
      { valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(0)) },
    ]);
    const b = blockFor(two);
    const r = buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: two, blockHeaderHex: b.headerHex, headerSource: b.headerSource, invokeVout: 1 });
    expect(r.ok).toBe(true);
  });
});

describe("buildConfirmedRecoverOwnerInvoke — firewall-negatives", () => {
  it("no RecoverOwner OP_RETURN (a RootAnchor instead) → invoke-malformed", () => {
    const rootAnchor = encodeEvent({ type: EventType.RootAnchor, prevRoot: "00".repeat(32), newRoot: "ab".repeat(32), batchSize: 1 });
    const tx = invokeTxWith([{ valueSats: 0n, scriptPubKeyHex: opReturn(rootAnchor) }]);
    const b = blockFor(tx);
    const r = buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: tx, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invoke-malformed");
  });

  it("multiple RecoverOwner OP_RETURNs without invokeVout → invoke-malformed (no first-match)", () => {
    const two = invokeTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(0)) },
      { valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(0)) },
    ]);
    const b = blockFor(two);
    const r = buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: two, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invoke-malformed");
  });

  it("explicit invokeVout pointing at a non-RecoverOwner OP_RETURN → invoke-malformed (no fallback)", () => {
    const mixed = invokeTxWith([
      { valueSats: 0n, scriptPubKeyHex: opReturn(recoverOwnerPayload(0)) }, // valid at vout 0
      { valueSats: 0n, scriptPubKeyHex: "6a04deadbeef" }, // garbage at vout 1
    ]);
    const b = blockFor(mixed);
    const r = buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: mixed, blockHeaderHex: b.headerHex, headerSource: b.headerSource, invokeVout: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invoke-malformed");
  });

  it("out-of-range / non-integer invokeVout → invoke-malformed", () => {
    for (const invokeVout of [99, 1.5, -1]) {
      const r = buildConfirmedRecoverOwnerInvoke(validInput({ invokeVout }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("invoke-malformed");
    }
  });

  it("carrier: trailing bytes / multi-push / unsupported push form → invoke-malformed", () => {
    const payload = recoverOwnerPayload(0);
    const trailing = invokeTxWith([{ valueSats: 0n, scriptPubKeyHex: opReturn(payload) + "00" }]);
    const multiPush = invokeTxWith([{ valueSats: 0n, scriptPubKeyHex: "6a01ff01ee" }]); // OP_RETURN + two 1-byte pushes
    const pushdata2 = invokeTxWith([{ valueSats: 0n, scriptPubKeyHex: "6a4d0100" + "aa".repeat(256) }]); // OP_PUSHDATA2
    for (const tx of [trailing, multiPush, pushdata2]) {
      const b = blockFor(tx);
      const r = buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: tx, blockHeaderHex: b.headerHex, headerSource: b.headerSource });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("invoke-malformed");
    }
  });

  it("forged merkle path → invoke-not-included", () => {
    const r = buildConfirmedRecoverOwnerInvoke(validInput({ merkle: ["22".repeat(32)], pos: 0 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invoke-not-included");
  });

  it("header source null / mismatch / throw → invoke-noncanonical-header (never throws)", () => {
    const unknownHeight = buildConfirmedRecoverOwnerInvoke(validInput({ minedHeight: 999_999 }));
    const mismatch = buildConfirmedRecoverOwnerInvoke(validInput({ blockHeaderHex: make80ByteHeader(internal("99".repeat(32))) }));
    const throwing: BitcoinHeaderSource = { headerHexAtHeight: () => { throw new Error("rpc down"); } };
    let thrown: ReturnType<typeof buildConfirmedRecoverOwnerInvoke> | undefined;
    expect(() => { thrown = buildConfirmedRecoverOwnerInvoke(validInput({ headerSource: throwing })); }).not.toThrow();
    for (const r of [unknownHeight, mismatch, thrown!]) {
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("invoke-noncanonical-header");
    }
  });

  it("non-integer / negative minedHeight → invoke-noncanonical-header without consulting the header source", () => {
    let probed = false;
    const tripwire: BitcoinHeaderSource = { headerHexAtHeight: () => { probed = true; return block.headerHex; } };
    for (const minedHeight of [-1, 1.5]) {
      const r = buildConfirmedRecoverOwnerInvoke(validInput({ minedHeight, headerSource: tripwire }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("invoke-noncanonical-header");
    }
    expect(probed).toBe(false);
  });
});

describe("buildConfirmedRecoverOwnerInvoke — totality", () => {
  it("is deterministic", () => {
    expect(buildConfirmedRecoverOwnerInvoke(validInput())).toEqual(buildConfirmedRecoverOwnerInvoke(validInput()));
  });

  it("never throws on bogus input", () => {
    expect(() => buildConfirmedRecoverOwnerInvoke({ ...validInput(), invokeTx: null as unknown as LegacyTransaction })).not.toThrow();
    expect(() => buildConfirmedRecoverOwnerInvoke(null as unknown as BuildConfirmedRecoverOwnerInvokeInput)).not.toThrow();
  });
});
