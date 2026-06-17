// B5-WALLET — cooperative immature-sale transfer (pre-maturity sale; CL design-concur event afa43fd1).
// The first true two-Bitcoin-signer flow: the SELLER spends the current bond + signs the ONT transfer auth;
// the BUYER funds the successor bond + sale price + fee and finalizes. Both parties sign only their OWN inputs
// via a partial BIP-174 PSBT handoff — neither side ever sees the other's private key. The seller's bond-input
// signature is SIGHASH_DEFAULT (BIP-341 default = commits to ALL outputs), so it atomically binds the seller's
// consent to the exact payout/successor-bond/change set (CL Q1: this is what makes the sale safe — a bare ONT
// auth signature would not, since transferAuthDigest binds only prevStateTxid/newOwnerPubkey/flags/vout).
// Mature-sale is parked behind a separate design (CL afa43fd1). Bond = P2TR(owner x-only) key-path. The wallet
// is the one crypto-exempt surface; CLI/claim consume the base64 PSBT artifact + a narrow port, never bitcoinjs.
import { Psbt, payments, address as bjsAddress } from "bitcoinjs-lib";
import { encodeEvent, transferAuthDigest, bytesToHex, hexToBytes, EventType } from "@ont/wire";
import {
  networkOf,
  parseSats,
  ownerXOnly,
  ownerP2trScript,
  signOwnerSchnorr,
  keyPathSigner,
  type TransferNetwork,
} from "./tx-common.js";
import type { TransferFundingInput } from "./transfer-artifacts.js";

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
  | "no-seller-binding-inputs"
  | "insufficient-buyer-funds"
  | "change-without-address"
  | "invalid-input";

/** mature-sale (post-maturity): no bond continuity. successorBondVout is the canon-ignored "dead byte" (#4/#27,
 *  X8) — the wallet forces it to this sentinel so the carrier explicitly signals "no successor bond". */
export const MATURE_SUCCESSOR_BOND_VOUT = 0xff;

/** A mature (post-maturity) cooperative sale: no bond continuity, no successor bond. The seller has no bond to
 *  spend, so it must contribute ≥1 validated seller-owned P2TR binding input signed at SIGHASH_DEFAULT — that
 *  signature (not the ONT auth, which doesn't bind payment/tx) is what binds the seller's consent to the exact
 *  outputs (CL Q1 bearer-auth defense). The buyer funds the sale price + fee and co-signs/finalizes. */
