import { describe, expect, it, beforeAll } from "vitest";
import { Transaction, Psbt, payments, networks, initEccLib } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";
import {
  decodeEvent,
  transferAuthDigest,
  verifySchnorr,
  hexToBytes,
  bytesToHex,
  EventType,
} from "@ont/wire";
import { createWalletSigner } from "./wallet-signer.js";
import type { MatureSaleTransferInput } from "./sale-transfer-artifacts.js";

// B5-WALLET cooperative mature-sale red battery (CL design-concur event 8f27425f). No bond continuity (#4/#27):
// the seller has no bond, so it contributes ≥1 validated seller-owned P2TR binding input signed at
// SIGHASH_DEFAULT — that signature (not the ONT auth) binds the deal. successorBondVout = 0xff (dead byte); no
// successor bond output. Combined seller_payment = Σseller + salePrice. Buyer co-signs via coSignSaleTransfer.

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const OWNER0_PUBKEY = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba"; // seller (current owner)
const OWNER1_PRIVATE = "17113ae7ecf53be6b1600dcf8a363adede705d104ed4a2ebc46cd0eabccfb0ca";
const OWNER1_PUBKEY = "5b864fc13ed497d041f24868ae5a7ddf481724b146bda10bdd5c08ee1a18c026"; // buyer (new owner)
const SELLER_VALUE = 50000n;
const BUYER_VALUE = 200000n;

beforeAll(() => {
  initEccLib(tinysecp);
});

function seller() {
  const c = createWalletSigner(MNEMONIC, 0);
  if (!c.ok) throw new Error("seller");
  return c.signer;
}
function buyer() {
  const c = createWalletSigner(MNEMONIC, 1);
  if (!c.ok) throw new Error("buyer");
  return c.signer;
}
function p2tr(xonly: string) {
  const p = payments.p2tr({ internalPubkey: hexToBytes(xonly), network: networks.bitcoin });
  if (!p.output || !p.address) throw new Error("p2tr fixture");
  return { script: p.output, address: p.address };
}

/** Mature sale: seller binding input 50000 (P2TR owner0) + buyer 200000 (P2TR owner1); sale price 100000,
 *  fee 1000 → buyer change 99000 (positive → 3 outputs); seller payout = 50000 + 100000 = 150000. */
function matureInput(): { input: MatureSaleTransferInput; sellerScript: Uint8Array; buyerScript: Uint8Array } {
  const sellerUtxo = p2tr(OWNER0_PUBKEY);
  const buyerUtxo = p2tr(OWNER1_PUBKEY);
  const input: MatureSaleTransferInput = {
    prevStateTxid: "11".repeat(32),
    newOwnerPubkey: OWNER1_PUBKEY,
    flags: 0,
    sellerInputs: [
      { txid: "22".repeat(32), vout: 0, valueSats: SELLER_VALUE.toString(), scriptPubKeyHex: bytesToHex(sellerUtxo.script) },
    ],
    buyerInputs: [
      { txid: "33".repeat(32), vout: 1, valueSats: BUYER_VALUE.toString(), scriptPubKeyHex: bytesToHex(buyerUtxo.script) },
    ],
    sellerPayoutAddress: p2tr(OWNER0_PUBKEY).address,
    salePriceSats: "100000",
    buyerChangeAddress: p2tr(OWNER1_PUBKEY).address,
    feeSats: "1000",
    network: "mainnet",
  };
  return { input, sellerScript: sellerUtxo.script, buyerScript: buyerUtxo.script };
}

describe("mature-sale — seller builds a partial PSBT (binding inputs only)", () => {
  it("signs the seller binding input only, buyer input left open", () => {
    const { input } = matureInput();
    const built = seller().buildMatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const psbt = Psbt.fromBase64(built.artifact.partialPsbtBase64);
    expect(psbt.inputCount).toBe(2);
    expect(built.artifact.signedInputCount).toBe(1);
    expect(psbt.data.inputs[0]?.tapKeySig).toBeDefined();
    expect(psbt.data.inputs[1]?.tapKeySig).toBeUndefined();
  });
});

describe("mature-sale — buyer co-signs/finalizes; no successor bond", () => {
  it("finalizes to a 2-in / 3-out tx with no successor-bond output and successorBondVout === 255", () => {
    const { input } = matureInput();
    const built = seller().buildMatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.artifact.outputs.some((o) => o.role === "successor_bond")).toBe(false);
    const ev = decodeEvent(hexToBytes(built.artifact.transferEventHex));
    expect(ev.type).toBe(EventType.Transfer);
    if (ev.type !== EventType.Transfer) return;
    expect(ev.successorBondVout).toBe(255);
    const digest = transferAuthDigest({
      prevStateTxid: ev.prevStateTxid,
      newOwnerPubkey: ev.newOwnerPubkey,
      flags: ev.flags,
      successorBondVout: ev.successorBondVout,
    });
    expect(verifySchnorr(ev.signature, digest, OWNER0_PUBKEY)).toBe(true);
    const done = buyer().coSignSaleTransfer(built.artifact.partialPsbtBase64);
    expect(done.ok).toBe(true);
    if (!done.ok || !done.artifact.signedTransactionHex) return;
    const tx = Transaction.fromHex(done.artifact.signedTransactionHex);
    expect(tx.ins.length).toBe(2);
    expect(tx.outs.length).toBe(3); // carrier + seller_payment + buyer_change
    expect(tx.outs.filter((o) => o.script[0] === 0x6a).length).toBe(1);
  });
});

