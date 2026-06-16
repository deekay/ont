import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { BitcoinEsploraConfig, BitcoinRpcConfig } from "@ont/bitcoin";

import {
  buildTransferArtifacts,
  maybeWriteJsonFile,
  type FundingInputDescriptor,
  type OntCliNetwork
} from "./builder.js";
import { broadcastSignedArtifacts, type RpcConnectionOptions } from "./rpc-actions.js";
import { signArtifacts } from "./signer.js";

export interface SubmitTransferResult {
  readonly kind: "ont-submit-transfer-result";
  readonly mode: "gift";
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly transferTxid: string;
  readonly outDir: string | null;
  readonly files: {
    readonly transferArtifacts: string | null;
    readonly signedTransferArtifacts: string | null;
  };
}

export async function submitTransfer(options: {
  readonly prevStateTxid: string;
  readonly ownerPrivateKeyHex: string;
  readonly newOwnerPubkey: string;
  readonly successorBondVout: number;
  readonly successorBondSats: bigint;
  readonly currentBondInput: FundingInputDescriptor;
  readonly additionalFundingInputs?: ReadonlyArray<FundingInputDescriptor>;
  readonly feeSats: bigint;
  readonly network: OntCliNetwork;
  readonly expectedChain: RpcConnectionOptions["expectedChain"];
  readonly rpc: BitcoinRpcConfig | undefined;
  readonly esplora: BitcoinEsploraConfig | undefined;
  readonly wifs: ReadonlyArray<string>;
  readonly bondAddress: string;
  readonly changeAddress?: string;
  readonly flags?: number;
  readonly outDir?: string;
}): Promise<SubmitTransferResult> {
  const transferArtifacts = buildTransferArtifacts({
    prevStateTxid: options.prevStateTxid,
    ownerPrivateKeyHex: options.ownerPrivateKeyHex,
    newOwnerPubkey: options.newOwnerPubkey,
    successorBondVout: options.successorBondVout,
    successorBondSats: options.successorBondSats,
    currentBondInput: options.currentBondInput,
    ...(options.additionalFundingInputs === undefined
      ? {}
      : { additionalFundingInputs: options.additionalFundingInputs }),
    feeSats: options.feeSats,
    network: options.network,
    bondAddress: options.bondAddress,
    ...(options.changeAddress === undefined ? {} : { changeAddress: options.changeAddress }),
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
    throw new Error("broadcasted transfer txid does not match the locally signed transfer txid");
  }

  const outDir = options.outDir === undefined ? null : resolve(process.cwd(), options.outDir);

  if (outDir !== null) {
    await mkdir(outDir, { recursive: true });
    await maybeWriteJsonFile(join(outDir, "transfer-artifacts.json"), transferArtifacts);
    await maybeWriteJsonFile(
      join(outDir, "signed-transfer-artifacts.json"),
      signedTransferArtifacts
    );
  }

  return {
    kind: "ont-submit-transfer-result",
    mode: "gift",
    expectedChain: options.expectedChain,
    transferTxid: signedTransferArtifacts.signedTransactionId,
    outDir,
    files: {
      transferArtifacts: outDir === null ? null : join(outDir, "transfer-artifacts.json"),
      signedTransferArtifacts:
        outDir === null ? null : join(outDir, "signed-transfer-artifacts.json")
    }
  };
}