export interface MatureSaleTransferInput {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string; // buyer x-only
  readonly flags: number;
  readonly sellerInputs: readonly SaleFundingInput[]; // ≥1 validated seller-owned binding inputs
  readonly buyerInputs: readonly SaleFundingInput[];
  readonly sellerPayoutAddress: string; // receives ΣsellerInputs + salePrice (combined; no separate seller_change)
  readonly salePriceSats: string;
  readonly buyerChangeAddress?: string;
  readonly feeSats: string;
  readonly network: TransferNetwork;
}

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
  try {
    if (
      !Number.isInteger(input.successorBondVout) ||
      (input.successorBondVout !== 0 && input.successorBondVout !== 1)
    ) {
      return { ok: false, reason: "invalid-successor-bond-vout" };
    }
    if (input.buyerInputs.length === 0) return { ok: false, reason: "no-buyer-inputs" };

    const sellerInputs = [input.currentBondInput, ...(input.additionalSellerInputs ?? [])];
    const successorBondSats = parseSats(input.successorBondSats);
    const salePriceSats = parseSats(input.salePriceSats);
    const feeSats = parseSats(input.feeSats);
    if (successorBondSats === null || salePriceSats === null || feeSats === null) {
      return { ok: false, reason: "invalid-input" };
    }
    if (successorBondSats < 0n || salePriceSats < 0n || feeSats < 0n) return { ok: false, reason: "negative-amount" };

    const sellerValues = sellerInputs.map((i) => parseSats(i.valueSats));
    const buyerValues = input.buyerInputs.map((i) => parseSats(i.valueSats));
    if ([...sellerValues, ...buyerValues].some((v) => v === null)) return { ok: false, reason: "invalid-input" };
    // Per-field negativity: reject any negative input value individually — an aggregate-only check lets a
    // negative UTXO value be masked by a larger positive one.
    if ([...sellerValues, ...buyerValues].some((v) => (v ?? 0n) < 0n)) return { ok: false, reason: "negative-amount" };
    const totalSeller = sellerValues.reduce<bigint>((a, v) => a + (v ?? 0n), 0n);
    const totalBuyer = buyerValues.reduce<bigint>((a, v) => a + (v ?? 0n), 0n);

    const buyerChange = totalBuyer - successorBondSats - salePriceSats - feeSats;
    if (buyerChange < 0n) return { ok: false, reason: "insufficient-buyer-funds" };
    const buyerChangeAddress = input.buyerChangeAddress ?? null;
    if (buyerChange > 0n && buyerChangeAddress === null) return { ok: false, reason: "change-without-address" };
    const sellerPayout = totalSeller + salePriceSats;

    const network = networkOf(input.network);
    const sellerXOnly = ownerXOnly(ownerPrivateKeyHex);
    // Script-based ownership: every declared seller input must pay to THIS wallet's P2TR (the seller can only
    // sign its own inputs). Declaration alone is not trusted — fail closed on any non-seller-owned seller input.
    const sellerScriptHex = bytesToHex(ownerP2trScript(ownerPrivateKeyHex));
    if (sellerInputs.some((i) => i.scriptPubKeyHex.toLowerCase() !== sellerScriptHex)) {
      return { ok: false, reason: "invalid-input" };
    }

    // ONT-layer authorization: the seller (current owner) signs the transfer auth digest (deterministic).
    const authDigest = transferAuthDigest({
      prevStateTxid: input.prevStateTxid,
      newOwnerPubkey: input.newOwnerPubkey,
      flags: input.flags,
      successorBondVout: input.successorBondVout,
    });
    const ontSignature = bytesToHex(signOwnerSchnorr(authDigest, ownerPrivateKeyHex));
    const transferPayload = encodeEvent({
      type: EventType.Transfer,
      prevStateTxid: input.prevStateTxid,
      newOwnerPubkey: input.newOwnerPubkey,
      flags: input.flags,
      successorBondVout: input.successorBondVout,
      signature: ontSignature,
    });

    const carrier = payments.embed({ data: [transferPayload] }).output;
    if (!carrier) throw new Error("could not build OP_RETURN carrier");
    const successorBondScript = bjsAddress.toOutputScript(input.successorBondAddress, network);
    const sellerPayoutScript = bjsAddress.toOutputScript(input.sellerPayoutAddress, network);

    type PlannedOutput = { role: SaleOutput["role"]; value: bigint; script: Uint8Array };
    const bondOut: PlannedOutput = { role: "successor_bond", value: successorBondSats, script: successorBondScript };
    const carrierOut: PlannedOutput = { role: "ont_transfer", value: 0n, script: carrier };
    const outputs: PlannedOutput[] = input.successorBondVout === 0 ? [bondOut, carrierOut] : [carrierOut, bondOut];
    outputs.push({ role: "seller_payment", value: sellerPayout, script: sellerPayoutScript });
    if (buyerChange > 0n && buyerChangeAddress !== null) {
      outputs.push({ role: "buyer_change", value: buyerChange, script: bjsAddress.toOutputScript(buyerChangeAddress, network) });
    }

    const psbt = new Psbt({ network });
    psbt.setVersion(2); // transaction nVersion = 2 (NOT a BIP-370 PSBTv2 contract)
    // seller inputs carry tapInternalKey (seller's) → signable here; buyer inputs carry witnessUtxo only → the
    // buyer sets its own tapInternalKey + signs in coSignSaleTransfer (the seller never has the buyer's key).
    for (const inp of sellerInputs) {
      psbt.addInput({
        hash: inp.txid,
        index: inp.vout,
        witnessUtxo: { script: hexToBytes(inp.scriptPubKeyHex), value: parseSats(inp.valueSats) ?? 0n },
        tapInternalKey: sellerXOnly,
      });
    }
    for (const inp of input.buyerInputs) {
      psbt.addInput({
        hash: inp.txid,
        index: inp.vout,
        witnessUtxo: { script: hexToBytes(inp.scriptPubKeyHex), value: parseSats(inp.valueSats) ?? 0n },
      });
    }
    for (const out of outputs) psbt.addOutput({ script: out.script, value: out.value });

    // Sign ONLY the seller-owned inputs (indices 0..sellerInputs.length-1) at SIGHASH_DEFAULT (binds all outputs).
    const sellerSigner = keyPathSigner(ownerPrivateKeyHex);
    for (let i = 0; i < sellerInputs.length; i += 1) psbt.signInput(i, sellerSigner);

    return {
      ok: true,
      artifact: {
        partialPsbtBase64: psbt.toBase64(),
        transferEventHex: bytesToHex(transferPayload),
        signedInputCount: sellerInputs.length,
        feeSats: feeSats.toString(),
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

/**
 * RED stub (mature-sale, seller role; key-internal). Green: ≥1 sellerInputs else no-seller-binding-inputs;
 * validate amounts (per-field negativity) + script-ownership of every seller input; buyerChange = Σbuyer −
 * salePrice − fee (<0 → insufficient-buyer-funds; >0 w/o address → change-without-address). Seller signs
 * transferAuthDigest with successorBondVout = 0xff (mature sentinel, canon-ignored) → carrier (0x03). Outputs:
 * carrier + seller_payment (Σseller + salePrice) + buyer_change (if any) — NO successor bond. PSBT: seller
 * inputs get tapInternalKey + are signed at SIGHASH_DEFAULT (binds all outputs); buyer inputs witnessUtxo only.
 * Returns the partial BIP-174 PSBT; signs ONLY seller inputs. Never exposes the key. Total; never throws.
 */
export function buildMatureSaleTransferArtifact(
  ownerPrivateKeyHex: string,
  input: MatureSaleTransferInput
): BuildSaleResult {
  try {
    const sellerInputs = input.sellerInputs;
    if (sellerInputs.length === 0) return { ok: false, reason: "no-seller-binding-inputs" };
    if (input.buyerInputs.length === 0) return { ok: false, reason: "no-buyer-inputs" };

    const salePriceSats = parseSats(input.salePriceSats);
    const feeSats = parseSats(input.feeSats);
    if (salePriceSats === null || feeSats === null) return { ok: false, reason: "invalid-input" };
    if (salePriceSats < 0n || feeSats < 0n) return { ok: false, reason: "negative-amount" };

    const sellerValues = sellerInputs.map((i) => parseSats(i.valueSats));
    const buyerValues = input.buyerInputs.map((i) => parseSats(i.valueSats));
    if ([...sellerValues, ...buyerValues].some((v) => v === null)) return { ok: false, reason: "invalid-input" };
    if ([...sellerValues, ...buyerValues].some((v) => (v ?? 0n) < 0n)) return { ok: false, reason: "negative-amount" };
    const totalSeller = sellerValues.reduce<bigint>((a, v) => a + (v ?? 0n), 0n);
    const totalBuyer = buyerValues.reduce<bigint>((a, v) => a + (v ?? 0n), 0n);

    const buyerChange = totalBuyer - salePriceSats - feeSats;
    if (buyerChange < 0n) return { ok: false, reason: "insufficient-buyer-funds" };
    const buyerChangeAddress = input.buyerChangeAddress ?? null;
    if (buyerChange > 0n && buyerChangeAddress === null) return { ok: false, reason: "change-without-address" };
    const sellerPayout = totalSeller + salePriceSats;

    const network = networkOf(input.network);
    const sellerXOnly = ownerXOnly(ownerPrivateKeyHex);
    // Script-based ownership: every seller binding input must pay to THIS wallet's P2TR before signing.
    const sellerScriptHex = bytesToHex(ownerP2trScript(ownerPrivateKeyHex));
    if (sellerInputs.some((i) => i.scriptPubKeyHex.toLowerCase() !== sellerScriptHex)) {
      return { ok: false, reason: "invalid-input" };
    }

    // ONT-layer authorization with the mature sentinel (successorBondVout = 0xff, canon-ignored dead byte).
    const authDigest = transferAuthDigest({
      prevStateTxid: input.prevStateTxid,
      newOwnerPubkey: input.newOwnerPubkey,
      flags: input.flags,
      successorBondVout: MATURE_SUCCESSOR_BOND_VOUT,
    });
    const ontSignature = bytesToHex(signOwnerSchnorr(authDigest, ownerPrivateKeyHex));
    const transferPayload = encodeEvent({
      type: EventType.Transfer,
      prevStateTxid: input.prevStateTxid,
      newOwnerPubkey: input.newOwnerPubkey,
      flags: input.flags,
      successorBondVout: MATURE_SUCCESSOR_BOND_VOUT,
      signature: ontSignature,
    });

    const carrier = payments.embed({ data: [transferPayload] }).output;
    if (!carrier) throw new Error("could not build OP_RETURN carrier");
    const sellerPayoutScript = bjsAddress.toOutputScript(input.sellerPayoutAddress, network);

    type PlannedOutput = { role: SaleOutput["role"]; value: bigint; script: Uint8Array };
    // No successor bond on the mature path: carrier + combined seller_payment (+ buyer_change if any).
    const outputs: PlannedOutput[] = [
      { role: "ont_transfer", value: 0n, script: carrier },
      { role: "seller_payment", value: sellerPayout, script: sellerPayoutScript },
    ];
    if (buyerChange > 0n && buyerChangeAddress !== null) {
      outputs.push({ role: "buyer_change", value: buyerChange, script: bjsAddress.toOutputScript(buyerChangeAddress, network) });
    }

    const psbt = new Psbt({ network });
    psbt.setVersion(2); // transaction nVersion = 2 (NOT a BIP-370 PSBTv2 contract)
    for (const inp of sellerInputs) {
      psbt.addInput({
        hash: inp.txid,
        index: inp.vout,
        witnessUtxo: { script: hexToBytes(inp.scriptPubKeyHex), value: parseSats(inp.valueSats) ?? 0n },
        tapInternalKey: sellerXOnly,
      });
    }
    for (const inp of input.buyerInputs) {
      psbt.addInput({
        hash: inp.txid,
        index: inp.vout,
        witnessUtxo: { script: hexToBytes(inp.scriptPubKeyHex), value: parseSats(inp.valueSats) ?? 0n },
      });
    }
    for (const out of outputs) psbt.addOutput({ script: out.script, value: out.value });

    // Sign ONLY the seller binding inputs (indices 0..sellerInputs.length-1) at SIGHASH_DEFAULT (binds outputs).
    const sellerSigner = keyPathSigner(ownerPrivateKeyHex);
    for (let i = 0; i < sellerInputs.length; i += 1) psbt.signInput(i, sellerSigner);

    return {
      ok: true,
      artifact: {
        partialPsbtBase64: psbt.toBase64(),
        transferEventHex: bytesToHex(transferPayload),
        signedInputCount: sellerInputs.length,
        feeSats: feeSats.toString(),
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

/**
 * Buyer/co-signer role (key-internal). Parses the BIP-174 PSBT; signs every input that pays to THIS wallet's
 * owner key (taproot key-path, SIGHASH_DEFAULT) and no others; if all inputs are then signed, finalize +
 * extract → signedTransactionHex; else returns the updated partial PSBT. Never exposes the key. Total.
 */
export function coSignSaleTransferArtifact(
  ownerPrivateKeyHex: string,
  partialPsbtBase64: string
): CoSignSaleResult {
  let psbt;
  try {
    psbt = Psbt.fromBase64(partialPsbtBase64);
  } catch {
    return { ok: false, reason: "malformed-psbt" };
  }
  try {
    const myScriptHex = bytesToHex(ownerP2trScript(ownerPrivateKeyHex));
    const myXOnly = ownerXOnly(ownerPrivateKeyHex);
    const signer = keyPathSigner(ownerPrivateKeyHex);
    let signedThisPass = 0;
    for (let i = 0; i < psbt.inputCount; i += 1) {
      const inp = psbt.data.inputs[i];
      const script = inp?.witnessUtxo?.script;
      if (!script || bytesToHex(script) !== myScriptHex) continue; // not this wallet's input
      if (inp?.tapKeySig) continue; // already signed
      if (!inp?.tapInternalKey) psbt.updateInput(i, { tapInternalKey: myXOnly });
      psbt.signInput(i, signer);
      signedThisPass += 1;
    }
    if (signedThisPass === 0) return { ok: false, reason: "no-signable-inputs" };

    const allSigned = psbt.data.inputs.every((d) => Boolean(d.tapKeySig) || Boolean(d.finalScriptWitness));
    if (!allSigned) {
      return {
        ok: true,
        artifact: { finalized: false, signedInputCount: signedThisPass, partialPsbtBase64: psbt.toBase64() },
      };
    }
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    return {
      ok: true,
      artifact: {
        finalized: true,
        signedInputCount: signedThisPass,
        signedTransactionHex: tx.toHex(),
        signedTransactionId: tx.getId(),
      },
    };
  } catch {
    return { ok: false, reason: "invalid-input" };
  }
}