describe("mature-sale — economics", () => {
  it("seller_payment = Σseller + salePrice, buyer_change = Σbuyer − salePrice − fee", () => {
    const { input } = matureInput();
    const built = seller().buildMatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const sellerPayment = built.artifact.outputs.find((o) => o.role === "seller_payment");
    const buyerChange = built.artifact.outputs.find((o) => o.role === "buyer_change");
    expect(sellerPayment?.valueSats).toBe("150000");
    expect(buyerChange?.valueSats).toBe("99000");
  });
  it("zero buyer change → 2-output tx (carrier + seller_payment)", () => {
    const { input } = matureInput();
    const built = seller().buildMatureSaleTransfer({ ...input, salePriceSats: "199000" }); // 200000 − 199000 − 1000 = 0
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.artifact.outputs.length).toBe(2);
    expect(built.artifact.outputs.some((o) => o.role === "buyer_change")).toBe(false);
  });
});

describe("mature-sale — every input verifies against the real full-tx BIP-341 sighash", () => {
  it("seller binding input verifies vs owner 0, buyer input vs owner 1", () => {
    const { input, sellerScript, buyerScript } = matureInput();
    const built = seller().buildMatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const done = buyer().coSignSaleTransfer(built.artifact.partialPsbtBase64);
    expect(done.ok).toBe(true);
    if (!done.ok || !done.artifact.signedTransactionHex) return;
    const tx = Transaction.fromHex(done.artifact.signedTransactionHex);
    const prevScripts = [sellerScript, buyerScript];
    const prevValues = [SELLER_VALUE, BUYER_VALUE];
    for (let i = 0; i < 2; i += 1) {
      const sig = tx.ins[i]?.witness[0]?.slice(0, 64);
      expect(sig).toBeDefined();
      if (!sig) continue;
      const sighash = tx.hashForWitnessV1(i, prevScripts, prevValues, Transaction.SIGHASH_DEFAULT);
      const outputKey = prevScripts[i]?.slice(2);
      if (!outputKey) continue;
      expect(verifySchnorr(bytesToHex(sig), sighash, bytesToHex(outputKey))).toBe(true);
    }
  });
});

describe("mature-sale — no key crossing + deterministic", () => {
  it("no private key / mnemonic in either artifact; fixed inputs → identical partial PSBT", () => {
    const { input } = matureInput();
    const a = seller().buildMatureSaleTransfer(input);
    const b = seller().buildMatureSaleTransfer(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.artifact.partialPsbtBase64).toBe(b.artifact.partialPsbtBase64);
    for (const secret of [OWNER0_PRIVATE, OWNER1_PRIVATE, MNEMONIC]) {
      expect(JSON.stringify(a.artifact)).not.toContain(secret);
    }
    const done = buyer().coSignSaleTransfer(a.artifact.partialPsbtBase64);
    if (!done.ok) return;
    for (const secret of [OWNER0_PRIVATE, OWNER1_PRIVATE, MNEMONIC]) {
      expect(JSON.stringify(done.artifact)).not.toContain(secret);
    }
  });
});

describe("mature-sale — fail-closed", () => {
  it("empty sellerInputs → no-seller-binding-inputs (no bare-auth path)", () => {
    const { input } = matureInput();
    const r = seller().buildMatureSaleTransfer({ ...input, sellerInputs: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-seller-binding-inputs");
  });
  it("non-seller seller input → invalid-input; per-field negative → negative-amount; insufficient buyer", () => {
    const { input } = matureInput();
    const notSeller = p2tr(OWNER1_PUBKEY);
    const foreign = seller().buildMatureSaleTransfer({
      ...input,
      sellerInputs: [{ ...input.sellerInputs[0]!, scriptPubKeyHex: bytesToHex(notSeller.script) }],
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.reason).toBe("invalid-input");
    const buyerUtxo = p2tr(OWNER1_PUBKEY);
    const neg = seller().buildMatureSaleTransfer({
      ...input,
      buyerInputs: [
        { txid: "44".repeat(32), vout: 0, valueSats: "300000", scriptPubKeyHex: bytesToHex(buyerUtxo.script) },
        { txid: "55".repeat(32), vout: 1, valueSats: "-100000", scriptPubKeyHex: bytesToHex(buyerUtxo.script) },
      ],
    });
    expect(neg.ok).toBe(false);
    if (!neg.ok) expect(neg.reason).toBe("negative-amount");
    const broke = seller().buildMatureSaleTransfer({ ...input, salePriceSats: "10000000" });
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe("insufficient-buyer-funds");
  });
});
