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
import type { ImmatureSaleTransferInput } from "./sale-transfer-artifacts.js";

// B5-WALLET cooperative immature-sale red battery (CL design-concur event afa43fd1). Seller (owner 0) spends the
// current bond + signs the ONT transfer auth → partial PSBT; buyer (owner 1) co-signs buyer inputs + finalizes.
// Both sign only their own inputs (SIGHASH_DEFAULT binds all outputs → atomic); neither sees the other's key.

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const OWNER0_PUBKEY = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba"; // seller (current owner)
const OWNER1_PRIVATE = "17113ae7ecf53be6b1600dcf8a363adede705d104ed4a2ebc46cd0eabccfb0ca";
const OWNER1_PUBKEY = "5b864fc13ed497d041f24868ae5a7ddf481724b146bda10bdd5c08ee1a18c026"; // buyer (new owner)
const BOND_VALUE = 50000n;
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

/** Hermetic immature sale: seller bond 50000 (P2TR owner0) + buyer 200000 (P2TR owner1); successor bond 50000,
 *  sale price 100000, fee 1000 → buyer change 49000; seller payout = bond 50000 + sale price 100000 = 150000. */
function saleInput(): { input: ImmatureSaleTransferInput; bondScript: Uint8Array; buyerScript: Uint8Array } {
  const bond = p2tr(OWNER0_PUBKEY);
  const buyerUtxo = p2tr(OWNER1_PUBKEY);
  const successorBond = p2tr(OWNER1_PUBKEY);
  const sellerPayout = p2tr(OWNER0_PUBKEY);
  const input: ImmatureSaleTransferInput = {
    prevStateTxid: "11".repeat(32),
    newOwnerPubkey: OWNER1_PUBKEY,
    flags: 0,
    successorBondVout: 0,
    currentBondInput: { txid: "22".repeat(32), vout: 0, valueSats: BOND_VALUE.toString(), scriptPubKeyHex: bytesToHex(bond.script) },
    successorBondAddress: successorBond.address,
    successorBondSats: "50000",
    buyerInputs: [
      { txid: "33".repeat(32), vout: 1, valueSats: BUYER_VALUE.toString(), scriptPubKeyHex: bytesToHex(buyerUtxo.script) },
    ],
    sellerPayoutAddress: sellerPayout.address,
    salePriceSats: "100000",
    buyerChangeAddress: p2tr(OWNER1_PUBKEY).address,
    feeSats: "1000",
    network: "mainnet",
  };
  return { input, bondScript: bond.script, buyerScript: buyerUtxo.script };
}

describe("immature-sale — seller builds a partial PSBT", () => {
  it("signs the seller bond input only, leaving buyer inputs unsigned", () => {
    const { input } = saleInput();
    const built = seller().buildImmatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const psbt = Psbt.fromBase64(built.artifact.partialPsbtBase64);
    expect(psbt.inputCount).toBe(2);
    expect(built.artifact.signedInputCount).toBe(1);
    expect(psbt.data.inputs[0]?.tapKeySig).toBeDefined(); // bond input signed by seller
    expect(psbt.data.inputs[1]?.tapKeySig).toBeUndefined(); // buyer input still open
  });
});

describe("immature-sale — buyer co-signs and finalizes", () => {
  it("finalizes into a tx with the expected shape (2 inputs, 4 outputs)", () => {
    const { input } = saleInput();
    const built = seller().buildImmatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const done = buyer().coSignSaleTransfer(built.artifact.partialPsbtBase64);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.artifact.finalized).toBe(true);
    expect(done.artifact.signedTransactionHex).toBeDefined();
    const tx = Transaction.fromHex(done.artifact.signedTransactionHex ?? "");
    expect(tx.ins.length).toBe(2);
    expect(tx.outs.length).toBe(4); // successor bond, carrier, seller payment, buyer change
  });
});

describe("immature-sale — carrier + ONT auth", () => {
  it("embeds exactly one Transfer carrier whose ONT auth verifies against the SELLER key", () => {
    const { input } = saleInput();
    const built = seller().buildImmatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const ev = decodeEvent(hexToBytes(built.artifact.transferEventHex));
    expect(ev.type).toBe(EventType.Transfer);
    if (ev.type !== EventType.Transfer) return;
    expect(ev.newOwnerPubkey).toBe(OWNER1_PUBKEY);
    const digest = transferAuthDigest({
      prevStateTxid: ev.prevStateTxid,
      newOwnerPubkey: ev.newOwnerPubkey,
      flags: ev.flags,
      successorBondVout: ev.successorBondVout,
    });
    expect(verifySchnorr(ev.signature, digest, OWNER0_PUBKEY)).toBe(true);
    const done = buyer().coSignSaleTransfer(built.artifact.partialPsbtBase64);
    if (!done.ok || !done.artifact.signedTransactionHex) return;
    const tx = Transaction.fromHex(done.artifact.signedTransactionHex);
    expect(tx.outs.filter((o) => o.script[0] === 0x6a).length).toBe(1);
  });
});

