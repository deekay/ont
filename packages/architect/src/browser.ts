import {
  address as btcAddress,
  networks,
  opcodes,
  Psbt,
  script as btcScript,
  Transaction
} from "bitcoinjs-lib";
import { Buffer } from "buffer";

import {
  bytesToHex,
  computeAuctionBidderCommitment,
  computeAuctionBidStateCommitment,
  computeAuctionLotCommitment,
  encodeAuctionBidPayload,
  type AuctionBidPackage,
  parseAuctionBidPackage
} from "@ont/protocol";

export type OntCliNetwork = "main" | "signet" | "testnet" | "regtest";

export interface FundingInputDescriptor {
  readonly txid: string;
  readonly vout: number;
  readonly valueSats: bigint;
  readonly address: string;
  readonly derivationPath?: string;
}

export interface BuildAuctionBidArtifactsOptions {
  readonly bidPackage: AuctionBidPackage;
  readonly fundingInputs: ReadonlyArray<FundingInputDescriptor>;
  readonly feeSats: bigint;
  readonly network: OntCliNetwork;
  readonly bondAddress: string;
  readonly changeAddress?: string;
  readonly bondVout?: number;
  readonly flags?: number;
}

export interface AuctionBidArtifacts {
  readonly kind: "ont-auction-bid-artifacts";
  readonly network: OntCliNetwork;
  readonly feeSats: string;
  readonly totalInputSats: string;
  readonly changeValueSats: string;
  readonly unsignedTransactionHex: string;
  readonly unsignedTransactionVirtualSize: number;
  readonly bidTxid: string;
  readonly psbtBase64: string;
  readonly outputs: ReadonlyArray<{
    readonly vout: number;
    readonly role: "auction_bid_bond" | "ont_auction_bid" | "change";
    readonly valueSats: string;
    readonly address: string | null;
    readonly scriptHex: string;
  }>;
  readonly payloadHex: string;
  readonly payloadBytes: number;
  readonly bondAddress: string;
  readonly bondVout: number;
  readonly auctionLotCommitment: string;
  readonly bidderCommitment: string;
  readonly auctionStateCommitment: string;
}

interface AuctionBidBuilderOutput {
  readonly role: "auction_bid_bond" | "ont_auction_bid" | "change";
  readonly valueSats: bigint;
  readonly address: string | null;
  readonly script: Uint8Array;
}

export function parseFundingInputDescriptor(spec: string): FundingInputDescriptor {
  const parts = spec.split(":");

  if (parts.length !== 4 && parts.length !== 5) {
    throw new Error(
      "input descriptors must use txid:vout:valueSats:address[:derivationPath]"
    );
  }

  const [txid, voutText, valueText, inputAddress, derivationPath] = parts;

  if (!/^[0-9a-fA-F]{64}$/.test(txid ?? "")) {
    throw new Error("input txid must be 32-byte hex");
  }

  const vout = Number.parseInt(voutText ?? "", 10);
  if (!Number.isInteger(vout) || vout < 0) {
    throw new Error("input vout must be a non-negative integer");
  }

  const valueSats = BigInt(valueText ?? "");
  if (valueSats <= 0n) {
    throw new Error("input valueSats must be positive");
  }

  if (!inputAddress) {
    throw new Error("input address is required");
  }

  return {
    txid: (txid ?? "").toLowerCase(),
    vout,
    valueSats,
    address: inputAddress,
    ...(derivationPath ? { derivationPath } : {})
  };
}

