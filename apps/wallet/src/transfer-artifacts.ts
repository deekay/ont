// B5-WALLET — gift-transfer PSBT artifact builder (first PSBT sub-slice; CL design-concur event d327a78b).
// The wallet is the ONE crypto-exempt surface: all tx construction + signing lives here (bitcoinjs-lib), behind
// the WalletSigner boundary so the owner key never leaves. The builder CONSUMES an explicit transfer artifact
// input (the W17 transfer-package fields are supplied by the caller via @ont/protocol — the wallet re-derives no
// W17 rules); it OWNS only Bitcoin tx construction + signing. The Transfer carrier (event 0x03) is encoded by
// @ont/wire (consume, don't re-derive). Bond = P2TR(owner x-only) key-path spend (WIRE §5 keys are x-only; the
// legacy P2WPKH signer was a prototype shortcut, not carried forward — nothing-is-precious). Total + fail-closed.

export type TransferNetwork = "mainnet" | "testnet" | "signet" | "regtest";

/** The funding bond UTXO being spent. Carries the prevout value + scriptPubKey so the real BIP-341 sighash can
 *  be computed (a txid/vout-only shell cannot sign — CL Q2 pin). */
export interface TransferFundingInput {
  readonly txid: string;
  readonly vout: number;
  readonly valueSats: string; // decimal sats
  readonly scriptPubKeyHex: string; // the P2TR scriptPubKey of the current owner
}

/** The explicit transfer artifact input (W17 transfer-package fields + funding), consumed not re-derived. */
export interface TransferArtifactInput {
  readonly prevStateTxid: string;
  readonly newOwnerPubkey: string; // recipient x-only
  readonly flags: number;
  readonly successorBondVout: number; // 0 | 1 (which output index carries the successor bond)
  readonly successorBondSats: string; // decimal sats
  readonly successorBondAddress: string; // from the W17 package
  readonly currentBondInput: TransferFundingInput;
  readonly feeSats: string; // decimal sats
  readonly changeAddress?: string;
  readonly network: TransferNetwork;
}

export interface SignedTransferArtifactOutput {
  readonly vout: number;
  readonly role: "successor_bond" | "ont_transfer" | "change";
  readonly valueSats: string;
  readonly scriptHex: string;
}

export interface SignedTransferArtifact {
  readonly signedTransactionHex: string;
  readonly signedTransactionId: string;
  readonly transferEventHex: string; // the encoded Transfer carrier (event 0x03), hex
  readonly feeSats: string;
  readonly changeValueSats: string;
  readonly outputs: readonly SignedTransferArtifactOutput[];
}

export type TransferBuildReason =
  | "not-implemented"
  | "invalid-successor-bond-vout"
  | "negative-amount"
  | "insufficient-funds"
  | "change-without-address"
  | "invalid-input";

export type BuildTransferResult =
  | { readonly ok: true; readonly artifact: SignedTransferArtifact }
  | { readonly ok: false; readonly reason: TransferBuildReason };

/** The tx-construction/signing capability the CLI DELEGATE submit commands consume. Distinct from the narrow
 *  WalletSigner (value-record/recovery) so claim stays on its minimal contract; createWalletSigner returns a
 *  signer that satisfies both. The key stays closed over — never an input or an output here. */
export interface WalletTransactionBuilder {
  buildAndSignTransfer(input: TransferArtifactInput): BuildTransferResult;
}

/**
 * RED stub (key-internal builder; not exported from index — reached only via the signer closure).
 * Green recipe: validate successorBondVout ∈ {0,1} else invalid-successor-bond-vout; amounts ≥ 0 else
 * negative-amount; change = inputValue − successorBondSats − feeSats (< 0 → insufficient-funds; > 0 with no
 * changeAddress → change-without-address). ONT-auth signature = schnorr-sign transferAuthDigest({prevStateTxid,
 * newOwnerPubkey, flags, successorBondVout}) with the owner key (deterministic, auxRand=0). Carrier =
 * encodeEvent({type: Transfer, …fields, signature}) → OP_RETURN. Outputs ordered by successorBondVout:
 * successor bond (P2TR addr) + OP_RETURN(carrier) (+ change). Build PSBT v2, input witnessUtxo {script, value}
 * + tapInternalKey = owner x-only; sign the bond input via BIP-341 key-path (tweaked owner key, SIGHASH_DEFAULT,
 * auxRand=0); finalize; extract. Returns the signed-tx artifact — never the key/seed. Total; never throws.
 */
export function buildAndSignTransferArtifact(
  ownerPrivateKeyHex: string,
  input: TransferArtifactInput
): BuildTransferResult {
  void ownerPrivateKeyHex;
  void input;
  return { ok: false, reason: "not-implemented" };
}
