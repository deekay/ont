import { describe, expect, it } from "vitest";
import { deriveOwnerKey } from "./key-derivation.js";

// B5-WALLET key-derivation red battery. WIRE §5 owner-key derivation, pinned byte-identical to the locked
// conformance vector (packages/wire/vectors/keys.json §5; values inlined here — the boundary lint forbids a
// cross-package reach, so the locked vector is copied verbatim with this pointer). RED until the core lands.

// packages/wire/vectors/keys.json — public BIP-39 test phrase; masterSeed = first 32B of the BIP-39 seed.
const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OWNERS = [
  { index: 0, privateKey: "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50", xOnlyPubkey: "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba" },
  { index: 1, privateKey: "17113ae7ecf53be6b1600dcf8a363adede705d104ed4a2ebc46cd0eabccfb0ca", xOnlyPubkey: "5b864fc13ed497d041f24868ae5a7ddf481724b146bda10bdd5c08ee1a18c026" },
  { index: 2, privateKey: "c2bd70ff6bb0a3d77b95f7b4f8fbba27d99609c773fbb27d2d15f2cb37c7a520", xOnlyPubkey: "bb6993ecc9feec6f631e24977e460eb3df2654b103fbeb75a969f17d5a911afe" },
] as const;

describe("deriveOwnerKey — WIRE §5, locked vector (byte-identical)", () => {
  it("derives the exact privateKey + x-only ownerPubkey for indices 0..2", () => {
    for (const owner of OWNERS) {
      const r = deriveOwnerKey(MNEMONIC, owner.index);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.key.ownerPrivateKeyHex).toBe(owner.privateKey);
      expect(r.key.ownerPubkey).toBe(owner.xOnlyPubkey);
    }
  });
  it("is deterministic", () => {
    expect(deriveOwnerKey(MNEMONIC, 0)).toEqual(deriveOwnerKey(MNEMONIC, 0));
  });
});

describe("deriveOwnerKey — fail-closed", () => {
  it("malformed mnemonic → malformed-mnemonic (never throws)", () => {
    let r: ReturnType<typeof deriveOwnerKey> | undefined;
    expect(() => { r = deriveOwnerKey("not a valid bip39 mnemonic at all", 0); }).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("malformed-mnemonic");
  });
  it("malformed index → malformed-index (never throws)", () => {
    for (const index of [-1, 2.5, Number.NaN]) {
      let r: ReturnType<typeof deriveOwnerKey> | undefined;
      expect(() => { r = deriveOwnerKey(MNEMONIC, index); }).not.toThrow();
      expect(r?.ok).toBe(false);
      if (r && !r.ok) expect(r.reason).toBe("malformed-index");
    }
  });
});
