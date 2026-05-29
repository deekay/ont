// Demo-mode auction bidder: a local stand-in for placing a bonded bid, so the
// bid flow is walkable on signet without constructing/broadcasting a real PSBT
// bond (that's the live path, #60).
//
// What is real: the auction state (read live from the resolver), the minimum-bid
// rule, and the bidder commitment (this wallet's owner key). What is faked: the
// on-chain bond + broadcast. Same principle as the rest of demo mode — stub the
// service, not the identity.
import type { AuctionEntry } from "./types";

export interface DemoBidInput {
  readonly auction: AuctionEntry;
  readonly bidAmountSats: string;
  readonly ownerPubkey: string;
}

export interface DemoBidResult {
  readonly accepted: boolean;
  readonly reason?: string;
  readonly bidAmountSats: string;
  /** True if this bid would become the new high bid. */
  readonly becameLeader: boolean;
  /** Synthetic bond/bid txid for the demo receipt. */
  readonly bidTxid: string;
  /** The bidder commitment — this wallet's real owner key. */
  readonly bidderCommitment: string;
}

const BIDDABLE_PHASES = new Set(["awaiting_opening_bid", "live_bidding", "soft_close"]);

export function isBiddable(auction: AuctionEntry): boolean {
  return BIDDABLE_PHASES.has(auction.phase);
}

export function minimumNextBidSats(auction: AuctionEntry): bigint {
  const raw = auction.currentRequiredMinimumBidSats ?? auction.openingMinimumBidSats ?? "0";
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

export class MockAuctionBidder {
  readonly isDemo = true;

  placeBid(input: DemoBidInput): DemoBidResult {
    const min = minimumNextBidSats(input.auction);
    let amount: bigint;
    try {
      amount = BigInt(input.bidAmountSats);
    } catch {
      return this.reject(input, "bid amount must be a whole number of base units");
    }
    if (amount <= 0n) {
      return this.reject(input, "bid amount must be positive");
    }
    if (amount < min) {
      return this.reject(input, `below the minimum next bid (${min.toString()})`);
    }
    const current = (() => {
      try {
        return input.auction.currentHighestBidSats ? BigInt(input.auction.currentHighestBidSats) : 0n;
      } catch {
        return 0n;
      }
    })();
    // Deterministic, demo-only bid id derived from the lot + amount (no RNG).
    const tag = `${input.auction.auctionId}:${input.bidAmountSats}`;
    const bidTxid = `de${hashTag(tag)}`.slice(0, 64).padEnd(64, "0");
    return {
      accepted: true,
      bidAmountSats: input.bidAmountSats,
      becameLeader: amount > current,
      bidTxid,
      bidderCommitment: input.ownerPubkey,
    };
  }

  private reject(input: DemoBidInput, reason: string): DemoBidResult {
    return {
      accepted: false,
      reason,
      bidAmountSats: input.bidAmountSats,
      becameLeader: false,
      bidTxid: "",
      bidderCommitment: input.ownerPubkey,
    };
  }
}

// Tiny non-crypto string hash → hex, purely to give demo receipts a stable id.
function hashTag(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0").repeat(8);
}
