export {
  serializeLegacyTransaction,
  parseLegacyTransaction,
  legacyTxidOf,
  type LegacyTransaction,
  type LegacyTransactionInput,
  type LegacyTransactionOutput,
} from "./legacy-tx.js";

export { bitsToTarget, headerMeetsTarget } from "./block-header.js";

export { merkleBranchForIndex, merkleRootFromProof, merkleRootHexFromHeaderHex } from "./merkle-proof.js";

export { opReturnData } from "./op-return.js";

export {
  validateHeaderChain,
  type BitcoinHeaderSource,
  type BitcoinDifficultyCheckpoint,
  type BitcoinNetworkParams,
  type ValidatedHeaderChain,
  type RejectedHeaderChain,
  type HeaderChainRejectReason,
  type HeaderChainResult,
} from "./validate-header-chain.js";

export interface BitcoinTransactionOutput {
  readonly valueSats: bigint;
  readonly scriptType: "op_return" | "payment" | "unknown";
  readonly dataHex?: string;
  /**
   * The parsed destination of a payment output (RPC `scriptPubKey.address`, Esplora
   * `scriptpubkey_address`), when the source exposes one. Consumed by the recovery-invoke
   * successor-bond binding (PR-34): the kernel requires the rotated bond output to pay the
   * descriptor's `recoveryAddress`, and a missing destination fails that check closed. B3 may
   * refine address->script derivation; B2 binds on this parsed destination.
   */
  readonly address?: string;
}

export interface BitcoinTransactionInput {
  readonly txid: string | null;
  readonly vout: number | null;
  readonly coinbase: boolean;
}

export interface BitcoinTransaction {
  readonly txid: string;
  readonly inputs: readonly BitcoinTransactionInput[];
  readonly outputs: readonly BitcoinTransactionOutput[];
}

export interface BitcoinBlock {
  readonly hash: string;
  readonly height: number;
  readonly transactions: readonly BitcoinTransaction[];
}

export interface BitcoinTransactionInBlock {
  readonly tx: BitcoinTransaction;
  readonly blockHeight: number;
  readonly txIndex: number;
}

export function getOpReturnPayloads(
  transaction: BitcoinTransaction
): ReadonlyArray<{ readonly vout: number; readonly payload: Uint8Array }> {
  return transaction.outputs.flatMap((output, vout) => {
    if (output.scriptType !== "op_return" || output.dataHex === undefined) {
      return [];
    }

    try {
      return [
        {
          vout,
          payload: hexToBytes(output.dataHex)
        }
      ];
    } catch {
      return [];
    }
  });
}

/**
 * Validate a Bitcoin block header serialized as display hex: exactly 80 bytes = 160 lowercase hex
 * chars. Returns it unchanged, or throws. (go-live G1 sub-slice 3b-4b - the candidate's blockHeaderHex
 * the audited buildConfirmedBatchAnchor reads bytes 36..68 from; a wrong-length header must fail closed
 * here, not silently feed a bad Merkle root.) Lowercase is required, not normalized - bitcoind returns
 * lowercase and the consensus comparison is byte-exact.
 */
export function assertBlockHeaderHex(hex: unknown): string {
  if (typeof hex !== "string" || !/^[0-9a-f]{160}$/.test(hex)) {
    throw new Error("bitcoin block header must be 160 lowercase hex chars (80 bytes)");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("hex payload must have an even number of characters");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const value = Number.parseInt(hex.slice(index, index + 2), 16);

    if (Number.isNaN(value)) {
      throw new Error("hex payload must contain only hexadecimal characters");
    }

    bytes[index / 2] = value;
  }

  return bytes;
}