export function buildAuctionBidArtifacts(
  options: BuildAuctionBidArtifactsOptions
): AuctionBidArtifacts {
  const network = resolveNetwork(options.network);
  const bidPackage = parseAuctionBidPackage(options.bidPackage);
  const flags = options.flags ?? 0;
  const bondVout = options.bondVout ?? 0;

  if (!Number.isInteger(flags) || flags < 0 || flags > 0xff) {
    throw new Error("flags must fit in one byte");
  }

  if (!Number.isInteger(bondVout) || bondVout < 0 || bondVout > 1) {
    throw new Error("prototype auction bid builder currently supports bondVout 0 or 1 only");
  }

  const bondAddress = options.bondAddress;
  const bidAmountSats = BigInt(bidPackage.bidAmountSats);
  const totalInputSats = sumInputValues(options.fundingInputs);
  const changeAddress = options.changeAddress ?? null;
  const changeValueSats = totalInputSats - bidAmountSats - options.feeSats;

  if (changeValueSats < 0n) {
    throw new Error("funding inputs do not cover the auction bid amount and fee");
  }

  if (changeValueSats > 0n && changeAddress === null) {
    throw new Error("a change address is required when the auction bid transaction produces change");
  }

  const expectedBidderCommitment = computeAuctionBidderCommitment(bidPackage.bidderId);
  if (bidPackage.bidderCommitment !== expectedBidderCommitment) {
    throw new Error("bid package bidderCommitment does not match bidderId");
  }

  const expectedAuctionStateCommitment = computeAuctionBidStateCommitment({
    auctionId: bidPackage.auctionId,
    name: bidPackage.name,
    auctionClassId: bidPackage.auctionClassId,
    currentBlockHeight: bidPackage.currentBlockHeight,
    phase: bidPackage.phase,
    unlockBlock: bidPackage.unlockBlock,
    auctionCloseBlockAfter: bidPackage.auctionCloseBlockAfter,
    openingMinimumBidSats: BigInt(bidPackage.openingMinimumBidSats),
    currentLeaderBidderCommitment: bidPackage.currentLeaderBidderCommitment,
    currentHighestBidSats: bidPackage.currentHighestBidSats === null ? null : BigInt(bidPackage.currentHighestBidSats),
    currentRequiredMinimumBidSats:
      bidPackage.currentRequiredMinimumBidSats === null ? null : BigInt(bidPackage.currentRequiredMinimumBidSats),
    settlementLockBlocks: bidPackage.settlementLockBlocks
  });
  const expectedAuctionLotCommitment = computeAuctionLotCommitment({
    auctionId: bidPackage.auctionId,
    name: bidPackage.name,
    auctionClassId: bidPackage.auctionClassId,
    unlockBlock: bidPackage.unlockBlock
  });
  if (bidPackage.auctionLotCommitment !== expectedAuctionLotCommitment) {
    throw new Error("bid package name commitment does not match the auction name");
  }
  if (bidPackage.auctionStateCommitment !== expectedAuctionStateCommitment) {
    throw new Error("bid package auctionStateCommitment does not match the observed auction state");
  }

  const bidBondScript = toSupportedOutputScript(bondAddress, network, "bond address");
  const payloadBytes = encodeAuctionBidPayload({
    flags,
    bondVout,
    settlementLockBlocks: bidPackage.settlementLockBlocks,
    bidAmountSats,
    ownerPubkey: bidPackage.ownerPubkey,
    auctionLotCommitment: bidPackage.auctionLotCommitment,
    auctionCommitment: bidPackage.auctionStateCommitment,
    bidderCommitment: bidPackage.bidderCommitment,
    name: bidPackage.name,
    unlockBlock: bidPackage.unlockBlock
  });
  const auctionBidScript = compileOpReturn(bytesToHex(payloadBytes));
  const changeScript = changeAddress === null ? null : toSupportedOutputScript(changeAddress, network, "change address");

  const outputs: AuctionBidBuilderOutput[] = bondVout === 0
    ? [
        {
          role: "auction_bid_bond",
          valueSats: bidAmountSats,
          address: bondAddress,
          script: bidBondScript
        },
        {
          role: "ont_auction_bid",
          valueSats: 0n,
          address: null,
          script: auctionBidScript
        }
      ]
    : [
        {
          role: "ont_auction_bid",
          valueSats: 0n,
          address: null,
          script: auctionBidScript
        },
        {
          role: "auction_bid_bond",
          valueSats: bidAmountSats,
          address: bondAddress,
          script: bidBondScript
        }
      ];

  if (changeValueSats > 0n && changeScript !== null) {
    outputs.push({
      role: "change",
      valueSats: changeValueSats,
      address: changeAddress,
      script: changeScript
    });
  }

  const transaction = new Transaction();
  const psbt = new Psbt({ network });
  transaction.version = 2;
  psbt.setVersion(2);

  for (const input of options.fundingInputs) {
    const inputScript = toSupportedOutputScript(input.address, network, "input address");

    transaction.addInput(reverseTxid(input.txid), input.vout);
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: inputScript,
        value: input.valueSats
      }
    });
  }

  for (const output of outputs) {
    transaction.addOutput(output.script, output.valueSats);

    if (output.address !== null) {
      psbt.addOutput({
        address: output.address,
        value: output.valueSats
      });
    } else {
      psbt.addOutput({
        script: output.script,
        value: output.valueSats
      });
    }
  }

  return {
    kind: "ont-auction-bid-artifacts",
    network: options.network,
    feeSats: options.feeSats.toString(),
    totalInputSats: totalInputSats.toString(),
    changeValueSats: changeValueSats.toString(),
    unsignedTransactionHex: transaction.toHex(),
    unsignedTransactionVirtualSize: transaction.virtualSize(),
    bidTxid: transaction.getId(),
    psbtBase64: psbt.toBase64(),
    outputs: outputs.map((output, index) => ({
      vout: index,
      role: output.role,
      valueSats: output.valueSats.toString(),
      address: output.address,
      scriptHex: bytesToHex(output.script)
    })),
    payloadHex: bytesToHex(payloadBytes),
    payloadBytes: payloadBytes.length,
    bondAddress,
    bondVout,
    auctionLotCommitment: bidPackage.auctionLotCommitment,
    bidderCommitment: bidPackage.bidderCommitment,
    auctionStateCommitment: bidPackage.auctionStateCommitment
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

function sumInputValues(inputs: ReadonlyArray<FundingInputDescriptor>): bigint {
  if (inputs.length === 0) {
    throw new Error("at least one funding input is required");
  }

  return inputs.reduce((sum, input) => sum + input.valueSats, 0n);
}

function toSupportedOutputScript(address: string, network: ReturnType<typeof resolveNetwork>, label: string): Uint8Array {
  assertSupportedSegwitAddress(address, network, label);
  return btcAddress.toOutputScript(address, network);
}

function assertSupportedSegwitAddress(
  candidate: string,
  network: ReturnType<typeof resolveNetwork>,
  label: string
): void {
  const decoded = btcAddress.fromBech32(candidate);

  if (decoded.prefix !== network.bech32) {
    throw new Error(`${label} must use the ${network.bech32} bech32 prefix for the selected network`);
  }

  if (decoded.version !== 0 && decoded.version !== 1) {
    throw new Error(`${label} must be a v0 or v1 segwit address`);
  }
}

function reverseTxid(txid: string): Uint8Array {
  return Uint8Array.from(Buffer.from(txid, "hex").reverse());
}

function compileOpReturn(dataHex: string): Uint8Array {
  return btcScript.compile([opcodes.OP_RETURN, Buffer.from(dataHex, "hex")]);
}
