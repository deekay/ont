// On-chain transaction builder for ONT mobile: spend the wallet's P2WPKH funding
// UTXOs into an OP_RETURN-carrying transaction (plus change) and sign it.
//
// This is the shared on-chain rail behind a real (non-demo) mature-name transfer
// and, later, an auction bid. It is intentionally PURE — it imports only
// bitcoinjs-lib + ecpair (via ./hd) and Buffer, no expo/react-native — so it
// bundles under Hermes AND runs under node/tsx in the offline crypto checks.
//
// Coin selection + fee: greedy by value (signet funding UTXOs are large and fees
// trivial), a conservative vbyte estimate, change back to the funding address.
// The OP_RETURN payload is produced byte-for-byte by the engine-mirrored encoders
// (see transfer.ts:encodeTransferPayloadHex) — this module only frames it into a
// standard nulldata output that the indexer's OP_RETURN scan will find.
import { Psbt, address as baddress, script as bscript, opcodes } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { ECPair, toBitcoinjsNetwork, type OntNetwork } from "./hd";

/** A spendable funding output (P2WPKH), value in integer base units. */
export interface FundingUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly valueSats: number;
}

export interface BuildOpReturnSpendInput {
  /** WIF for the P2WPKH funding key that controls every input. */
  readonly fundingWif: string;
  /** The funding address (also the change sink). */
  readonly fundingAddress: string;
  /** Candidate funding UTXOs to select from. */
  readonly utxos: readonly FundingUtxo[];
  /** Framed OP_RETURN payload (hex) — e.g. encodeTransferPayloadHex(...). */
  readonly opReturnHex: string;
  /** Fee rate in base units per virtual byte. Defaults to 2. */
  readonly feeRateSatPerVb?: number;
  readonly network: OntNetwork;
}

export interface BuiltTransaction {
  readonly rawTxHex: string;
  readonly txid: string;
  /** Fee actually paid = selected inputs total − change. */
  readonly feeSats: number;
  /** Actual virtual size of the signed transaction. */
  readonly vbytes: number;
  readonly changeSats: number;
  /** The UTXOs selected as inputs (in input order). */
  readonly inputs: readonly FundingUtxo[];
}

const DEFAULT_FEE_RATE_SAT_PER_VB = 2;
// Below this a P2WPKH change output is uneconomical (standard dust ≈ 294); we
// fold anything smaller into the fee rather than create an unspendable output.
const DUST_SATS = 330;

const HEX_PATTERN = /^[0-9a-f]+$/i;

function opReturnScript(opReturnHex: string): Uint8Array {
  const normalized = opReturnHex.trim().toLowerCase();
  if (!HEX_PATTERN.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("opReturnHex must be an even-length hex string");
  }
  const data = Buffer.from(normalized, "hex");
  // OP_RETURN data outputs are non-standard past 80 bytes on Bitcoin core's
  // default relay policy; ONT's framed events (135 bytes) rely on the stack
  // relaying larger nulldata, which the ONT signet/indexer path does.
  return bscript.compile([opcodes.OP_RETURN, data]);
}

function varIntLen(n: number): number {
  if (n < 0xfd) return 1;
  if (n <= 0xffff) return 3;
  if (n <= 0xffffffff) return 5;
  return 9;
}

/** Serialized size (bytes) of a tx output given its scriptPubKey length. */
function outputSize(scriptLen: number): number {
  return 8 + varIntLen(scriptLen) + scriptLen;
}

/**
 * Conservative virtual-size estimate for a transaction with `numInputs`
 * P2WPKH inputs and the given output scripts. Per-input: 41 non-witness +
 * ~27 vB witness ≈ 68 vB. Overhead: 10 non-witness + 1 (segwit marker/flag,
 * rounded up from 0.5 vB) = 11.
 */
function estimateVbytes(numInputs: number, outputScriptLengths: readonly number[]): number {
  const overhead = 11;
  const perInput = 68;
  const outputs = outputScriptLengths.reduce((sum, len) => sum + outputSize(len), 0);
  return overhead + perInput * numInputs + outputs;
}

const P2WPKH_OUTPUT_SCRIPT_LEN = 22; // OP_0 <20-byte-hash>

/**
 * Build and sign a transaction that spends funding UTXOs into a single
 * OP_RETURN output (vout 0) plus change (vout 1) back to the funding address.
 *
 * Output ordering is mature-transfer-safe: the engine's mature path does not
 * dereference `successorBondVout`, so the OP_RETURN may sit at vout 0. (The
 * contested/immature path, which requires a successor-bond payment output, is a
 * separate builder.)
 */
export function buildOpReturnSpend(input: BuildOpReturnSpendInput): BuiltTransaction {
  const network = toBitcoinjsNetwork(input.network);
  const feeRate = input.feeRateSatPerVb ?? DEFAULT_FEE_RATE_SAT_PER_VB;
  if (!(feeRate > 0)) {
    throw new Error("feeRateSatPerVb must be positive");
  }

  const opReturn = opReturnScript(input.opReturnHex);
  const outputScriptLens = [opReturn.length, P2WPKH_OUTPUT_SCRIPT_LEN];

  const candidates = [...input.utxos]
    .filter((u) => Number.isInteger(u.valueSats) && u.valueSats > 0)
    .sort((a, b) => b.valueSats - a.valueSats);
  if (candidates.length === 0) {
    throw new Error("No spendable funding UTXOs.");
  }

  // Greedy selection: add inputs until value covers the fee for the current
  // input count and still leaves an economical change output.
  const selected: FundingUtxo[] = [];
  let total = 0;
  let estFee = 0;
  for (const utxo of candidates) {
    selected.push(utxo);
    total += utxo.valueSats;
    estFee = Math.ceil(estimateVbytes(selected.length, outputScriptLens) * feeRate);
    if (total - estFee >= DUST_SATS) break;
  }
  if (total - estFee < DUST_SATS) {
    throw new Error(
      `Insufficient funding: have ${total} base units, need > ${estFee + DUST_SATS} to cover the fee.`,
    );
  }

  const changeSats = total - estFee;
  const fundingScript = baddress.toOutputScript(input.fundingAddress, network);

  const psbt = new Psbt({ network });
  for (const utxo of selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: fundingScript, value: BigInt(utxo.valueSats) },
    });
  }
  psbt.addOutput({ script: opReturn, value: 0n });
  psbt.addOutput({ address: input.fundingAddress, value: BigInt(changeSats) });

  const keyPair = ECPair.fromWIF(input.fundingWif, network);
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  return {
    rawTxHex: tx.toHex(),
    txid: tx.getId(),
    feeSats: estFee,
    vbytes: tx.virtualSize(),
    changeSats,
    inputs: selected,
  };
}
