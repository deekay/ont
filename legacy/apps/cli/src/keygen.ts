import { randomBytes } from "node:crypto";

import { payments, networks, initEccLib } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";

import type { OntCliNetwork } from "./builder.js";

initEccLib(tinysecp);

const ECPair = ECPairFactory(tinysecp);

export interface GeneratedOwnerKey {
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
}

export interface GeneratedFundingKey {
  readonly fundingWif: string;
  readonly fundingAddress: string;
  readonly fundingPubkeyHex: string;
}

export interface GeneratedLiveAccount {
  readonly kind: "ont-generated-live-account";
  readonly network: OntCliNetwork;
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
  readonly fundingWif: string;
  readonly fundingAddress: string;
  readonly fundingPubkeyHex: string;
}

export function createRandomNonceHex(): string {
  return randomBytes(8).toString("hex");
}

export function generateOwnerKey(): GeneratedOwnerKey {
  while (true) {
    const privateKey = randomBytes(32);

    if (!tinysecp.isPrivate(privateKey)) {
      continue;
    }

    const ownerPubkey = tinysecp.xOnlyPointFromScalar(privateKey);

    if (ownerPubkey === null) {
      continue;
    }

    return {
      ownerPrivateKeyHex: Buffer.from(privateKey).toString("hex"),
      ownerPubkey: Buffer.from(ownerPubkey).toString("hex")
    };
  }
}

export function generateFundingKey(network: OntCliNetwork): GeneratedFundingKey {
  const keyPair = ECPair.makeRandom({
    network: resolveNetwork(network),
    rng: (size: number) => randomBytes(size)
  });
  const payment = payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network: resolveNetwork(network)
  });

  if (!payment.address) {
    throw new Error("unable to derive funding address");
  }

  return {
    fundingWif: keyPair.toWIF(),
    fundingAddress: payment.address,
    fundingPubkeyHex: Buffer.from(keyPair.publicKey).toString("hex")
  };
}

export function generateLiveAccount(network: OntCliNetwork): GeneratedLiveAccount {
  const owner = generateOwnerKey();
  const funding = generateFundingKey(network);

  return {
    kind: "ont-generated-live-account",
    network,
    ownerPrivateKeyHex: owner.ownerPrivateKeyHex,
    ownerPubkey: owner.ownerPubkey,
    fundingWif: funding.fundingWif,
    fundingAddress: funding.fundingAddress,
    fundingPubkeyHex: funding.fundingPubkeyHex
  };
}

function resolveNetwork(name: OntCliNetwork) {
  switch (name) {
    case "main":
      return networks.bitcoin;
    case "testnet":
    case "signet":
      return networks.testnet;
    case "regtest":
      return networks.regtest;
  }
}
