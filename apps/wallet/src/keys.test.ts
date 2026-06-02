import { describe, expect, it } from "vitest";

import {
  fundingKeyFromWif,
  generateFundingKey,
  generateOwnerKey,
  ownerPubkeyForPrivateKey
} from "./keys.js";

describe("owner key", () => {
  it("generates a valid 32-byte key with a derivable x-only pubkey", () => {
    const key = generateOwnerKey();
    expect(key.ownerPrivateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(key.ownerPubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(ownerPubkeyForPrivateKey(key.ownerPrivateKeyHex)).toBe(key.ownerPubkey);
  });

  it("rejects an invalid private key", () => {
    expect(ownerPubkeyForPrivateKey("00")).toBeNull();
  });
});

describe("funding key", () => {
  it("generates a signet P2WPKH key and recovers it from its WIF", () => {
    const funding = generateFundingKey("signet");
    expect(funding.fundingAddress).toMatch(/^tb1/);
    expect(funding.fundingWif).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);

    const recovered = fundingKeyFromWif(funding.fundingWif, "signet");
    expect(recovered.fundingAddress).toBe(funding.fundingAddress);
    expect(recovered.fundingPubkeyHex).toBe(funding.fundingPubkeyHex);
  });
});
