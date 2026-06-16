import { describe, expect, it } from "vitest";
import { signValueRecord, verifyValueRecord, verifyRecoveryDescriptor } from "@ont/protocol";
import {
  validateValueRecordSubmission,
  validateRecoveryDescriptorSubmission,
  projectServedValueHistory,
  projectServedRecoveryHistory,
  type OwnershipInterval,
} from "@ont/adapter-resolver";
import { createWalletSigner, type WalletSigner } from "./wallet-signer.js";

// B5-WALLET signer red battery. The wallet DELEGATE-signs value-records + recovery-descriptors; the signed
// artifacts must be accepted by the B4 resolver store-guards AND project through the served histories (the
// wallet reimplements no rules — it consumes L1/L4). The private key/seed NEVER cross the WalletSigner
// boundary. CLI/claim depend on the WalletSigner interface (or a test-local mock), never on signing internals.

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// owners[0] of packages/wire/vectors/keys.json — the secret the signer must hold internally + never expose.
const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const OWNER0_PUBKEY = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba";
const REF = "ab".repeat(32); // a 32-byte ownership ref (matches the indexed interval below)
const ISSUED_AT = "2026-01-01T00:00:00.000Z";

function ownership(ownerPubkey: string): OwnershipInterval {
  return { currentOwnerPubkey: ownerPubkey, ownershipRef: REF };
}

describe("createWalletSigner — derivation + fail-closed", () => {
  it("creates a signer whose ownerPubkey is the §5-derived x-only key", () => {
    const c = createWalletSigner(MNEMONIC, 0);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.signer.ownerPubkey).toBe(OWNER0_PUBKEY);
  });
  it("malformed mnemonic → fail-closed (never throws)", () => {
    let c: ReturnType<typeof createWalletSigner> | undefined;
    expect(() => { c = createWalletSigner("not a valid mnemonic", 0); }).not.toThrow();
    expect(c?.ok).toBe(false);
  });
});

describe("signed value record — accepted by the resolver guard + projects through history", () => {
  it("round-trips a freshly signed value record", () => {
    const c = createWalletSigner(MNEMONIC, 0);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const record = c.signer.signValueRecord({
      name: "alice",
      ownershipRef: REF,
      sequence: 1,
      previousRecordHash: null,
      valueType: 0,
      payloadHex: "00",
      issuedAt: ISSUED_AT,
    });

    expect(verifyValueRecord(record)).toBe(true);
    expect(record.ownerPubkey).toBe(OWNER0_PUBKEY);

    const guard = validateValueRecordSubmission({
      record,
      currentOwnership: ownership(c.signer.ownerPubkey),
      existingHead: null,
    });
    expect(guard.ok).toBe(true);

    const served = projectServedValueHistory({
      name: "alice",
      currentOwnership: ownership(c.signer.ownerPubkey),
      records: [record],
    });
    expect(served.ok).toBe(true);
  });
});

describe("signed recovery descriptor — accepted by the recovery guard + projects through history", () => {
  it("round-trips a freshly signed recovery descriptor", () => {
    const c = createWalletSigner(MNEMONIC, 0);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const descriptor = c.signer.signRecoveryDescriptor({
      name: "alice",
      ownershipRef: REF,
      sequence: 1,
      previousDescriptorHash: null,
      recoveryAddress: "bc1qrecoveryaddressexample0000000000000000",
      signingProfile: "default",
      challengeWindowBlocks: 144,
      issuedAt: ISSUED_AT,
    });

    expect(verifyRecoveryDescriptor(descriptor)).toBe(true);
    expect(descriptor.ownerPubkey).toBe(OWNER0_PUBKEY);

    const guard = validateRecoveryDescriptorSubmission({
      descriptor,
      currentOwnership: ownership(c.signer.ownerPubkey),
      existingHead: null,
    });
    expect(guard.ok).toBe(true);

    const served = projectServedRecoveryHistory({
      name: "alice",
      currentOwnership: ownership(c.signer.ownerPubkey),
      descriptors: [descriptor],
    });
    expect(served.ok).toBe(true);
  });
});

describe("no key material crosses the WalletSigner boundary", () => {
  it("the signer exposes no private key / seed / mnemonic, and signed artifacts carry none", () => {
    const c = createWalletSigner(MNEMONIC, 0);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const signer = c.signer;

    // No private-key/seed/mnemonic property on the signer, by name or by value.
    expect(Object.keys(signer)).not.toContain("ownerPrivateKeyHex");
    const signerDump = JSON.stringify(signer) ?? "";
    expect(signerDump).not.toContain(OWNER0_PRIVATE);
    expect(signerDump).not.toContain(MNEMONIC);

    const record = signer.signValueRecord({
      name: "alice",
      ownershipRef: REF,
      sequence: 1,
      previousRecordHash: null,
      valueType: 0,
      payloadHex: "00",
      issuedAt: ISSUED_AT,
    });
    const recordDump = JSON.stringify(record);
    expect(recordDump).not.toContain(OWNER0_PRIVATE);
    expect(recordDump).not.toContain(MNEMONIC);
    expect(Object.keys(record)).not.toContain("ownerPrivateKeyHex");
  });
});

describe("a mock satisfies the WalletSigner interface CLI/claim DELEGATE to", () => {
  // CLI/claim handoff depends on the narrow WalletSigner contract — not on wallet signing internals.
  function handoffSignValue(s: WalletSigner) {
    return s.signValueRecord({
      name: "alice",
      ownershipRef: REF,
      sequence: 1,
      previousRecordHash: null,
      valueType: 0,
      payloadHex: "00",
      issuedAt: ISSUED_AT,
    });
  }
  it("a test-local mock implementing WalletSigner is usable by the handoff", () => {
    const mock: WalletSigner = {
      ownerPubkey: OWNER0_PUBKEY,
      signValueRecord: (fields) =>
        signValueRecord({ ...fields, ownerPrivateKeyHex: OWNER0_PRIVATE }),
      signRecoveryDescriptor: () => {
        throw new Error("not used in this pin");
      },
    };
    const record = handoffSignValue(mock);
    expect(verifyValueRecord(record)).toBe(true);
    expect(record.ownerPubkey).toBe(OWNER0_PUBKEY);
  });
});
