// Prove the wallet-backup crypto: real scrypt + XChaCha20-Poly1305 round-trips,
// and a wrong recovery code / passphrase / tampered ciphertext all fail.
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/+$/, "");
async function load(path: string): Promise<any> {
  const m = await import(path);
  return m.default ?? m;
}
const b = await load(`${ROOT}/mobile/src/wallet/backup.ts`);
const { encryptWalletBackup, decryptWalletBackup, generateRecoveryCode, normalizeRecoveryCode } = b;

let failures = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) { failures += 1; console.error(`FAIL  ${label}${extra ? "  :: " + extra : ""}`); }
  else console.log(`ok    ${label}${extra ? "  :: " + extra : ""}`);
};

const payload = {
  ownerPrivateKeyHex: "1122334455667788991011121314151617181920212223242526272829303132",
  fundingWif: "cMahea7zqjxrtgAbB7LSGbcQUr1uX1ojuat9jZodMN87JcbXMTcA",
  network: "signet",
};

const code = generateRecoveryCode();
ok("recovery code is 32 hex chars (grouped)", normalizeRecoveryCode(code).length === 32, code);

const blob = encryptWalletBackup(payload, code);
ok("blob is versioned + scrypt", blob.version === 1 && blob.kdf.name === "scrypt");
ok("ciphertext is not the plaintext", !blob.ciphertext.includes(payload.ownerPrivateKeyHex));
const restored = decryptWalletBackup(blob, code);
ok("round-trips owner key", restored.ownerPrivateKeyHex === payload.ownerPrivateKeyHex);
ok("round-trips funding wif", restored.fundingWif === payload.fundingWif);

ok("decrypts with separator-stripped code", decryptWalletBackup(blob, normalizeRecoveryCode(code)).ownerPrivateKeyHex === payload.ownerPrivateKeyHex);

let wrongThrew = false;
try { decryptWalletBackup(blob, generateRecoveryCode()); } catch { wrongThrew = true; }
ok("wrong recovery code is rejected", wrongThrew);

let passThrew = false;
try { decryptWalletBackup(blob, code, "extra-passphrase"); } catch { passThrew = true; }
ok("passphrase mismatch is rejected", passThrew);

const blob2 = encryptWalletBackup(payload, code, "correct horse");
ok("passphrase backup round-trips", decryptWalletBackup(blob2, code, "correct horse").fundingWif === payload.fundingWif);

const flipped = blob.ciphertext.slice(0, -2) + (blob.ciphertext.endsWith("00") ? "11" : "00");
let tamperThrew = false;
try { decryptWalletBackup({ ...blob, ciphertext: flipped }, code); } catch { tamperThrew = true; }
ok("tampered ciphertext is rejected", tamperThrew);

console.log("");
if (failures === 0) console.log("ALL BACKUP CRYPTO CHECKS PASSED — real AEAD; only the storage target is stubbed.");
else { console.error(`${failures} CHECK(S) FAILED.`); process.exit(1); }
