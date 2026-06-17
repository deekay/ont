import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KeystoreError, WalletKeystore } from "./keystore.js";

describe("WalletKeystore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ont-wallet-keystore-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips owner + funding keys through an encrypted file", () => {
    const ks = WalletKeystore.createNew("signet");
    const path = join(dir, "ks.json");
    ks.save(path, "correct horse battery staple");

    const loaded = WalletKeystore.load(path, "correct horse battery staple");
    expect(loaded.network).toBe("signet");
    expect(loaded.ownerPubkey).toBe(ks.ownerPubkey);
    expect(loaded.fundingAddress).toBe(ks.fundingAddress);
    expect(loaded.ownerPrivateKeyHex()).toBe(ks.ownerPrivateKeyHex());
    expect(loaded.fundingWif()).toBe(ks.fundingWif());
  });

  it("derives a signet funding address and an x-only owner pubkey", () => {
    const ks = WalletKeystore.createNew("signet");
    expect(ks.fundingAddress).toMatch(/^tb1/);
    expect(ks.ownerPubkey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a wrong password", () => {
    const ks = WalletKeystore.createNew("signet");
    const path = join(dir, "ks.json");
    ks.save(path, "correct horse");
    expect(() => WalletKeystore.load(path, "nope")).toThrow(KeystoreError);
  });

  it("never writes secrets in the clear", () => {
    const ks = WalletKeystore.createNew("signet");
    const path = join(dir, "ks.json");
    ks.save(path, "pw");

    const onDisk = readFileSync(path, "utf8");
    expect(onDisk).not.toContain(ks.ownerPrivateKeyHex());
    expect(onDisk).not.toContain(ks.fundingWif());
    // public material is fine to store in the clear
    expect(onDisk).toContain(ks.ownerPubkey);
    expect(onDisk).toContain(ks.fundingAddress);
  });
});
