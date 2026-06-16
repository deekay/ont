import { describe, expect, it, beforeAll } from "vitest";
import { Transaction, payments, networks, initEccLib } from "bitcoinjs-lib";
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
import type { TransferArtifactInput } from "./transfer-artifacts.js";

// B5-WALLET gift-transfer red battery (CL design-concur event d327a78b). The wallet builds + signs the Bitcoin
// transfer tx end-to-end: P2TR(owner x-only) bond key-path spend, the Transfer carrier (0x03) embedded via
// OP_RETURN, the current owner's ONT-auth signature on it, fail-closed amounts. RED until the builder lands.

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const OWNER0_PUBKEY = "7fb0dc13cea75a622e8ba13d1c3abdeba2258649dd3069f2aa98357777eb2dba"; // current owner (signer)
const OWNER1_PUBKEY = "5b864fc13ed497d041f24868ae5a7ddf481724b146bda10bdd5c08ee1a18c026"; // recipient
const BOND_VALUE_SATS = 100000n;

beforeAll(() => {
  initEccLib(tinysecp);
});

function signer() {
  const c = createWalletSigner(MNEMONIC, 0);
  if (!c.ok) throw new Error("expected a signer");
  return c.signer;
}

/** A hermetic gift-transfer input: the current bond is a real P2TR(owner) UTXO carrying value + scriptPubKey,
 *  so the BIP-341 sighash is real (CL Q2). 100000 in, 99000 successor bond, 1000 fee → no change. */
function buildInput(): { input: TransferArtifactInput; bondScript: Uint8Array } {
  const bond = payments.p2tr({ internalPubkey: hexToBytes(OWNER0_PUBKEY), network: networks.bitcoin });
  const successorBondAddress = payments.p2tr({
    internalPubkey: hexToBytes(OWNER1_PUBKEY),
    network: networks.bitcoin,
  }).address;
  if (!bond.output || !successorBondAddress) throw new Error("fixture p2tr");
  const input: TransferArtifactInput = {
    prevStateTxid: "11".repeat(32),
    newOwnerPubkey: OWNER1_PUBKEY,
    flags: 0,
    successorBondVout: 0,
    successorBondSats: "99000",
    successorBondAddress,
    currentBondInput: {
      txid: "22".repeat(32),
      vout: 0,
      valueSats: BOND_VALUE_SATS.toString(),
      scriptPubKeyHex: bytesToHex(bond.output),
    },
    feeSats: "1000",
    network: "mainnet",
  };
  return { input, bondScript: bond.output };
}

describe("buildAndSignTransfer — gift transfer artifact", () => {
  it("produces a signed tx that parses with the expected shape (1 input, bond + carrier outputs)", () => {
    const { input } = buildInput();
    const r = signer().buildAndSignTransfer(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = Transaction.fromHex(r.artifact.signedTransactionHex);
    expect(tx.ins.length).toBe(1);
    expect(tx.outs.length).toBe(2);
  });

  it("embeds exactly one Transfer carrier (0x03) that decodes via @ont/wire with a verifying owner signature", () => {
    const { input } = buildInput();
    const s = signer();
    const r = s.buildAndSignTransfer(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = Transaction.fromHex(r.artifact.signedTransactionHex);
    expect(tx.outs.filter((o) => o.script[0] === 0x6a).length).toBe(1);
    const ev = decodeEvent(hexToBytes(r.artifact.transferEventHex));
    expect(ev.type).toBe(EventType.Transfer);
    if (ev.type !== EventType.Transfer) return;
    expect(ev.prevStateTxid).toBe(input.prevStateTxid);
    expect(ev.newOwnerPubkey).toBe(input.newOwnerPubkey);
    expect(ev.flags).toBe(0);
    expect(ev.successorBondVout).toBe(0);
    const digest = transferAuthDigest({
      prevStateTxid: ev.prevStateTxid,
      newOwnerPubkey: ev.newOwnerPubkey,
      flags: ev.flags,
      successorBondVout: ev.successorBondVout,
    });
    expect(verifySchnorr(ev.signature, digest, s.ownerPubkey)).toBe(true);
  });

  it("signs the bond input with a taproot key-path signature over the real BIP-341 sighash", () => {
    const { input, bondScript } = buildInput();
    const r = signer().buildAndSignTransfer(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = Transaction.fromHex(r.artifact.signedTransactionHex);
    const witness = tx.ins[0]?.witness ?? [];
    expect(witness.length).toBe(1);
    const sig = witness[0]?.slice(0, 64);
    if (!sig) return;
    const sighash = tx.hashForWitnessV1(0, [bondScript], [BOND_VALUE_SATS], Transaction.SIGHASH_DEFAULT);
    const outputKey = bondScript.slice(2); // OP_1 <32-byte taproot output key>
    expect(verifySchnorr(bytesToHex(sig), sighash, bytesToHex(outputKey))).toBe(true);
  });

  it("is deterministic (fixed inputs → identical signed tx)", () => {
    const { input } = buildInput();
    const a = signer().buildAndSignTransfer(input);
    const b = signer().buildAndSignTransfer(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.artifact.signedTransactionHex).toBe(b.artifact.signedTransactionHex);
  });

  it("exposes no private key / seed / mnemonic in the artifact", () => {
    const { input } = buildInput();
    const r = signer().buildAndSignTransfer(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dump = JSON.stringify(r.artifact);
    expect(dump).not.toContain(OWNER0_PRIVATE);
    expect(dump).not.toContain(MNEMONIC);
  });
});

describe("buildAndSignTransfer — fail-closed", () => {
  it("funding cannot cover bond + fee → insufficient-funds", () => {
    const { input } = buildInput();
    const r = signer().buildAndSignTransfer({ ...input, feeSats: "1000000" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("insufficient-funds");
  });
  it("successorBondVout outside {0,1} → invalid-successor-bond-vout", () => {
    const { input } = buildInput();
    const r = signer().buildAndSignTransfer({ ...input, successorBondVout: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-successor-bond-vout");
  });
});
