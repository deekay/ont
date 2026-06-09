// Web side of the shared conformance vectors: the browser key derivation and the
// browser accumulator verifier must agree byte-for-byte with the engine, the
// claim site, and the mobile ports (all consume the same fixture).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { accumulatorKeyForName, verifyAccumulatorProof } from "./browser-accumulator.js";
import { deriveOwnerKey, findOwnerIndex, isValidMnemonic } from "./browser-keys.js";
import { generateBrowserOwnerKey, resolveOwnerSecret } from "./browser-key-tools.js";

async function loadVectors(): Promise<any> {
  const path = join(__dirname, "..", "..", "..", "packages", "protocol", "testdata", "conformance-vectors.json");
  return JSON.parse(await readFile(path, "utf8"));
}

describe("shared conformance vectors (web browser implementations)", () => {
  it("derives the fixture wallet's owner keys byte-identically", async () => {
    const { wallet } = await loadVectors();
    expect(isValidMnemonic(wallet.mnemonic)).toBe(true);
    for (const owner of wallet.owners) {
      expect(deriveOwnerKey(wallet.mnemonic, owner.index).ownerPubkey).toBe(owner.ownerPubkey);
    }
  });

  it("verifies fixture membership proofs and rejects tampered ones", async () => {
    const { accumulator } = await loadVectors();
    for (const vector of accumulator.membership) {
      expect(accumulatorKeyForName(vector.name)).toBe(vector.leafKey);
      expect(verifyAccumulatorProof(accumulator.root, vector.proof)).toBe(true);
    }
    for (const vector of accumulator.tampered) {
      expect(verifyAccumulatorProof(accumulator.root, vector.proof), vector.note).toBe(false);
    }
  });

  it("generateBrowserOwnerKey is phrase-backed and self-consistent", () => {
    const generated = generateBrowserOwnerKey();
    expect(isValidMnemonic(generated.mnemonic)).toBe(true);
    expect(deriveOwnerKey(generated.mnemonic, 0).ownerPubkey).toBe(generated.ownerPubkey);
  });

  it("resolveOwnerSecret accepts a phrase (scanning to the right index) or a raw key", async () => {
    const { wallet } = await loadVectors();
    const target = wallet.owners[2]; // index 2 — forces a real scan
    const viaPhrase = resolveOwnerSecret(wallet.mnemonic, target.ownerPubkey);
    expect(viaPhrase.mnemonicIndex).toBe(2);
    expect(viaPhrase.ownerPubkey).toBe(target.ownerPubkey);

    const viaKey = resolveOwnerSecret(viaPhrase.privateKeyHex, target.ownerPubkey);
    expect(viaKey.ownerPubkey).toBe(target.ownerPubkey);

    expect(() => resolveOwnerSecret(wallet.mnemonic, "ff".repeat(32))).toThrow(/first 40/);
    expect(findOwnerIndex(wallet.mnemonic, target.ownerPubkey)?.index).toBe(2);
  });
});
