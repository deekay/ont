// Claim-site side of the shared conformance vectors: the same 12 words must
// derive byte-identical owner keys and the same funding address here as in the
// engine, the web tools, and the mobile app (all consume the same fixture).
// STATUS.md's "one user secret, every surface" claim (Decision #41) is only
// true while this passes — the fixture file itself names the claim site as a
// required implementation.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveFundingAddress, deriveOwnerKey, isValidMnemonic } from "./keys.js";

async function loadVectors(): Promise<any> {
  const path = join(__dirname, "..", "..", "..", "packages", "protocol", "testdata", "conformance-vectors.json");
  return JSON.parse(await readFile(path, "utf8"));
}

describe("shared conformance vectors (claim site key derivation)", () => {
  it("accepts the fixture mnemonic", async () => {
    const { wallet } = await loadVectors();
    expect(isValidMnemonic(wallet.mnemonic)).toBe(true);
  });

  it("derives the fixture wallet's owner pubkeys byte-identically", async () => {
    const { wallet } = await loadVectors();
    for (const owner of wallet.owners) {
      expect(deriveOwnerKey(wallet.mnemonic, owner.index).ownerPubkey).toBe(owner.ownerPubkey);
    }
  });

  it("derives the fixture wallet's signet funding address", async () => {
    const { wallet } = await loadVectors();
    expect(deriveFundingAddress(wallet.mnemonic)).toBe(wallet.fundingAddressSignet);
  });
});
