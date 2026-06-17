// Key generation for the ONT reference client.
//
// Two keys, two jobs:
//  - the owner key (x-only Schnorr) controls the name itself — it signs ONT
//    ownership events (value records, transfers, recovery). This is the key the
//    keystore guards.
//  - the funding key (P2WPKH) pays the Bitcoin fees and bonds — ordinary on-chain
//    spending, not name authority.

import { randomBytes } from "node:crypto";

import { initEccLib, networks, payments, type Network } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";

initEccLib(tinysecp);
const ECPair = ECPairFactory(tinysecp);

export type OntNetwork = "main" | "testnet" | "signet" | "regtest";

export const ONT_NETWORKS: readonly OntNetwork[] = ["main", "testnet", "signet", "regtest"];

export function isOntNetwork(value: string): value is OntNetwork {
  return (ONT_NETWORKS as readonly string[]).includes(value);
}

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

/** Derive the x-only owner pubkey for a given owner private key. */
export function ownerPubkeyForPrivateKey(ownerPrivateKeyHex: string): string | null {
  const privateKey = Buffer.from(ownerPrivateKeyHex, "hex");
  if (privateKey.length !== 32 || !tinysecp.isPrivate(privateKey)) {
    return null;
  }
  const pub = tinysecp.xOnlyPointFromScalar(privateKey);
  return pub === null ? null : Buffer.from(pub).toString("hex");
}

/** Generate a P2WPKH funding key for paying on-chain fees and bonds. */
export function generateFundingKey(network: OntNetwork): FundingKey {
  const bitcoinjsNetwork = toBitcoinjsNetwork(network);
  const keyPair = ECPair.makeRandom({
    network: bitcoinjsNetwork,
    rng: (size: number) => randomBytes(size)
  });
  const payment = payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoinjsNetwork });
  if (!payment.address) {
    throw new Error("unable to derive funding address");
  }
  return {
    fundingWif: keyPair.toWIF(),
    fundingAddress: payment.address,
    fundingPubkeyHex: Buffer.from(keyPair.publicKey).toString("hex")
  };
}

/** Recover the funding address + pubkey from a WIF (used when loading a keystore). */
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
    fundingPubkeyHex: Buffer.from(keyPair.publicKey).toString("hex")
  };
}
