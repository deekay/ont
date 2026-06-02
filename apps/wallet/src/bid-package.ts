// Map a resolver's live auction state into a signable auction bid package.
//
// The resolver reports auction state with the same fields the protocol's
// commitment scheme uses, so this is a mechanical translation: we pass the
// observed state straight through to createAuctionBidPackage, which recomputes
// the lot/state commitments the on-chain bid must carry. The only things we add
// are the bidder's identity and amount.

import { type AuctionBidPackage, createAuctionBidPackage } from "@ont/protocol";

import type { ResolverAuctionState } from "./resolver.js";

export interface BidderInput {
  readonly ownerPubkey: string;
  readonly bidderId: string;
  readonly bidAmountSats: bigint;
}

export function bidPackageFromAuction(auction: ResolverAuctionState, bidder: BidderInput): AuctionBidPackage {
  return createAuctionBidPackage({
    auctionId: auction.auctionId,
    name: auction.normalizedName,
    currentBlockHeight: auction.currentBlockHeight,
    phase: auction.phase,
    unlockBlock: auction.unlockBlock,
    auctionCloseBlockAfter: auction.auctionCloseBlockAfter,
    openingMinimumBidSats: auction.openingMinimumBidSats,
    currentLeaderBidderCommitment: auction.currentLeaderBidderCommitment,
    currentHighestBidSats: auction.currentHighestBidSats,
    currentRequiredMinimumBidSats: auction.currentRequiredMinimumBidSats,
    settlementLockBlocks: auction.settlementLockBlocks,
    blocksUntilUnlock: auction.blocksUntilUnlock,
    blocksUntilClose: auction.blocksUntilClose,
    bidderId: bidder.bidderId,
    ownerPubkey: bidder.ownerPubkey,
    bidAmountSats: bidder.bidAmountSats
  });
}
