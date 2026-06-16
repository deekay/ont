// Test for the 12-word wallet derivation. Run: npx tsx apps/claim/checks/keys.mts
import { deriveFundingAddress, deriveOwnerKey, generateMnemonic12, isValidMnemonic } from "../src/keys.js";

let failures = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) failures += 1;
};

// Shared conformance vectors — the same fixture the engine, web tools, and the
// mobile checks consume, so all derivations are locked to one source.
import { readFileSync } from "node:fs";
const VECTORS = JSON.parse(
  readFileSync(new URL("../../../packages/protocol/testdata/conformance-vectors.json", import.meta.url), "utf8"),
);
const FIXED: string = VECTORS.wallet.mnemonic;

check("fixed mnemonic validates", isValidMnemonic(FIXED));

const a = deriveOwnerKey(FIXED, 0);
const b = deriveOwnerKey(FIXED, 0);
check("derivation is deterministic", a.ownerPubkey === b.ownerPubkey && a.ownerPrivateKeyHex === b.ownerPrivateKeyHex);
check("owner pubkey is 32-byte x-only hex", /^[0-9a-f]{64}$/.test(a.ownerPubkey));
check("owner privkey is 32-byte hex", /^[0-9a-f]{64}$/.test(a.ownerPrivateKeyHex));

// Regression / interop golden — the owner pubkey for FIXED at index 0 via the
// app's 32-byte-seed BIP-32 derivation. Locks the derivation so it can't drift.
const GOLDEN_INDEX0: string = VECTORS.wallet.owners[0].ownerPubkey;
check("matches interop golden (index 0, shared fixture)", a.ownerPubkey === GOLDEN_INDEX0);

// Distinct names get distinct keys (per-name unlinkability).
check("index 1 differs from index 0", deriveOwnerKey(FIXED, 1).ownerPubkey !== a.ownerPubkey);

// Funding address (P2WPKH signet) — the wallet's deposit address.
const fundA = deriveFundingAddress(FIXED);
const fundB = deriveFundingAddress(FIXED);
check("funding address is deterministic", fundA === fundB);
check("funding address is a signet P2WPKH (tb1q…)", /^tb1q[ac-hj-np-z02-9]{38}$/.test(fundA));
const FUNDING_GOLDEN: string = VECTORS.wallet.fundingAddressSignet;
check("matches funding-address golden (shared fixture)", fundA === FUNDING_GOLDEN);
console.log(`funding address:    ${fundA}`);

const fresh = generateMnemonic12();
check("fresh mnemonic is 12 words", fresh.trim().split(/\s+/).length === 12);
check("fresh mnemonic validates", isValidMnemonic(fresh));

console.log(`\nindex0 owner pubkey: ${a.ownerPubkey}`);
console.log(failures === 0 ? "\nALL OK" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
