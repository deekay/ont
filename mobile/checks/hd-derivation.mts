// Cross-check the wallet's HD owner-key derivation. Proves:
//   - deterministic: same seed + index -> identical owner key
//   - distinct: different indices -> different owner keys (per-name unlinkability)
//   - valid: derived owner pubkeys are valid 32-byte x-only points that sign +
//     verify under the ENGINE's BIP340 value-record code (so a per-name derived
//     key is a real, usable ONT owner key)
//   - funding: derived funding key yields a tb1 (signet) P2WPKH address
import {
  signValueRecord as engineSign,
  verifyValueRecord as engineVerify,
  deriveOwnerPubkey as engineDerive,
} from "../../packages/protocol/src/value-record.ts";

const hd = await import("../../mobile/src/wallet/hd.ts");
const { deriveOwnerKey, deriveFundingKey, normalizeSeedHex } = hd as any;

let failures = 0;
const ok = (label: string, cond: boolean) => {
  if (!cond) {
    failures += 1;
    console.error("FAIL  " + label);
  } else {
    console.log("ok    " + label);
  }
};

const SEED_A = "11".repeat(32);
const SEED_B = "22".repeat(32);

ok("normalizeSeedHex accepts 32-byte hex", normalizeSeedHex(SEED_A) === SEED_A);
ok("normalizeSeedHex rejects short", normalizeSeedHex("abcd") === null);
ok("normalizeSeedHex rejects non-hex", normalizeSeedHex("zz".repeat(32)) === null);

const a0 = deriveOwnerKey(SEED_A, 0, "signet");
const a0again = deriveOwnerKey(SEED_A, 0, "signet");
const a1 = deriveOwnerKey(SEED_A, 1, "signet");
const a2 = deriveOwnerKey(SEED_A, 2, "signet");
const b0 = deriveOwnerKey(SEED_B, 0, "signet");

ok("deterministic: same seed+index identical privkey", a0.ownerPrivateKeyHex === a0again.ownerPrivateKeyHex);
ok("deterministic: same seed+index identical pubkey", a0.ownerPubkey === a0again.ownerPubkey);
ok("distinct index -> distinct key (0 vs 1)", a0.ownerPubkey !== a1.ownerPubkey);
ok("distinct index -> distinct key (1 vs 2)", a1.ownerPubkey !== a2.ownerPubkey);
ok("distinct seed -> distinct key", a0.ownerPubkey !== b0.ownerPubkey);
ok("owner pubkey is 32-byte x-only hex", /^[0-9a-f]{64}$/.test(a0.ownerPubkey));
ok("owner privkey is 32-byte hex", /^[0-9a-f]{64}$/.test(a0.ownerPrivateKeyHex));

// A derived owner key must be a real ONT owner key: its pubkey matches the
// engine's derivation, and a record signed under it verifies in the engine.
ok("derived pubkey matches engine deriveOwnerPubkey", engineDerive(a1.ownerPrivateKeyHex) === a1.ownerPubkey);

const record = {
  name: "satoshi",
  ownershipRef: "ab".repeat(32),
  sequence: 1,
  previousRecordHash: null as string | null,
  valueType: 2,
  payloadHex: Buffer.from("https://example.com", "utf8").toString("hex"),
  issuedAt: "2026-06-01T00:00:00.000Z",
};
const signed = engineSign({ ...record, ownerPrivateKeyHex: a1.ownerPrivateKeyHex });
ok("engine signs a record under a derived key", typeof signed.signature === "string");
ok("engine verifies a record signed by a derived key", engineVerify(signed) === true);
ok("signed record carries the derived owner pubkey", signed.ownerPubkey === a1.ownerPubkey);

const funding = deriveFundingKey(SEED_A, "signet");
ok("derived funding is a signet P2WPKH (tb1)", funding.fundingAddress.startsWith("tb1"));
ok("funding derivation deterministic", deriveFundingKey(SEED_A, "signet").fundingWif === funding.fundingWif);

// --- 12-word phrase interop (shared conformance vectors) ---
// The app's mnemonic→seed convention must match the claim site / web tools
// byte-for-byte: masterSeed = first 32 bytes of the BIP-39 seed, then the same
// owner + funding paths. One phrase, every surface.
{
  const { readFileSync } = await import("node:fs");
  const mnemonicMod = await import("../../mobile/src/wallet/mnemonic.ts");
  const vectors = JSON.parse(
    readFileSync(new URL("../../packages/protocol/testdata/conformance-vectors.json", import.meta.url), "utf8"),
  );
  const { seedHexFromMnemonic, isValidMnemonic } = mnemonicMod as any;
  ok("fixture mnemonic validates", isValidMnemonic(vectors.wallet.mnemonic));
  const seedHex = seedHexFromMnemonic(vectors.wallet.mnemonic);
  ok("mnemonic-derived seed is 32-byte hex", /^[0-9a-f]{64}$/.test(seedHex));
  for (const owner of vectors.wallet.owners) {
    ok(
      `phrase owner key #${owner.index + 1} matches the shared fixture (web/claim interop)`,
      deriveOwnerKey(seedHex, owner.index, "signet").ownerPubkey === owner.ownerPubkey,
    );
  }
  ok(
    "phrase funding address matches the shared fixture",
    deriveFundingKey(seedHex, "signet").fundingAddress === vectors.wallet.fundingAddressSignet,
  );
}

if (failures > 0) {
  console.error(`\n${failures} HD-derivation check(s) failed.`);
  process.exit(1);
}
console.log("\nok    hd-derivation: per-name keys derive deterministically and verify in the engine.");
