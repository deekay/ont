// On-device key generation for the ONT mobile wallet.
//
// The pure derivation + key helpers live in ./hd (node/Hermes-safe, no expo).
// This module adds the CSPRNG-seeded generators (they need expo-crypto) and
// re-exports the pure surface so existing importers of "./keys" keep working.
//
//  - owner key (x-only Schnorr): controls a name. Signs ONT ownership events
//    (value records, transfers, recovery). One owner key PER name (HD-derived).
//  - funding key (P2WPKH): pays Bitcoin fees and bonds. One per wallet.
import "../wallet/polyfills";

import * as ecc from "@bitcoinerlab/secp256k1";
import * as Crypto from "expo-crypto";
import { payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import {
  ECPair,
  toBitcoinjsNetwork,
  type FundingKey,
  type OntNetwork,
  type OwnerKey,
} from "./hd";

import { mnemonicFromEntropy } from "./mnemonic";

// Re-export the pure derivation surface (types + helpers) from ./hd.
export {
  toBitcoinjsNetwork,
  ownerPubkeyForPrivateKey,
  fundingKeyFromWif,
  normalizeSeedHex,
  deriveOwnerKey,
  deriveFundingKey,
} from "./hd";
export { isValidMnemonic, looksLikeMnemonic, seedHexFromMnemonic } from "./mnemonic";
export type { OntNetwork, OwnerKey, FundingKey } from "./hd";

export interface WalletKeys {
  readonly owner: OwnerKey;
  readonly funding: FundingKey;
}

function randomBytes(size: number): Buffer {
  return Buffer.from(Crypto.getRandomBytes(size));
}

/** Generate a fresh 32-byte master seed (hex). One secret restores everything. */
export function generateSeedHex(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a fresh 12-word recovery phrase (the unified secret across the app,
 * claim site, and web tools). Entropy from expo-crypto; derivation is pure
 * (see ./mnemonic). Pair with seedHexFromMnemonic to get the master seed.
 */
export function generateMnemonic12(): string {
  return mnemonicFromEntropy(Uint8Array.from(randomBytes(16)));
}

/** Generate a fresh standalone ONT owner key (x-only Schnorr). */
export function generateOwnerKey(): OwnerKey {
  for (;;) {
    const privateKey = randomBytes(32);
    if (!ecc.isPrivate(privateKey)) {
      continue;
    }
    const pub = ecc.xOnlyPointFromScalar(privateKey);
    if (pub === null) {
      continue;
    }
    return {
      ownerPrivateKeyHex: Buffer.from(privateKey).toString("hex"),
      ownerPubkey: Buffer.from(pub).toString("hex"),
    };
  }
}

/** Generate a standalone P2WPKH funding key for paying on-chain fees and bonds. */
export function generateFundingKey(network: OntNetwork): FundingKey {
  const bitcoinjsNetwork = toBitcoinjsNetwork(network);
  const keyPair = ECPair.makeRandom({
    network: bitcoinjsNetwork,
    rng: (size?: number) => randomBytes(size ?? 32),
  });
  const payment = payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoinjsNetwork });
  if (!payment.address) {
    throw new Error("unable to derive funding address");
  }
  return {
    fundingWif: keyPair.toWIF(),
    fundingAddress: payment.address,
    fundingPubkeyHex: Buffer.from(keyPair.publicKey).toString("hex"),
  };
}

/** Generate a complete standalone wallet (owner + funding) for the given network. */
export function generateWallet(network: OntNetwork): WalletKeys {
  return {
    owner: generateOwnerKey(),
    funding: generateFundingKey(network),
  };
}
