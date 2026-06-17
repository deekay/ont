// B5-WALLET — auction-bid PSBT artifact builder (unparked by wire-codec-consolidation @ 676a545; CL RED-OK
// event under 1781673470). The wallet builds + signs the on-chain AuctionBid tx (event 0x07) end-to-end: it
// CONSUMES the AuctionBid carrier fields (the W17 auction-bid package via @ont/protocol createAuctionBidPackage
// — the wallet re-derives NO auction rule) and OWNS only Bitcoin tx construction + signing. The carrier is
// encoded by @ont/wire encodeEvent at W16 full-width 32-byte commitments (the consolidation made @ont/wire the
// sole codec). AuctionBid carries NO ONT-layer signature (unlike Transfer/RecoverOwner) — bid authority is the
// bond UTXO key-path spend + the commitments. Bond = P2TR(owner x-only) key-path. Total + fail-closed.
//
// Internal-consistency gate (NOT auction-rule re-derivation): the on-chain bond output must be at least the
// carrier's committed bid amount (over-bonding allowed; DECISIONS #68 / PR-21 supersedes the older exact-equality
// reading). Under-bonding fails closed before tx construction.
import { Psbt, payments, address as bjsAddress } from "bitcoinjs-lib";
import { encodeEvent, bytesToHex, hexToBytes, EventType, AUCTION_BID_FLAG_INCLUDES_NAME } from "@ont/wire";
import { networkOf, parseSats, ownerXOnly, keyPathSigner } from "./tx-common.js";
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
  | "under-bonded"
  | "insufficient-funds"
  | "change-without-address"
  | "invalid-input";

export type BuildAuctionBidResult =
  | { readonly ok: true; readonly artifact: SignedAuctionBidArtifact }
  | { readonly ok: false; readonly reason: AuctionBidBuildReason };

/**
 * Build + sign the auction-bid Bitcoin tx (key-internal builder; reached only via the signer closure). Validate
 * bondVout ∈ {0,1}; require AUCTION_BID_FLAG_INCLUDES_NAME; amounts ≥ 0; bond ≥ committed bid (over-bond ok,
 * under-bond → under-bonded); change = fundingValue − bond − fee (< 0 → insufficient-funds; > 0 with no
 * changeAddress → change-without-address). Encode the AuctionBid carrier (0x07) via @ont/wire encodeEvent at
 * 32-byte commitments → OP_RETURN; order outputs by bondVout (bidder P2TR bond + carrier, + change); spend the
 * funding input via BIP-341 key-path (owner x-only, SIGHASH_DEFAULT); finalize; extract. The returned artifact
 * carries no key/seed. Total; never throws (unexpected failure → invalid-input).
 */
export function buildAndSignAuctionBidArtifact(
  ownerPrivateKeyHex: string,
  input: AuctionBidArtifactInput
): BuildAuctionBidResult {
  try {
    if (!Number.isInteger(input.bondVout) || (input.bondVout !== 0 && input.bondVout !== 1)) {
      return { ok: false, reason: "invalid-bond-vout" };
    }
    if ((input.flags & AUCTION_BID_FLAG_INCLUDES_NAME) === 0) return { ok: false, reason: "missing-name-flag" };

    const bidAmountSats = parseSats(input.bidAmountSats);
    const bondSats = parseSats(input.bondSats);
    const feeSats = parseSats(input.feeSats);
    const fundingValue = parseSats(input.fundingInput.valueSats);
    if (bidAmountSats === null || bondSats === null || feeSats === null || fundingValue === null) {
      return { ok: false, reason: "invalid-input" };
    }
    if (bidAmountSats < 0n || bondSats < 0n || feeSats < 0n || fundingValue < 0n) {
      return { ok: false, reason: "negative-amount" };
    }
    // Internal consistency (not an auction-rule re-derivation): the on-chain bond must cover the committed bid;
    // over-bonding is allowed (DECISIONS #68 / PR-21).
    if (bondSats < bidAmountSats) return { ok: false, reason: "under-bonded" };

    const changeValue = fundingValue - bondSats - feeSats;
    if (changeValue < 0n) return { ok: false, reason: "insufficient-funds" };
    const changeAddress = input.changeAddress ?? null;
    if (changeValue > 0n && changeAddress === null) return { ok: false, reason: "change-without-address" };

    const network = networkOf(input.network);
    const ownerXOnlyKey = ownerXOnly(ownerPrivateKeyHex);

    // Consume the carrier fields → encode the AuctionBid event (0x07) via @ont/wire (no re-derivation). The
    // owner key signs only the Bitcoin spend below; AuctionBid has no ONT-layer signature.
    const auctionBidPayload = encodeEvent({
      type: EventType.AuctionBid,
      flags: input.flags,
      bondVout: input.bondVout,
      settlementLockBlocks: input.settlementLockBlocks,
      bidAmountSats,
      ownerPubkey: input.ownerPubkey,
      auctionLotCommitment: input.auctionLotCommitment,
      auctionStateCommitment: input.auctionStateCommitment,
      bidderCommitment: input.bidderCommitment,
      unlockBlock: input.unlockBlock,
      name: input.name,
    });

    const bondScript = bjsAddress.toOutputScript(input.bondAddress, network);
    const carrier = payments.embed({ data: [auctionBidPayload] }).output;
    if (!carrier) throw new Error("could not build OP_RETURN carrier");

    type PlannedOutput = { role: SignedAuctionBidArtifactOutput["role"]; value: bigint; script: Uint8Array };
    const bondOutput: PlannedOutput = { role: "bidder_bond", value: bondSats, script: bondScript };
    const carrierOutput: PlannedOutput = { role: "ont_auction_bid", value: 0n, script: carrier };
    const outputs: PlannedOutput[] =
      input.bondVout === 0 ? [bondOutput, carrierOutput] : [carrierOutput, bondOutput];
    if (changeValue > 0n && changeAddress !== null) {
      outputs.push({ role: "change", value: changeValue, script: bjsAddress.toOutputScript(changeAddress, network) });
    }

    const psbt = new Psbt({ network });
    psbt.setVersion(2);
    psbt.addInput({
      hash: input.fundingInput.txid,
      index: input.fundingInput.vout,
      witnessUtxo: { script: hexToBytes(input.fundingInput.scriptPubKeyHex), value: fundingValue },
      tapInternalKey: ownerXOnlyKey,
    });
    for (const out of outputs) psbt.addOutput({ script: out.script, value: out.value });

    psbt.signInput(0, keyPathSigner(ownerPrivateKeyHex));
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();

    return {
      ok: true,
      artifact: {
        signedTransactionHex: tx.toHex(),
        signedTransactionId: tx.getId(),
        auctionBidEventHex: bytesToHex(auctionBidPayload),
        feeSats: feeSats.toString(),
        changeValueSats: changeValue.toString(),
        outputs: outputs.map((out, vout) => ({
          vout,
          role: out.role,
          valueSats: out.value.toString(),
          scriptHex: bytesToHex(out.script),
        })),
      },
    };
  } catch {
    return { ok: false, reason: "invalid-input" };
  }
}
