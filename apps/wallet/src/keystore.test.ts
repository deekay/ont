import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateOwnerKey, KeystoreError, WalletKeystore } from "./keystore.js";

describe("owner key generation", () => {
  it("produces a valid 32-byte private key and x-only pubkey", () => {
    const key = generateOwnerKey();
    expect(key.ownerPrivateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(key.ownerPubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is random across calls", () => {
    expect(generateOwnerKey().ownerPrivateKeyHex).not.toBe(generateOwnerKey().ownerPrivateKeyHex);
  });
});

describe("WalletKeystore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ont-wallet-keystore-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips through an encrypted file with the right password", () => {
    const ks = WalletKeystore.createNew();
    const path = join(dir, "keystore.json");
    ks.save(path, "correct horse battery staple");

    const loaded = WalletKeystore.load(path, "correct horse battery staple");
    expect(loaded.ownerPubkey).toBe(ks.ownerPubkey);
    expect(loaded.ownerPrivateKeyHex()).toBe(ks.ownerPrivateKeyHex());
  });

  it("rejects a wrong password", () => {
    const ks = WalletKeystore.createNew();
    const path = join(dir, "keystore.json");
    ks.save(path, "correct horse");
    expect(() => WalletKeystore.load(path, "wrong password")).toThrow(KeystoreError);
  });

  it("never writes the private key in the clear", () => {
    const ks = WalletKeystore.createNew();
    const path = join(dir, "keystore.json");
    ks.save(path, "pw");

    const onDisk = readFileSync(path, "utf8");
    expect(onDisk).not.toContain(ks.ownerPrivateKeyHex());
    expect(onDisk).toContain(ks.ownerPubkey); // the pubkey is fine to store in the clear
  });
});