describe("immature-sale — every input verifies against the real full-tx BIP-341 sighash", () => {
  it("seller bond input verifies vs owner 0, buyer input vs owner 1", () => {
    const { input, bondScript, buyerScript } = saleInput();
    const built = seller().buildImmatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const done = buyer().coSignSaleTransfer(built.artifact.partialPsbtBase64);
    expect(done.ok).toBe(true);
    if (!done.ok || !done.artifact.signedTransactionHex) return;
    const tx = Transaction.fromHex(done.artifact.signedTransactionHex);
    const prevScripts = [bondScript, buyerScript];
    const prevValues = [BOND_VALUE, BUYER_VALUE];
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

describe("immature-sale — neither side's key crosses the boundary", () => {
  it("no private key / mnemonic in the seller or buyer artifacts", () => {
    const { input } = saleInput();
    const built = seller().buildImmatureSaleTransfer(input);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const sellerDump = JSON.stringify(built.artifact);
    for (const secret of [OWNER0_PRIVATE, OWNER1_PRIVATE, MNEMONIC]) expect(sellerDump).not.toContain(secret);
    const done = buyer().coSignSaleTransfer(built.artifact.partialPsbtBase64);
    if (!done.ok) return;
    const buyerDump = JSON.stringify(done.artifact);
    for (const secret of [OWNER0_PRIVATE, OWNER1_PRIVATE, MNEMONIC]) expect(buyerDump).not.toContain(secret);
  });
});

describe("immature-sale — deterministic", () => {
  it("fixed inputs → identical partial PSBT", () => {
    const { input } = saleInput();
    const a = seller().buildImmatureSaleTransfer(input);
    const b = seller().buildImmatureSaleTransfer(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.artifact.partialPsbtBase64).toBe(b.artifact.partialPsbtBase64);
  });
});

describe("immature-sale — fail-closed", () => {
  it("rejects bad vout, no buyer inputs, and insufficient buyer funds", () => {
    const { input } = saleInput();
    const badVout = seller().buildImmatureSaleTransfer({ ...input, successorBondVout: 2 });
    expect(badVout.ok).toBe(false);
    if (!badVout.ok) expect(badVout.reason).toBe("invalid-successor-bond-vout");
    const noBuyer = seller().buildImmatureSaleTransfer({ ...input, buyerInputs: [] });
    expect(noBuyer.ok).toBe(false);
    if (!noBuyer.ok) expect(noBuyer.reason).toBe("no-buyer-inputs");
    const broke = seller().buildImmatureSaleTransfer({ ...input, salePriceSats: "10000000" });
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe("insufficient-buyer-funds");
  });
  it("co-sign rejects a malformed PSBT", () => {
    const r = buyer().coSignSaleTransfer("not-a-valid-psbt");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("malformed-psbt");
  });
});

describe("immature-sale — ownership + per-field negativity hardening", () => {
  it("rejects a declared seller input whose script is not the seller's P2TR (script-based ownership)", () => {
    const { input } = saleInput();
    const notSeller = p2tr(OWNER1_PUBKEY); // buyer's P2TR, not the seller's — the seller cannot own/sign it
    const r = seller().buildImmatureSaleTransfer({
      ...input,
      currentBondInput: { ...input.currentBondInput, scriptPubKeyHex: bytesToHex(notSeller.script) },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid-input");
  });
  it("rejects a mixed-sign input set even when the aggregate stays positive (per-field negativity)", () => {
    const { input } = saleInput();
    const buyerUtxo = p2tr(OWNER1_PUBKEY);
    const r = seller().buildImmatureSaleTransfer({
      ...input,
      buyerInputs: [
        { txid: "44".repeat(32), vout: 0, valueSats: "300000", scriptPubKeyHex: bytesToHex(buyerUtxo.script) },
        { txid: "55".repeat(32), vout: 1, valueSats: "-100000", scriptPubKeyHex: bytesToHex(buyerUtxo.script) },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("negative-amount");
  });
});
