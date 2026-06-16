import ECPairFactory from "ecpair";
import { initEccLib, networks, Psbt } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";

import type { OntCliNetwork } from "./builder.js";

initEccLib(tinysecp);

const ECPair = ECPairFactory(tinysecp);

export interface BuiltArtifactsEnvelope {
  readonly kind:
    | "ont-transfer-artifacts"
    | "ont-auction-bid-artifacts";
  readonly network: OntCliNetwork;
  readonly psbtBase64: string;
  readonly transferTxid?: string;
  readonly bidTxid?: string;
}

export interface SignedArtifacts {
  readonly kind:
    | "ont-signed-transfer-artifacts"
    | "ont-signed-auction-bid-artifacts";
  readonly network: OntCliNetwork;
  readonly signedTransactionHex: string;
  readonly signedTransactionId: string;
  readonly signedPsbtBase64: string;
  readonly signedInputCount: number;
}

export interface SignedArtifactsEnvelope {
  readonly kind:
    | "ont-signed-transfer-artifacts"
    | "ont-signed-auction-bid-artifacts";
  readonly network: OntCliNetwork;
  readonly signedTransactionHex: string;
  readonly signedTransactionId: string;
  readonly signedPsbtBase64: string;
  readonly signedInputCount: number;
}

export function parseBuiltArtifactsEnvelope(input: unknown): BuiltArtifactsEnvelope {
  const record = assertRecord(input, "artifacts");
  const kind = assertString(record.kind, "kind");

  if (
    kind !== "ont-transfer-artifacts" &&
    kind !== "ont-auction-bid-artifacts"
  ) {
    throw new Error(
      "artifacts kind must be ont-transfer-artifacts or ont-auction-bid-artifacts"
    );
  }

  const network = parseNetwork(assertString(record.network, "network"));
  const psbtBase64 = assertString(record.psbtBase64, "psbtBase64");

  return {
    kind,
    network,
    psbtBase64,
    ...(typeof record.transferTxid === "string" ? { transferTxid: record.transferTxid } : {}),
    ...(typeof record.bidTxid === "string" ? { bidTxid: record.bidTxid } : {})
  };
}

export function signArtifacts(options: {
  readonly artifacts: BuiltArtifactsEnvelope;
  readonly wifs: ReadonlyArray<string>;
}): SignedArtifacts {
  if (options.wifs.length === 0) {
    throw new Error("at least one --wif is required");
  }

  const network = resolveNetwork(options.artifacts.network);
  const psbt = Psbt.fromBase64(options.artifacts.psbtBase64, { network });
  const keyPairs = options.wifs.map((wif) => ECPair.fromWIF(wif, [network]));
  let signedInputCount = 0;

  for (let inputIndex = 0; inputIndex < psbt.inputCount; inputIndex += 1) {
    const inputType = psbt.getInputType(inputIndex);

    if (inputType !== "witnesspubkeyhash") {
      throw new Error(
        `prototype signer only supports witnesspubkeyhash inputs right now; input ${inputIndex} is ${inputType}`
      );
    }

    let signed = false;

    for (const keyPair of keyPairs) {
      if (!psbt.inputHasPubkey(inputIndex, keyPair.publicKey)) {
        continue;
      }

      psbt.signInput(inputIndex, keyPair);
      signed = true;
      signedInputCount += 1;
      break;
    }

    if (!signed) {
      throw new Error(`no supplied WIF matched input ${inputIndex}`);
    }
  }

  psbt.finalizeAllInputs();
  const transaction = psbt.extractTransaction(true);
  const signedTransactionId = transaction.getId();

  if (
    options.artifacts.kind === "ont-transfer-artifacts" &&
    options.artifacts.transferTxid &&
    options.artifacts.transferTxid !== signedTransactionId
  ) {
    throw new Error("signed transfer txid does not match the unsigned transfer artifact");
  }

  if (
    options.artifacts.kind === "ont-auction-bid-artifacts" &&
    options.artifacts.bidTxid &&
    options.artifacts.bidTxid !== signedTransactionId
  ) {
    throw new Error("signed auction bid txid does not match the unsigned auction bid artifact");
  }

  return {
    kind: options.artifacts.kind === "ont-auction-bid-artifacts"
      ? "ont-signed-auction-bid-artifacts"
      : "ont-signed-transfer-artifacts",
    network: options.artifacts.network,
    signedTransactionHex: transaction.toHex(),
    signedTransactionId,
    signedPsbtBase64: psbt.toBase64(),
    signedInputCount
  };
}

export function parseSignedArtifactsEnvelope(input: unknown): SignedArtifactsEnvelope {
  const record = assertRecord(input, "signed artifacts");
  const kind = assertString(record.kind, "kind");

  if (
    kind !== "ont-signed-transfer-artifacts" &&
    kind !== "ont-signed-auction-bid-artifacts"
  ) {
    throw new Error(
      "signed artifacts kind must be ont-signed-transfer-artifacts or ont-signed-auction-bid-artifacts"
    );
  }

  return {
    kind,
    network: parseNetwork(assertString(record.network, "network")),
    signedTransactionHex: assertString(record.signedTransactionHex, "signedTransactionHex"),
    signedTransactionId: assertString(record.signedTransactionId, "signedTransactionId"),
    signedPsbtBase64: assertString(record.signedPsbtBase64, "signedPsbtBase64"),
    signedInputCount: assertInteger(record.signedInputCount, "signedInputCount")
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

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function assertInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }

  return value as number;
}

function parseNetwork(value: string): OntCliNetwork {
  if (value === "main" || value === "signet" || value === "testnet" || value === "regtest") {
    return value;
  }

  throw new Error("artifacts network must be one of main, signet, testnet, regtest");
}
