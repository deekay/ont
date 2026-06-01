// Pure HD key derivation + key helpers for the ONT wallet.
//
// This module imports NO expo / react-native code, so it runs unchanged under
// Hermes (in the app) AND under node/tsx (in the offline crypto checks). The
// CSPRNG-seeded generators that need device randomness live in keys.ts, which
// wraps this module and re-exports it.
//
// Key model: one master seed derives a fresh owner key per name (privacy — a
// wallet's names aren't linkable by a shared owner pubkey) plus one funding key.
import * as ecc from "@bitcoinerlab/secp256k1";
import { BIP32Factory } from "bip32";
import { initEccLib, networks, payments, type Network } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import { Buffer } from "buffer";

initEccLib(ecc);
export const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

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

// Owner keys live on a dedicated hardened ONT branch so each name gets its own
// key. Funding stays a single key for now (honest caveat: funding inputs can
// still link names on-chain until per-name funding lands).
const OWNER_PURPOSE = 696969; // hardened "ONT owner" branch
function ownerDerivationPath(index: number): string {
  return `m/${OWNER_PURPOSE}'/0'/${index}'`;
}
const FUNDING_PATH = "m/84'/1'/0'/0/0"; // P2WPKH funding (network set by params, not path)

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

/** Validate a master seed: 32 bytes of hex. Returns the normalized hex or null. */
export function normalizeSeedHex(seedHex: string): string | null {
  const trimmed = seedHex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(trimmed)) return null;
  return trimmed;
}

function rootFromSeed(seedHex: string, network: OntNetwork) {
  const seed = Buffer.from(seedHex, "hex");
  if (seed.length !== 32) {
    throw new Error("master seed must be 32 bytes");
  }
  return bip32.fromSeed(seed, toBitcoinjsNetwork(network));
}

/**
 * Derive the owner key for a given name index. Each claimed name is assigned the
 * next index, so its on-chain owner commitment is a distinct key — names owned
 * by the same wallet are not linkable by a shared owner pubkey.
 */
export function deriveOwnerKey(
  seedHex: string,
  index: number,
  network: OntNetwork = "signet",
): OwnerKey {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("owner key index must be a non-negative integer");
  }
  const node = rootFromSeed(seedHex, network).derivePath(ownerDerivationPath(index));
  if (!node.privateKey) {
    throw new Error("derived owner node has no private key");
  }
  const privateKey = Buffer.from(node.privateKey);
  const pub = ecc.xOnlyPointFromScalar(privateKey);
  if (pub === null) {
    throw new Error("could not derive x-only owner pubkey");
  }
  return {
    ownerPrivateKeyHex: privateKey.toString("hex"),
    ownerPubkey: Buffer.from(pub).toString("hex"),
  };
}

/** Derive the single funding key (P2WPKH) from the master seed. */
export function deriveFundingKey(seedHex: string, network: OntNetwork): FundingKey {
  const bitcoinjsNetwork = toBitcoinjsNetwork(network);
  const node = rootFromSeed(seedHex, network).derivePath(FUNDING_PATH);
  if (!node.privateKey) {
    throw new Error("derived funding node has no private key");
  }
  const keyPair = ECPair.fromPrivateKey(Buffer.from(node.privateKey), { network: bitcoinjsNetwork });
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
