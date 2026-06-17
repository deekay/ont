// B5-WALLET — cooperative immature-sale transfer (pre-maturity sale; CL design-concur event afa43fd1).
// The first true two-Bitcoin-signer flow: the SELLER spends the current bond + signs the ONT transfer auth;
// the BUYER funds the successor bond + sale price + fee and finalizes. Both parties sign only their OWN inputs
// via a partial BIP-174 PSBT handoff — neither side ever sees the other's private key. The seller's bond-input
// signature is SIGHASH_DEFAULT (BIP-341 default = commits to ALL outputs), so it atomically binds the seller's
// consent to the exact payout/successor-bond/change set (CL Q1: this is what makes the sale safe — a bare ONT
// auth signature would not, since transferAuthDigest binds only prevStateTxid/newOwnerPubkey/flags/vout).
// Mature-sale is parked behind a separate design (CL afa43fd1). Bond = P2TR(owner x-only) key-path. The wallet
// is the one crypto-exempt surface; CLI/claim consume the base64 PSBT artifact + a narrow port, never bitcoinjs.
import type { TransferNetwork, TransferFundingInput } from "./transfer-artifacts.js";

/** The seller's current bond + buyer's funding UTXOs each carry value + scriptPubKey (real BIP-341 sighash). */
export type SaleFundingInput = TransferFundingInput;

export interface ImmatureSaleTransferInput {
  // transfer carrier (consumed from the W17 package; the seller is the current owner authorizing the transfer)
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string; // buyer x-only
  readonly flags: number;
  readonly successorBondVout: number; // 0 | 1 (which output index is the successor bond)
  // bond continuity + funding
  readonly currentBondInput: SaleFundingInput; // seller's current bond (P2TR seller) — seller signs
  readonly additionalSellerInputs?: readonly SaleFundingInput[]; // optional extra seller funds — seller signs
  readonly successorBondAddress: string; // buyer's successor P2TR bond (from the package)
  readonly successorBondSats: string;
  readonly buyerInputs: readonly SaleFundingInput[]; // buyer funds (P2TR buyer) — buyer signs
  readonly sellerPayoutAddress: string; // seller is paid here (seller inputs + sale price)
  readonly salePriceSats: string;
  readonly buyerChangeAddress?: string;
  readonly feeSats: string;
  readonly network: TransferNetwork;
}

export interface SaleOutput {
  readonly vout: number;
  readonly role: "successor_bond" | "ont_transfer" | "seller_payment" | "buyer_change";
  readonly valueSats: string;
  readonly scriptHex: string;
}

/** A partially-signed sale tx: the seller's own inputs are signed; the buyer co-signs + finalizes. */
export interface SalePsbtArtifact {
  readonly partialPsbtBase64: string; // BIP-174 (not BIP-370/PSBTv2)
  readonly transferEventHex: string; // the encoded Transfer carrier (0x03)
  readonly signedInputCount: number; // inputs this (seller) wallet signed
  readonly feeSats: string;
  readonly outputs: readonly SaleOutput[];
}

export type SaleBuildReason =
  | "not-implemented"
  | "invalid-successor-bond-vout"
  | "negative-amount"
  | "no-buyer-inputs"
  | "insufficient-buyer-funds"
  | "change-without-address"
  | "invalid-input";

export type BuildSaleResult =
  | { readonly ok: true; readonly artifact: SalePsbtArtifact }
  | { readonly ok: false; readonly reason: SaleBuildReason };

/** The result of a co-sign pass: finalized (all inputs signed → extractable tx) or still partial. */
export interface CoSignedSaleArtifact {
  readonly finalized: boolean;
  readonly signedInputCount: number; // inputs this wallet signed in THIS pass
  readonly partialPsbtBase64?: string; // present when not finalized
  readonly signedTransactionHex?: string; // present when finalized
  readonly signedTransactionId?: string; // present when finalized
}

export type CoSignSaleReason = "not-implemented" | "malformed-psbt" | "no-signable-inputs" | "invalid-input";

export type CoSignSaleResult =
  | { readonly ok: true; readonly artifact: CoSignedSaleArtifact }
  | { readonly ok: false; readonly reason: CoSignSaleReason };

/**
 * RED stub (seller role; key-internal — reached via the signer closure). Green: validate vout ∈ {0,1} + amounts;
 * buyerChange = Σbuyer − successorBond − salePrice − fee (<0 → insufficient-buyer-funds; >0 w/o address →
 * change-without-address); sellerPayout = Σseller + salePrice. Seller signs transferAuthDigest → carrier (0x03)
 * via @ont/wire encodeEvent → OP_RETURN. Outputs: successor bond (P2TR buyer) ordered by successorBondVout +
 * carrier + seller payment + buyer change. Build the PSBT with ALL inputs (witnessUtxo + tapInternalKey) + all
 * outputs; sign only the seller-owned inputs (those paying to the seller's owner key) at SIGHASH_DEFAULT. Return
 * the partial PSBT (base64). Never exposes the key. Total; never throws (→ invalid-input).
 */
export function buildImmatureSaleTransferArtifact(
  ownerPrivateKeyHex: string,
  input: ImmatureSaleTransferInput
): BuildSaleResult {
  void ownerPrivateKeyHex;
  void input;
  return { ok: false, reason: "not-implemented" };
}

/**
 * RED stub (buyer/co-signer role; key-internal). Green: parse the BIP-174 PSBT; sign every input that pays to
 * THIS wallet's owner key (taproot key-path, SIGHASH_DEFAULT) and no others; if all inputs are then signed,
 * finalize + extract → signedTransactionHex; else return the updated partial PSBT. Never exposes the key. Total.
 */
export function coSignSaleTransferArtifact(
  ownerPrivateKeyHex: string,
  partialPsbtBase64: string
): CoSignSaleResult {
  void ownerPrivateKeyHex;
  void partialPsbtBase64;
  return { ok: false, reason: "not-implemented" };
}
