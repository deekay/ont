// Test for the 12-word wallet derivation. Run: npx tsx apps/claim/checks/keys.mts
import { deriveOwnerKey, generateMnemonic12, isValidMnemonic } from "../src/keys.js";

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
};

// BIP-39 canonical 12-word test vector (entropy all-zeros).
const FIXED = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

check("fixed mnemonic validates", isValidMnemonic(FIXED));

const a = deriveOwnerKey(FIXED, 0);
const b = deriveOwnerKey(FIXED, 0);
check("derivation is deterministic", a.ownerPubkey === b.ownerPubkey && a.ownerPrivateKeyHex === b.ownerPrivateKeyHex);
check("owner pubkey is 32-byte x-only hex", /^[0-9a-f]{64}$/.test(a.ownerPubkey));
check("owner privkey is 32-byte hex", /^[0-9a-f]{64}$/.test(a.ownerPrivateKeyHex));

// Regression / interop golden — the owner pubkey for FIXED at index 0 via the
// app's 32-byte-seed BIP-32 derivation. Locks the derivation so it can't drift.
const GOLDEN_INDEX0 = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba";
check("matches interop golden (index 0)", a.ownerPubkey === GOLDEN_INDEX0);

// Distinct names get distinct keys (per-name unlinkability).
check("index 1 differs from index 0", deriveOwnerKey(FIXED, 1).ownerPubkey !== a.ownerPubkey);

const fresh = generateMnemonic12();
check("fresh mnemonic is 12 words", fresh.trim().split(/\s+/).length === 12);
check("fresh mnemonic validates", isValidMnemonic(fresh));

console.log(`\nindex0 owner pubkey: ${a.ownerPubkey}`);
console.log(failures === 0 ? "\nALL OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
