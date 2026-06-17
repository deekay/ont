// On-device, password-encrypted store for the ONT wallet's keys.
//
// The owner key controls a name permanently, so it lives here — in the client,
// under the user's own password — never inside a Lightning node's credential or
// a cloud backup we don't control. The file is encrypted client-side
// (AES-256-GCM, key derived from the password via scrypt), so a copy of it is
// *storage*, not *recovery authority*: without the password it's opaque. The
// funding key (on-chain fees/bonds) is encrypted alongside it. Public material
// (owner pubkey, funding address, network) is kept in the clear for display.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import {
  fundingKeyFromWif,
  generateFundingKey,
  generateOwnerKey,
  isOntNetwork,
  ownerPubkeyForPrivateKey,
  type FundingKey,
  type OntNetwork,
  type OwnerKey
} from "./keys.js";

const KEYSTORE_FORMAT = "ont-wallet-keystore";
const KEYSTORE_VERSION = 2;
const SCRYPT_N = 1 << 15;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface KeystoreSecret {
  readonly ownerPrivateKeyHex: string;
  readonly fundingWif: string;
}

interface KeystoreFile {
  readonly format: string;
  readonly version: number;
  readonly network: string;
  readonly ownerPubkey: string;
  readonly fundingAddress: string;
  readonly fundingPubkeyHex: string;
  readonly kdf: { readonly algorithm: "scrypt"; readonly saltHex: string; readonly n: number };
  readonly cipher: {
    readonly algorithm: "aes-256-gcm";
    readonly ivHex: string;
    readonly ciphertextHex: string;
    readonly authTagHex: string;
  };
}

export class WalletKeystore {
  readonly network: OntNetwork;
  readonly ownerPubkey: string;
  readonly fundingAddress: string;
  readonly fundingPubkeyHex: string;
  readonly #secret: KeystoreSecret;

  private constructor(input: {
    readonly network: OntNetwork;
    readonly owner: OwnerKey;
    readonly funding: FundingKey;
  }) {
    this.network = input.network;
    this.ownerPubkey = input.owner.ownerPubkey;
    this.fundingAddress = input.funding.fundingAddress;
    this.fundingPubkeyHex = input.funding.fundingPubkeyHex;
    this.#secret = {
      ownerPrivateKeyHex: input.owner.ownerPrivateKeyHex,
      fundingWif: input.funding.fundingWif
    };
  }

  static createNew(network: OntNetwork): WalletKeystore {
    return new WalletKeystore({
      network,
      owner: generateOwnerKey(),
      funding: generateFundingKey(network)
    });
  }

  /** Sensitive: the decrypted owner private key, for signing ONT events. */
  ownerPrivateKeyHex(): string {
    return this.#secret.ownerPrivateKeyHex;
  }

  /** Sensitive: the funding WIF, for signing on-chain transactions. */
  fundingWif(): string {
    return this.#secret.fundingWif;
  }

  /** Encrypt and write the keystore to disk (owner-readable only). */
  save(path: string, password: string): void {
    const salt = randomBytes(16);
    const key = deriveKey(password, salt, SCRYPT_N);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(this.#secret), "utf8")),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    const file: KeystoreFile = {
      format: KEYSTORE_FORMAT,
      version: KEYSTORE_VERSION,
      network: this.network,
      ownerPubkey: this.ownerPubkey,
      fundingAddress: this.fundingAddress,
      fundingPubkeyHex: this.fundingPubkeyHex,
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
    if (!isOntNetwork(parsed.network)) {
      throw new KeystoreError(`unknown network in keystore: ${String(parsed.network)}`);
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

    const secret = JSON.parse(plaintext.toString("utf8")) as KeystoreSecret;
    const ownerPubkey = ownerPubkeyForPrivateKey(secret.ownerPrivateKeyHex);
    if (ownerPubkey === null || !constantTimeEqualHex(ownerPubkey, parsed.ownerPubkey)) {
      throw new KeystoreError("decrypted key does not match the stored owner pubkey");
    }

    return new WalletKeystore({
      network: parsed.network,
      owner: { ownerPrivateKeyHex: secret.ownerPrivateKeyHex, ownerPubkey },
      funding: fundingKeyFromWif(secret.fundingWif, parsed.network)
    });
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
