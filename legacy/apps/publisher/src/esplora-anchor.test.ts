import { Transaction, networks, payments } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import { describe, expect, it } from "vitest";

import { decodeRootAnchorPayload } from "@ont/protocol";

import { EsploraAnchorBroadcaster } from "./esplora-anchor.js";

const ECPair = ECPairFactory(tinysecp);

function regtestFundingWif(): { wif: string; address: string } {
  const keyPair = ECPair.makeRandom({ network: networks.regtest });
  const payment = payments.p2wpkh({ pubkey: keyPair.publicKey, network: networks.regtest });
  return { wif: keyPair.toWIF(), address: payment.address ?? "" };
}

describe("EsploraAnchorBroadcaster.buildAndSign", () => {
  it("builds a signed tx with the correct OP_RETURN payload", () => {
    const { wif } = regtestFundingWif();
    const broadcaster = new EsploraAnchorBroadcaster({
      esploraBaseUrl: "http://e",
      network: "regtest",
      fundingWif: wif,
      feeSats: 500n
    });
    const utxo = {
      txid: "aa".repeat(32),
      vout: 0,
      value: 50_000,
      status: { confirmed: true }
    };
    const payload = {
      prevRoot: "11".repeat(32),
      newRoot: "22".repeat(32),
      batchSize: 5
    };
    const { hex, txid } = broadcaster.buildAndSign([utxo], payload);

    // Parse the tx back and inspect its outputs.
    const tx = Transaction.fromHex(hex);
    expect(tx.getId()).toBe(txid);
    expect(tx.outs).toHaveLength(2); // OP_RETURN + change
    const opReturnOut = tx.outs[0];
    expect(opReturnOut?.value).toBe(0n);
    // OP_RETURN script is OP_RETURN OP_PUSHDATA1 N <payload>
    // The payload length is 68 (32 + 32 + 4); the script body should contain those bytes.
    const script = opReturnOut?.script;
    expect(script?.[0]).toBe(0x6a); // OP_RETURN
    // The anchor carries the FULL ONT-framed payload (magic+version+type+body = 73
    // bytes) — the exact bytes the indexer's decodeRootAnchorPayload reads off-chain.
    const payloadBytes = script?.slice(script.length - 73);
    expect(payloadBytes).toBeDefined();
    const decoded = decodeRootAnchorPayload(new Uint8Array(payloadBytes as Buffer));
    expect(decoded.prevRoot).toBe(payload.prevRoot);
    expect(decoded.newRoot).toBe(payload.newRoot);
    expect(decoded.batchSize).toBe(payload.batchSize);

    // Change output to the funding address
    const changeOut = tx.outs[1];
    expect(Number(changeOut?.value)).toBe(50_000 - 500);
  });

  it("throws when the UTXO value does not cover the fee", () => {
    const { wif } = regtestFundingWif();
    const broadcaster = new EsploraAnchorBroadcaster({
      esploraBaseUrl: "http://e",
      network: "regtest",
      fundingWif: wif,
      feeSats: 50_000n
    });
    expect(() =>
      broadcaster.buildAndSign(
        [{ txid: "bb".repeat(32), vout: 0, value: 1_000, status: { confirmed: true } }],
        { prevRoot: "00".repeat(32), newRoot: "11".repeat(32), batchSize: 1 }
      )
    ).toThrow(/does not cover fee/);
  });

  it("derives a P2WPKH funding address from the WIF", () => {
    const { wif, address } = regtestFundingWif();
    const broadcaster = new EsploraAnchorBroadcaster({
      esploraBaseUrl: "http://e",
      network: "regtest",
      fundingWif: wif,
      feeSats: 500n
    });
    expect(broadcaster.fundingAddress).toBe(address);
  });
});
