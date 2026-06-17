import { describe, expect, it } from "vitest";

import { createRandomNonceHex, generateLiveAccount } from "./keygen.js";

describe("key generation helpers", () => {
  it("creates 8-byte nonce hex strings", () => {
    expect(createRandomNonceHex()).toMatch(/^[0-9a-f]{16}$/);
  });

  it("creates distinct owner and funding material for signet", () => {
    const generated = generateLiveAccount("signet");

    expect(generated.kind).toBe("ont-generated-live-account");
    expect(generated.ownerPrivateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.ownerPubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.fundingWif[0]).toMatch(/[cKLM]/);
    expect(generated.fundingAddress.startsWith("tb1q")).toBe(true);
    expect(generated.fundingPubkeyHex).toMatch(/^[0-9a-f]{66}$/);
  });
});
