// Assemble a portable ONT ownership proof bundle from resolver data.
//
// ONT's value proposition is that ownership is a self-verifying Bitcoin fact: a
// proof bundle anyone can check offline with @ont/consensus' verifyProofBundle,
// without trusting the resolver that served it. This builds the
// `bitcoin_l1_direct_auction` bundle from a name's resolver record plus the
// auction's observed bids — the winning bid, its bond (now the name bond), and
// the current owner. The exporter never *asserts* validity; it lays out the
// claim, and the verifier decides. (A name transferred since its auction won't
// validate as a direct-auction proof — that needs the transfer chain, a later
// addition.)

import { normalizeName } from "@ont/protocol";

import type { ResolverAuctionState, ResolverNameRecord, ResolverValueHistory } from "./resolver.js";

export class ProofExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProofExportError";
  }
}

export interface DirectAuctionProofInput {
  readonly record: ResolverNameRecord;
  readonly auction: ResolverAuctionState;
  /** Owner-signed value records published since the auction; included as a chain in the bundle. */
  readonly valueHistory?: ResolverValueHistory;
  readonly assuranceTier?: string;
  readonly verificationGoal?: string;
}

export function assembleDirectAuctionProofBundle(input: DirectAuctionProofInput): Record<string, unknown> {
  const { record, auction } = input;

  if (
    record.currentBondTxid === undefined ||
    record.currentBondVout === undefined ||
    record.currentBondValueSats === undefined
  ) {
    throw new ProofExportError(`resolver did not report a bond outpoint for "${record.name}" — cannot prove the bond`);
  }

  const acceptedBids = (auction.visibleBidOutcomes ?? [])
    .filter((outcome) => outcome.status === "accepted" && outcome.ownerPubkey !== null)
    .map((outcome) => ({
      txid: outcome.txid,
      ownerPubkey: outcome.ownerPubkey as string,
      amountSats: outcome.amountSats
    }));
  if (acceptedBids.length === 0) {
    throw new ProofExportError(`no accepted bids in the auction for "${record.name}" — cannot assemble an L1 auction proof`);
  }

  // The winning bid's bond becomes the name bond, so the name's current bond
  // txid is the winning bid txid.
  const winningBid = acceptedBids.find((bid) => bid.txid === record.currentBondTxid);
  if (winningBid === undefined) {
    throw new ProofExportError(
      `the name's bond txid ${record.currentBondTxid} is not among the auction's accepted bids — cannot identify the winner`
    );
  }

  const bundle: Record<string, unknown> = {
    format: "ont-proof-bundle",
    bundleVersion: 0,
    proofSource: "bitcoin_l1_direct_auction",
    name: record.name,
    normalizedName: normalizeName(record.name),
    assuranceTier: input.assuranceTier ?? "bitcoin_l1_auction",
    verificationGoal:
      input.verificationGoal ??
      "Prove current ownership of the name via its winning Bitcoin L1 auction bid and the resulting name bond.",
    ownershipProof: {
      currentOwnerPubkey: record.currentOwnerPubkey,
      ownershipRef: record.lastStateTxid
    },
    auctionTranscript: {
      transcriptSource: "bitcoin_l1_bid_transactions",
      acceptedBids,
      winner: {
        winningTxid: winningBid.txid,
        winnerOwnerPubkey: winningBid.ownerPubkey,
        winningAmountSats: winningBid.amountSats
      }
    },
    settlementProof: {
      kind: "winner_bid_bond_becomes_name_bond",
      requiredBondSats: record.requiredBondSats,
      currentBondOutpoint: {
        txid: record.currentBondTxid,
        vout: record.currentBondVout,
        valueSats: record.currentBondValueSats
      }
    }
  };

  // Include the value-record chain when present — proves the destination history.
  const valueRecords = input.valueHistory?.records ?? [];
  if (valueRecords.length > 0) {
    bundle.valueRecordChain = {
      records: [...valueRecords]
        .sort((a, b) => a.sequence - b.sequence)
        .map((r) => ({
          sequence: r.sequence,
          recordHash: r.recordHash,
          previousRecordHash: r.previousRecordHash,
          ownerPubkey: r.ownerPubkey,
          ownershipRef: r.ownershipRef
        }))
    };
  }

  return bundle;
}
