import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { BitcoinEsploraConfig, BitcoinRpcConfig } from "@ont/bitcoin";

import {
  buildSaleTransferArtifacts,
  maybeWriteJsonFile,
  type FundingInputDescriptor,
  type OntCliNetwork
} from "./builder.js";
import { broadcastSignedArtifacts, type RpcConnectionOptions } from "./rpc-actions.js";
import { signArtifacts } from "./signer.js";

export interface SubmitSaleTransferResult {
  readonly kind: "ont-submit-sale-transfer-result";
  readonly mode: "sale";
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly transferTxid: string;
  readonly outDir: string | null;
  readonly files: {
    readonly transferArtifacts: string | null;
    readonly signedTransferArtifacts: string | null;
  };
}

export async function submitSaleTransfer(options: {
  readonly prevStateTxid: string;
  readonly ownerPrivateKeyHex: string;
  readonly newOwnerPubkey: string;
  readonly sellerInputs: ReadonlyArray<FundingInputDescriptor>;
  readonly buyerInputs: ReadonlyArray<FundingInputDescriptor>;
  readonly sellerPaymentSats: bigint;
  readonly sellerPaymentAddress: string;
  readonly feeSats: bigint;
  readonly network: OntCliNetwork;
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly wifs: ReadonlyArray<string>;
  readonly sellerChangeAddress?: string;
  readonly buyerChangeAddress?: string;
  readonly flags?: number;
  readonly outDir?: string;
}): Promise<SubmitSaleTransferResult> {
  const transferArtifacts = buildSaleTransferArtifacts({
    prevStateTxid: options.prevStateTxid,
    ownerPrivateKeyHex: options.ownerPrivateKeyHex,
    newOwnerPubkey: options.newOwnerPubkey,
    sellerInputs: options.sellerInputs,
    buyerInputs: options.buyerInputs,
    sellerPaymentSats: options.sellerPaymentSats,
    sellerPaymentAddress: options.sellerPaymentAddress,
    feeSats: options.feeSats,
    network: options.network,
    ...(options.sellerChangeAddress === undefined
      ? {}
      : { sellerChangeAddress: options.sellerChangeAddress }),
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
    throw new Error("broadcasted sale transfer txid does not match the locally signed txid");
  }

  const outDir = options.outDir === undefined ? null : resolve(process.cwd(), options.outDir);

  if (outDir !== null) {
    await mkdir(outDir, { recursive: true });
    await maybeWriteJsonFile(join(outDir, "sale-transfer-artifacts.json"), transferArtifacts);
    await maybeWriteJsonFile(
      join(outDir, "signed-sale-transfer-artifacts.json"),
      signedTransferArtifacts
    );
  }

  return {
    kind: "ont-submit-sale-transfer-result",
    mode: "sale",
    expectedChain: options.expectedChain,
    transferTxid: signedTransferArtifacts.signedTransactionId,
    outDir,
    files: {
      transferArtifacts:
        outDir === null ? null : join(outDir, "sale-transfer-artifacts.json"),
      signedTransferArtifacts:
        outDir === null ? null : join(outDir, "signed-sale-transfer-artifacts.json")
    }
  };
}
