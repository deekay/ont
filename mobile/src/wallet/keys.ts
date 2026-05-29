// On-device key generation for the ONT mobile wallet.
//
// Mirrors apps/wallet/src/keys.ts (the reference client), ported to React
// Native: node:crypto -> expo-crypto, tiny-secp256k1 (WASM) -> the pure-JS
// noble-backed @bitcoinerlab/secp256k1. The owner/funding split is identical.
//
//  - owner key (x-only Schnorr): controls the name. Signs ONT ownership events
//    (value records, transfers, recovery). This is the secret the keystore guards.
//  - funding key (P2WPKH): pays Bitcoin fees and bonds. Ordinary on-chain spend
//    authority, not name authority.
import "../wallet/polyfills";

import * as ecc from "@bitcoinerlab/secp256k1";
import * as Crypto from "expo-crypto";
import { initEccLib, networks, payments, type Network } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import { Buffer } from "buffer";

initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export type OntNetwork = "main" | "testnet" | "signet" | "regtest";

export function toBitcoinjsNetwork(network: OntNetwork): Network {
  switch (network) {
    case "main":
      return networks.bitcoin;
    case "testnet":
    case "signet":
      return networks.testnet;
    case "regtest":
      return networks.regtest;
  }
}

export interface OwnerKey {
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
}

export interface FundingKey {
  readonly fundingWif: string;
  readonly fundingAddress: string;
  readonly fundingPubkeyHex: string;
}

export interface WalletKeys {
  readonly owner: OwnerKey;
  readonly funding: FundingKey;
}

function randomBytes(size: number): Buffer {
  return Buffer.from(Crypto.getRandomBytes(size));
}

/** Generate a fresh ONT owner key (x-only Schnorr public key). */
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

/** Derive the x-only owner pubkey for a given owner private key, or null if invalid. */
export function ownerPubkeyForPrivateKey(ownerPrivateKeyHex: string): string | null {
  let privateKey: Buffer;
  try {
    privateKey = Buffer.from(ownerPrivateKeyHex, "hex");
  } catch {
    return null;
  }
  if (privateKey.length !== 32 || !ecc.isPrivate(privateKey)) {
    return null;
  }
  const pub = ecc.xOnlyPointFromScalar(privateKey);
  return pub === null ? null : Buffer.from(pub).toString("hex");
}

/** Generate a P2WPKH funding key for paying on-chain fees and bonds. */
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

/** Recover the funding address + pubkey from a WIF (used when importing a keystore). */
export function fundingKeyFromWif(fundingWif: string, network: OntNetwork): FundingKey {
  const bitcoinjsNetwork = toBitcoinjsNetwork(network);
  const keyPair = ECPair.fromWIF(fundingWif, bitcoinjsNetwork);
  const payment = payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoinjsNetwork });
  if (!payment.address) {
    throw new Error("unable to derive funding address from WIF");
  }
  return {
    fundingWif,
    fundingAddress: payment.address,
    fundingPubkeyHex: Buffer.from(keyPair.publicKey).toString("hex"),
  };
}

/** Generate a complete wallet (owner + funding) for the given network. */
export function generateWallet(network: OntNetwork): WalletKeys {
  return {
    owner: generateOwnerKey(),
    funding: generateFundingKey(network),
  };
}
