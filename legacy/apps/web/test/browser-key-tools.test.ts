import { describe, expect, it } from "vitest";

import { deriveOwnerPubkey } from "../src/browser-value-record.js";
import { generateBrowserOwnerKey } from "../src/browser-key-tools.js";

describe("browser key tools", () => {
  it("generates a valid secp256k1 owner keypair locally", () => {
    const generated = generateBrowserOwnerKey();

    expect(generated.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.ownerPubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveOwnerPubkey(generated.privateKeyHex)).toBe(generated.ownerPubkey);
  });
});
