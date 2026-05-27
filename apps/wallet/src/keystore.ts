// On-device, password-encrypted store for the ONT owner key.
//
// The owner key controls a name permanently, so it lives here — in the client,
// under the user's own password — never inside a Lightning node's credential or
// a cloud backup we don't control. The file is encrypted client-side
// (AES-256-GCM, key derived from the password via scrypt), so a copy of it is
// *storage*, not *recovery authority*: without the password it's opaque.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import * as tinysecp from "tiny-secp256k1";

const KEYSTORE_FORMAT = "ont-wallet-keystore";
const KEYSTORE_VERSION = 1;
const SCRYPT_N = 1 << 15;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export interface OwnerKey {
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
}

interface KeystoreFile {
  readonly format: string;
  readonly version: number;
  readonly ownerPubkey: string; // not secret — kept in the clear for display/verification
  readonly kdf: { readonly algorithm: "scrypt"; readonly saltHex: string; readonly n: number };
  readonly cipher: {
    readonly algorithm: "aes-256-gcm";
    readonly ivHex: string;
    readonly ciphertextHex: string;
    readonly authTagHex: string;
  };
}

/** Generate a fresh ONT owner key (x-only Schnorr public key). */
export function generateOwnerKey(): OwnerKey {
  for (;;) {
    const privateKey = randomBytes(32);
    if (!tinysecp.isPrivate(privateKey)) {
      continue;
    }
    const pub = tinysecp.xOnlyPointFromScalar(privateKey);
    if (pub === null) {
      continue;
    }
    return {
      ownerPrivateKeyHex: Buffer.from(privateKey).toString("hex"),
      ownerPubkey: Buffer.from(pub).toString("hex")
    };
  }
}

export class WalletKeystore {
  readonly ownerPubkey: string;
  readonly #ownerPrivateKeyHex: string;

  private constructor(ownerKey: OwnerKey) {
    this.ownerPubkey = ownerKey.ownerPubkey;
    this.#ownerPrivateKeyHex = ownerKey.ownerPrivateKeyHex;
  }

  static createNew(): WalletKeystore {
    return new WalletKeystore(generateOwnerKey());
  }

  static fromOwnerKey(ownerKey: OwnerKey): WalletKeystore {
    return new WalletKeystore(ownerKey);
  }

  /** Sensitive: the decrypted owner private key, for signing ONT events. */
  ownerPrivateKeyHex(): string {
    return this.#ownerPrivateKeyHex;
  }

  /** Encrypt and write the keystore to disk (owner-readable only). */
  save(path: string, password: string): void {
    const salt = randomBytes(16);
    const key = deriveKey(password, salt, SCRYPT_N);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(this.#ownerPrivateKeyHex, "hex")),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    const file: KeystoreFile = {
      format: KEYSTORE_FORMAT,
      version: KEYSTORE_VERSION,
      ownerPubkey: this.ownerPubkey,
      kdf: { algorithm: "scrypt", saltHex: salt.toString("hex"), n: SCRYPT_N },
      cipher: {
        algorithm: "aes-256-gcm",
        ivHex: iv.toString("hex"),
        ciphertextHex: ciphertext.toString("hex"),
        authTagHex: authTag.toString("hex")
      }
    };
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  /** Read and decrypt a keystore from disk. Throws on a wrong password. */
  static load(path: string, password: string): WalletKeystore {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as KeystoreFile;
    if (parsed.format !== KEYSTORE_FORMAT) {
      throw new KeystoreError(`not an ONT wallet keystore: ${String(parsed.format)}`);
    }

    const key = deriveKey(password, Buffer.from(parsed.kdf.saltHex, "hex"), parsed.kdf.n);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.cipher.ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(parsed.cipher.authTagHex, "hex"));

    let plaintext: Buffer;
    try {
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(parsed.cipher.ciphertextHex, "hex")),
        decipher.final()
      ]);
    } catch {
      throw new KeystoreError("could not decrypt keystore — wrong password or corrupted file");
    }

    const pub = tinysecp.xOnlyPointFromScalar(plaintext);
    const ownerPubkey = pub === null ? "" : Buffer.from(pub).toString("hex");
    if (ownerPubkey === "" || !constantTimeEqualHex(ownerPubkey, parsed.ownerPubkey)) {
      throw new KeystoreError("decrypted key does not match the stored owner pubkey");
    }

    return new WalletKeystore({ ownerPrivateKeyHex: plaintext.toString("hex"), ownerPubkey });
  }
}

export class KeystoreError extends Error {}

function deriveKey(password: string, salt: Buffer, n: number): Buffer {
  return scryptSync(password, salt, SCRYPT_KEYLEN, { N: n, maxmem: SCRYPT_MAXMEM });
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
