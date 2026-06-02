// Auction-bid orchestration: turn a live auction (as the resolver reports it)
// plus a bid amount into a real on-chain bid transaction and broadcast it.
//
// A bid is a Bitcoin tx with a returnable BOND output (a payment the bidder
// controls, value == the bid amount) at vout 0, an OP_RETURN carrying the
// engine-exact auction-bid payload at vout 1, and change. The consensus engine's
// applyAuctionBid accepts it on the bond alone (output exists, is a payment, and
// its value equals the bid amount); the commitments in the payload bind the bid
// to the observed auction lot/state for off-chain validation.
import { esploraBroadcast } from "../api/client";
import { chain, resolver } from "../api/resolver";
import type { AuctionEntry } from "../api/types";
import {
  buildAuctionBidPayloadFields,
  encodeAuctionBidPayloadHex,
  type AuctionBidContext,
  type AuctionBidPackagePhase,
} from "./auction-bid";
import { deriveFundingKey, type OntNetwork } from "./hd";
import { buildOpReturnSpend, type FundingUtxo } from "./tx-build";

const KNOWN_PHASES: readonly AuctionBidPackagePhase[] = [
  "pending_unlock",
  "awaiting_opening_bid",
  "live_bidding",
  "soft_close",
  "settled",
];

const toBig = (v?: string | null): bigint | null => (v == null ? null : BigInt(v));

/** Map a resolver auction entry to the bid context the commitments are built over. */
export function auctionContextFromEntry(
  entry: AuctionEntry,
  settlementLockBlocks: number,
): AuctionBidContext {
  const phase = (KNOWN_PHASES as readonly string[]).includes(entry.phase)
    ? (entry.phase as AuctionBidPackagePhase)
    : "live_bidding";
  return {
    auctionId: entry.auctionId,
    name: entry.normalizedName,
    currentBlockHeight: entry.currentBlockHeight,
    phase,
    unlockBlock: entry.unlockBlock,
    auctionCloseBlockAfter: entry.auctionCloseBlockAfter ?? null,
    openingMinimumBidSats: BigInt(entry.openingMinimumBidSats ?? entry.baseMinimumBidSats ?? "0"),
    currentLeaderBidderCommitment: entry.currentLeaderBidderCommitment ?? null,
    currentHighestBidSats: toBig(entry.currentHighestBidSats),
    currentRequiredMinimumBidSats: toBig(entry.currentRequiredMinimumBidSats),
    settlementLockBlocks: entry.settlementLockBlocks ?? settlementLockBlocks,
  };
}

export interface BroadcastedBid {
  readonly txid: string;
  readonly feeSats: number;
  readonly vbytes: number;
  readonly bondSats: number;
  readonly changeSats: number;
  readonly bidderCommitment: string;
}

/**
 * Build, sign, and broadcast a real on-chain auction bid. The bond is sent to the
 * wallet's funding address (the bidder controls it, so it's returnable at
 * settlement). `ownerPubkey` is the per-name key the bidder would control if the
 * bid wins; `bidderId` defaults to it.
 */
export async function broadcastAuctionBid(input: {
  readonly entry: AuctionEntry;
  readonly ownerPubkey: string;
  readonly bidAmountSats: bigint;
  readonly seedHex: string;
  readonly network: OntNetwork;
  readonly bidderId?: string;
  readonly feeRateSatPerVb?: number;
}): Promise<BroadcastedBid> {
  if (input.bidAmountSats <= 0n) {
    throw new Error("Bid amount must be positive.");
  }

  // Fill the settlement lock from policy if the entry omits it (binds the
  // commitment + the on-chain settlementLockBlocks field to the lot's terms).
  let settlementLockBlocks = input.entry.settlementLockBlocks ?? 0;
  if (!settlementLockBlocks) {
    try {
      const all = await resolver.experimentalAuctions();
      settlementLockBlocks = all.policy?.defaultSettlementLockBlocks ?? 0;
    } catch {
      /* offline / resolver down — proceed; the bond still carries the bid */
    }
  }

  const ctx = auctionContextFromEntry(input.entry, settlementLockBlocks);
  const fields = buildAuctionBidPayloadFields({
    ctx,
    bidderId: input.bidderId ?? input.ownerPubkey,
    ownerPubkey: input.ownerPubkey,
    bidAmountSats: input.bidAmountSats,
    bondVout: 0,
  });
  const opReturnHex = encodeAuctionBidPayloadHex(fields);

  const funding = deriveFundingKey(input.seedHex, input.network);
  const utxos: FundingUtxo[] = (await chain.addressUtxos(funding.fundingAddress))
    .filter((u) => u.status?.confirmed !== false)
    .map((u) => ({ txid: u.txid, vout: u.vout, valueSats: u.value }));
  if (utxos.length === 0) {
    throw new Error(
      "Funding address has no confirmed coins for the bond + fee. Use Deposit to fund it first.",
    );
  }

  const bondSats = Number(input.bidAmountSats);
  if (!Number.isSafeInteger(bondSats)) {
    throw new Error("Bid amount is too large to bond on this network.");
  }

  const built = buildOpReturnSpend({
    fundingWif: funding.fundingWif,
    fundingAddress: funding.fundingAddress,
    utxos,
    opReturnHex,
    paymentOutputs: [{ address: funding.fundingAddress, valueSats: bondSats }],
    feeRateSatPerVb: input.feeRateSatPerVb,
    network: input.network,
  });

  const txid = await esploraBroadcast(built.rawTxHex);
  return {
    txid,
    feeSats: built.feeSats,
    vbytes: built.vbytes,
    bondSats,
    changeSats: built.changeSats,
    bidderCommitment: fields.bidderCommitment,
  };
}
