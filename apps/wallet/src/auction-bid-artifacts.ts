// B5-WALLET — auction-bid PSBT artifact builder (unparked by wire-codec-consolidation @ 676a545). The wallet
// builds + signs the on-chain AuctionBid tx (event 0x07) end-to-end: it CONSUMES the AuctionBid carrier fields
// (the W17 auction-bid package via @ont/protocol createAuctionBidPackage — the wallet re-derives NO auction
// rules) and OWNS only Bitcoin tx construction + signing. The carrier is encoded by @ont/wire encodeEvent at
// W16 full-width 32-byte commitments (the consolidation made @ont/wire the sole codec). AuctionBid carries NO
// ONT-layer signature (unlike Transfer/RecoverOwner) — bid authority is the bond UTXO key-path spend + the
// commitments. Bond = P2TR(owner x-only) key-path. Total + fail-closed; never throws.
//
// RED battery slice: this builder is a stub (`not-implemented`) until the reviewed green slice lands; the test
// file pins the contract.
import type { TransferFundingInput, TransferNetwork } from "./transfer-artifacts.js";

export type { TransferNetwork };

/** The funding bond UTXO being spent (prevout value + scriptPubKey so the BIP-341 sighash is real). */
export type AuctionBidFundingInput = TransferFundingInput;

/**
 * Explicit auction-bid artifact input: the AuctionBid carrier fields (supplied by the W17 auction-bid package
 * via @ont/protocol) + funding + the on-chain bidder bond output + fee. The wallet CONSUMES these — it
 * re-derives no auction rule — and owns only the Bitcoin tx construction + signing.
 */
export interface AuctionBidArtifactInput {
  readonly flags: number; // must have AUCTION_BID_FLAG_INCLUDES_NAME (0x01) set
  readonly bondVout: number; // 0 | 1 — which output index carries the bidder bond
  readonly settlementLockBlocks: number;
  readonly bidAmountSats: string; // decimal sats — the committed bid amount (carrier u64)
  readonly ownerPubkey: string; // bidder owner x-only
  readonly auctionLotCommitment: string; // hex32 (W16 full-width)
  readonly auctionStateCommitment: string; // hex32 (W16 full-width)
  readonly bidderCommitment: string; // hex32 (W16 full-width)
  readonly unlockBlock: number;
  readonly name: string; // canonical name
  readonly bondSats: string; // the on-chain bidder bond output value, decimal sats
  readonly bondAddress: string; // P2TR bond address (from the W17 package)
  readonly fundingInput: AuctionBidFundingInput;
  readonly feeSats: string; // decimal sats
  readonly changeAddress?: string;
  readonly network: TransferNetwork;
}

export interface SignedAuctionBidArtifactOutput {
  readonly vout: number;
  readonly role: "bidder_bond" | "ont_auction_bid" | "change";
  readonly valueSats: string;
  readonly scriptHex: string;
}

export interface SignedAuctionBidArtifact {
  readonly signedTransactionHex: string;
  readonly signedTransactionId: string;
  readonly auctionBidEventHex: string; // the encoded AuctionBid carrier (event 0x07), hex
  readonly feeSats: string;
  readonly changeValueSats: string;
  readonly outputs: readonly SignedAuctionBidArtifactOutput[];
}

export type AuctionBidBuildReason =
  | "not-implemented"
  | "invalid-bond-vout"
  | "missing-name-flag"
  | "negative-amount"
  | "insufficient-funds"
  | "change-without-address"
  | "invalid-input";

export type BuildAuctionBidResult =
  | { readonly ok: true; readonly artifact: SignedAuctionBidArtifact }
  | { readonly ok: false; readonly reason: AuctionBidBuildReason };

/**
 * Build + sign the auction-bid Bitcoin tx (key-internal builder; reached only via the signer closure). The
 * green slice will: validate bondVout ∈ {0,1}; require AUCTION_BID_FLAG_INCLUDES_NAME; amounts ≥ 0; change =
 * fundingValue − bond − fee (< 0 → insufficient-funds; > 0 with no changeAddress → change-without-address);
 * encode the AuctionBid carrier (0x07) via @ont/wire encodeEvent at 32-byte commitments → OP_RETURN; order
 * outputs by bondVout (bidder P2TR bond + carrier, + change); spend the funding input via BIP-341 key-path
 * (owner x-only, SIGHASH_DEFAULT); finalize; extract. The artifact carries no key/seed. Never throws.
 */
export function buildAndSignAuctionBidArtifact(
  _ownerPrivateKeyHex: string,
  _input: AuctionBidArtifactInput
): BuildAuctionBidResult {
  return { ok: false, reason: "not-implemented" };
}
