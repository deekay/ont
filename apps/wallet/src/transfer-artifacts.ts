// B5-WALLET — gift-transfer PSBT artifact builder (first PSBT sub-slice; CL design-concur event d327a78b).
// The wallet is the ONE crypto-exempt surface: all tx construction + signing lives here (bitcoinjs-lib), behind
// the WalletSigner boundary so the owner key never leaves. The builder CONSUMES an explicit transfer artifact
// input (the W17 transfer-package fields are supplied by the caller via @ont/protocol — the wallet re-derives no
// W17 rules); it OWNS only Bitcoin tx construction + signing. The Transfer carrier (event 0x03) is encoded by
// @ont/wire (consume, don't re-derive). Bond = P2TR(owner x-only) key-path spend (WIRE §5 keys are x-only; the
// legacy P2WPKH signer was a prototype shortcut, not carried forward — nothing-is-precious). Total + fail-closed.
import {
  Psbt,
  payments,
  networks,
  address as bjsAddress,
  crypto as bcrypto,
  initEccLib,
  type Network,
  type Signer,
} from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";
import { encodeEvent, transferAuthDigest, bytesToHex, hexToBytes, EventType } from "@ont/wire";

initEccLib(tinysecp);

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

const AUX_RAND_ZERO = new Uint8Array(32); // BIP-340 deterministic signing (auxRand = 0)

function networkOf(net: TransferNetwork): Network {
  switch (net) {
    case "mainnet":
      return networks.bitcoin;
    case "regtest":
      return networks.regtest;
    // signet shares testnet address encoding (hrp "tb"); signet is decommissioned regardless
    case "testnet":
    case "signet":
      return networks.testnet;
  }
}

function parseSats(value: string): bigint | null {
  if (!/^-?[0-9]+$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/** A BIP-341 key-path signer over the owner key, tweaked for the (script-tree-less) taproot output, signing
 *  deterministically (auxRand = 0). The owner key stays inside this closure — never returned. */
function keyPathSigner(ownerPrivateKeyHex: string): Signer {
  let priv = hexToBytes(ownerPrivateKeyHex);
  const pub = tinysecp.pointFromScalar(priv, true);
  if (!pub) throw new Error("invalid owner private key");
  if (pub[0] === 0x03) {
    const negated = tinysecp.privateNegate(priv);
    priv = negated;
  }
  const internalXOnly = pub.slice(1, 33);
  const tweak = bcrypto.taggedHash("TapTweak", internalXOnly);
  const tweakedPriv = tinysecp.privateAdd(priv, tweak);
  if (!tweakedPriv) throw new Error("taproot tweak produced an invalid key");
  const tweakedPub = tinysecp.pointFromScalar(tweakedPriv, true);
  if (!tweakedPub) throw new Error("taproot tweak produced an invalid point");
  return {
    publicKey: tweakedPub,
    sign() {
      throw new Error("ECDSA signing is not used for taproot key-path spends");
    },
    signSchnorr(hash: Uint8Array): Uint8Array {
      return tinysecp.signSchnorr(hash, tweakedPriv, AUX_RAND_ZERO);
    },
  };
}

/**
 * Build + sign the gift-transfer Bitcoin tx (key-internal builder; not exported from index — reached only via
 * the signer closure). Validate successorBondVout ∈ {0,1}; amounts ≥ 0; change = inputValue − bond − fee
 * (< 0 → insufficient-funds; > 0 with no changeAddress → change-without-address). The current owner signs the
 * Transfer auth digest (deterministic) → carrier event (0x03) via encodeEvent → OP_RETURN; outputs ordered by
 * successorBondVout (successor P2TR bond + carrier, + change). The spending tx (nVersion 2) spends the bond input (witnessUtxo +
 * tapInternalKey = owner x-only) via BIP-341 key-path (SIGHASH_DEFAULT, auxRand=0); finalize; extract. The
 * returned artifact carries no key/seed. Total; never throws (unexpected failure → invalid-input).
 */
export function buildAndSignTransferArtifact(
  ownerPrivateKeyHex: string,
  input: TransferArtifactInput
): BuildTransferResult {
  try {
    if (!Number.isInteger(input.successorBondVout) || (input.successorBondVout !== 0 && input.successorBondVout !== 1)) {
      return { ok: false, reason: "invalid-successor-bond-vout" };
    }
    const bondSats = parseSats(input.successorBondSats);
    const feeSats = parseSats(input.feeSats);
    const inputValue = parseSats(input.currentBondInput.valueSats);
    if (bondSats === null || feeSats === null || inputValue === null) return { ok: false, reason: "invalid-input" };
    if (bondSats < 0n || feeSats < 0n || inputValue < 0n) return { ok: false, reason: "negative-amount" };

    const changeValue = inputValue - bondSats - feeSats;
    if (changeValue < 0n) return { ok: false, reason: "insufficient-funds" };
    const changeAddress = input.changeAddress ?? null;
    if (changeValue > 0n && changeAddress === null) return { ok: false, reason: "change-without-address" };

    const network = networkOf(input.network);

    // ONT-layer authorization: the current owner signs the transfer auth digest (deterministic).
    const ownerXOnly = (() => {
      const pub = tinysecp.pointFromScalar(hexToBytes(ownerPrivateKeyHex), true);
      if (!pub) throw new Error("invalid owner private key");
      return pub.slice(1, 33);
    })();
    const authDigest = transferAuthDigest({
      prevStateTxid: input.prevStateTxid,
      newOwnerPubkey: input.newOwnerPubkey,
      flags: input.flags,
      successorBondVout: input.successorBondVout,
    });
    const ontSignature = bytesToHex(tinysecp.signSchnorr(authDigest, hexToBytes(ownerPrivateKeyHex), AUX_RAND_ZERO));
    const transferPayload = encodeEvent({
      type: EventType.Transfer,
      prevStateTxid: input.prevStateTxid,
      newOwnerPubkey: input.newOwnerPubkey,
      flags: input.flags,
      successorBondVout: input.successorBondVout,
      signature: ontSignature,
    });

    const bondScript = bjsAddress.toOutputScript(input.successorBondAddress, network);
    const carrier = payments.embed({ data: [transferPayload] }).output;
    if (!carrier) throw new Error("could not build OP_RETURN carrier");

    type PlannedOutput = { role: SignedTransferArtifactOutput["role"]; value: bigint; script: Uint8Array };
    const bondOutput: PlannedOutput = { role: "successor_bond", value: bondSats, script: bondScript };
    const carrierOutput: PlannedOutput = { role: "ont_transfer", value: 0n, script: carrier };
    const outputs: PlannedOutput[] =
      input.successorBondVout === 0 ? [bondOutput, carrierOutput] : [carrierOutput, bondOutput];
    if (changeValue > 0n && changeAddress !== null) {
      outputs.push({ role: "change", value: changeValue, script: bjsAddress.toOutputScript(changeAddress, network) });
    }

    const psbt = new Psbt({ network });
    psbt.setVersion(2); // transaction nVersion = 2 (NOT a BIP-370 PSBTv2 contract; we only export the final signed tx)
    psbt.addInput({
      hash: input.currentBondInput.txid,
      index: input.currentBondInput.vout,
      witnessUtxo: { script: hexToBytes(input.currentBondInput.scriptPubKeyHex), value: inputValue },
      tapInternalKey: ownerXOnly,
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
        transferEventHex: bytesToHex(transferPayload),
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
