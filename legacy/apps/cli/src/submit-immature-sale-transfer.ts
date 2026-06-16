import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { BitcoinEsploraConfig, BitcoinRpcConfig } from "@ont/bitcoin";

import {
  buildImmatureSaleTransferArtifacts,
  maybeWriteJsonFile,
  type FundingInputDescriptor,
  type OntCliNetwork
} from "./builder.js";
import { broadcastSignedArtifacts, type RpcConnectionOptions } from "./rpc-actions.js";
import { signArtifacts } from "./signer.js";

export interface SubmitImmatureSaleTransferResult {
  readonly kind: "ont-submit-immature-sale-transfer-result";
  readonly mode: "immature-sale";
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly transferTxid: string;
  readonly outDir: string | null;
  readonly files: {
    readonly transferArtifacts: string | null;
    readonly signedTransferArtifacts: string | null;
  };
}

export async function submitImmatureSaleTransfer(options: {
  readonly prevStateTxid: string;
  readonly ownerPrivateKeyHex: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly successorBondSats: bigint;
  readonly currentBondInput: FundingInputDescriptor;
  readonly sellerInputs?: ReadonlyArray<FundingInputDescriptor>;
  readonly buyerInputs: ReadonlyArray<FundingInputDescriptor>;
  readonly salePriceSats: bigint;
  readonly sellerPayoutAddress: string;
  readonly feeSats: bigint;
  readonly network: OntCliNetwork;
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly wifs: ReadonlyArray<string>;
  readonly bondAddress: string;
  readonly buyerChangeAddress?: string;
  readonly flags?: number;
  readonly outDir?: string;
}): Promise<SubmitImmatureSaleTransferResult> {
  const transferArtifacts = buildImmatureSaleTransferArtifacts({
    prevStateTxid: options.prevStateTxid,
    ownerPrivateKeyHex: options.ownerPrivateKeyHex,
    newOwnerPubkey: options.newOwnerPubkey,
    successorBondVout: options.successorBondVout,
    successorBondSats: options.successorBondSats,
    currentBondInput: options.currentBondInput,
    ...(options.sellerInputs === undefined ? {} : { sellerInputs: options.sellerInputs }),
    buyerInputs: options.buyerInputs,
    salePriceSats: options.salePriceSats,
    sellerPayoutAddress: options.sellerPayoutAddress,
    feeSats: options.feeSats,
    network: options.network,
    bondAddress: options.bondAddress,
    ...(options.buyerChangeAddress === undefined
      ? {}
      : { buyerChangeAddress: options.buyerChangeAddress }),
    ...(options.flags === undefined ? {} : { flags: options.flags })
  });

  const signedTransferArtifacts = signArtifacts({
    artifacts: transferArtifacts,
    wifs: options.wifs
  });

  const { broadcastedTxid } = await broadcastSignedArtifacts({
    rpc: options.rpc,
    esplora: options.esplora,
    expectedChain: options.expectedChain,
    signedArtifacts: signedTransferArtifacts
  });

  if (broadcastedTxid !== signedTransferArtifacts.signedTransactionId) {
    throw new Error("broadcasted immature sale transfer txid does not match the locally signed txid");
  }

  const outDir = options.outDir === undefined ? null : resolve(process.cwd(), options.outDir);

  if (outDir !== null) {
    await mkdir(outDir, { recursive: true });
    await maybeWriteJsonFile(join(outDir, "immature-sale-transfer-artifacts.json"), transferArtifacts);
    await maybeWriteJsonFile(
      join(outDir, "signed-immature-sale-transfer-artifacts.json"),
      signedTransferArtifacts
    );
  }

  return {
    kind: "ont-submit-immature-sale-transfer-result",
    mode: "immature-sale",
    expectedChain: options.expectedChain,
    transferTxid: signedTransferArtifacts.signedTransactionId,
    outDir,
    files: {
      transferArtifacts:
        outDir === null ? null : join(outDir, "immature-sale-transfer-artifacts.json"),
      signedTransferArtifacts:
        outDir === null ? null : join(outDir, "signed-immature-sale-transfer-artifacts.json")
    }
  };
}
