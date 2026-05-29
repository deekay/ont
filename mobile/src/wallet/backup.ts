// Encrypted wallet backup — the Lexe-shaped recovery story.
//
// The wallet secrets (owner private key + funding WIF) are encrypted ON-DEVICE
// under a key derived from a recovery code (optionally + a passphrase), then
// handed to a BackupProvider. The provider is the only swappable part: today a
// local stub stands in for cloud storage; later the same interface is
// implemented for Google Drive (drive.appdata) and iCloud. The provider — and
// therefore any cloud — only ever sees ciphertext it cannot read.
//
// Encryption is real: scrypt KDF + XChaCha20-Poly1305 AEAD (@noble). This mirrors
// the demo-mode principle exactly — stub the service (storage), never the crypto.
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { scrypt } from "@noble/hashes/scrypt";
import { randomBytes } from "@noble/hashes/utils";

import { bytesToHex, hexToBytes } from "./accumulator";

// --- formats -----------------------------------------------------------------

export interface WalletBackupPayload {
  readonly ownerPrivateKeyHex: string;
  readonly fundingWif: string;
  readonly network: string;
}

export interface EncryptedBackup {
  readonly version: 1;
  readonly kdf: { readonly name: "scrypt"; readonly N: number; readonly r: number; readonly p: number };
  readonly salt: string; // hex, 16 bytes
  readonly nonce: string; // hex, 24 bytes (XChaCha20)
  readonly ciphertext: string; // hex (AEAD: ct||tag)
  readonly createdAt: string;
}

// scrypt cost. N=2^14 is snappy on a phone and ample for a high-entropy code.
const KDF = { name: "scrypt" as const, N: 1 << 14, r: 8, p: 1 };
const DK_LEN = 32;

const textEncoder = new TextEncoder();

// The backup payload is strictly ASCII (hex, base58check WIF, lowercase network,
// ASCII JSON keys), so a latin1 round-trip is exact — and avoids depending on
// TextDecoder, which isn't guaranteed under Hermes.
function utf8ToBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}
function asciiBytesToString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

// --- recovery code ------------------------------------------------------------

/** A high-entropy recovery code (16 bytes → 32 hex chars, shown in groups of 4). */
export function generateRecoveryCode(): string {
  const hex = bytesToHex(randomBytes(16));
  return (hex.match(/.{1,4}/g) ?? [hex]).join("-");
}

/** Normalize a typed recovery code: drop separators/whitespace, lowercase. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
}

function deriveKey(recoveryCode: string, passphrase: string, salt: Uint8Array): Uint8Array {
  const secret = `${normalizeRecoveryCode(recoveryCode)}\n${passphrase}`;
  return scrypt(utf8ToBytes(secret), salt, { N: KDF.N, r: KDF.r, p: KDF.p, dkLen: DK_LEN });
}

// --- encrypt / decrypt --------------------------------------------------------

export function encryptWalletBackup(
  payload: WalletBackupPayload,
  recoveryCode: string,
  passphrase = "",
): EncryptedBackup {
  const salt = randomBytes(16);
  const nonce = randomBytes(24);
  const key = deriveKey(recoveryCode, passphrase, salt);
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  return {
    version: 1,
    kdf: KDF,
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    createdAt: new Date().toISOString(),
  };
}

/** Throws if the recovery code/passphrase is wrong (AEAD tag fails). */
export function decryptWalletBackup(
  blob: EncryptedBackup,
  recoveryCode: string,
  passphrase = "",
): WalletBackupPayload {
  const salt = hexToBytes(blob.salt);
  const nonce = hexToBytes(blob.nonce);
  const key = scrypt(
    utf8ToBytes(`${normalizeRecoveryCode(recoveryCode)}\n${passphrase}`),
    salt,
    { N: blob.kdf.N, r: blob.kdf.r, p: blob.kdf.p, dkLen: DK_LEN },
  );
  let plaintext: Uint8Array;
  try {
    plaintext = xchacha20poly1305(key, nonce).decrypt(hexToBytes(blob.ciphertext));
  } catch {
    throw new Error("Wrong recovery code (or passphrase) — could not decrypt this backup.");
  }
  const parsed = JSON.parse(asciiBytesToString(plaintext)) as WalletBackupPayload;
  if (!parsed?.ownerPrivateKeyHex || !parsed?.fundingWif) {
    throw new Error("Backup decrypted but is missing required keys.");
  }
  return parsed;
}

// --- providers ----------------------------------------------------------------

/**
 * Where the encrypted blob is stored. The blob is already ciphertext, so a
 * provider (and any cloud behind it) is untrusted by construction. The local
 * stub implementation lives in ./backup-provider (it imports a native module);
 * swap it for Google Drive / iCloud later without touching the crypto above.
 */
export interface BackupProvider {
  readonly label: string;
  readonly isStub: boolean;
  save(blob: EncryptedBackup): Promise<void>;
  load(): Promise<EncryptedBackup | null>;
  clear(): Promise<void>;
}
