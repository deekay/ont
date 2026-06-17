import { describe, expect, it, beforeAll } from "vitest";
import { Transaction, payments, networks, initEccLib } from "bitcoinjs-lib";
import * as tinysecp from "tiny-secp256k1";
import {
  decodeEvent,
  verifySchnorr,
  hexToBytes,
  bytesToHex,
  EventType,
  AUCTION_BID_FLAG_INCLUDES_NAME,
} from "@ont/wire";
import { createWalletSigner } from "./wallet-signer.js";
import type { AuctionBidArtifactInput } from "./auction-bid-artifacts.js";

// B5-WALLET auction-bid red battery (unparked by wire-codec-consolidation @ 676a545). The wallet builds + signs
// the on-chain AuctionBid tx (event 0x07) end-to-end: it CONSUMES the carrier fields (W17 auction-bid package via
// @ont/protocol — re-derives no auction rule) and owns only the Bitcoin tx. The carrier is encoded by @ont/wire
// at W16 full-width 32-byte commitments. AuctionBid carries NO ONT-layer signature — bid authority is the bond
// UTXO key-path spend + the commitments. RED until the builder lands.

const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const OWNER0_PRIVATE = "a4711cdd2c0e159b58098da37369ae84c2e626a25f7f641a75741c1e225c3d50";
const LOT = "aa".repeat(32); // 32-byte (W16 full-width) commitments
const STATE = "bb".repeat(32);
const BIDDER = "cc".repeat(32);
const FUNDING_VALUE_SATS = 100000n;

beforeAll(() => {
  initEccLib(tinysecp);
});

function signer() {
  const c = createWalletSigner(MNEMONIC, 0);
  if (!c.ok) throw new Error("expected a signer");
  return c.signer;
}

/** A hermetic auction-bid input: the funding bond is a real P2TR(owner) UTXO carrying value + scriptPubKey, so
 *  the BIP-341 sighash is real. 100000 in, 99000 bidder bond, 1000 fee → no change. bondVout=0. */
function buildInput(owner: string): { input: AuctionBidArtifactInput; fundingScript: Uint8Array } {
  const funding = payments.p2tr({ internalPubkey: hexToBytes(owner), network: networks.bitcoin });
  const bondAddress = payments.p2tr({ internalPubkey: hexToBytes(owner), network: networks.bitcoin }).address;
  if (!funding.output || !bondAddress) throw new Error("fixture p2tr");
  const input: AuctionBidArtifactInput = {
    flags: AUCTION_BID_FLAG_INCLUDES_NAME,
    bondVout: 0,
    settlementLockBlocks: 144,
    bidAmountSats: "50000",
    ownerPubkey: owner,
    auctionLotCommitment: LOT,
    auctionStateCommitment: STATE,
    bidderCommitment: BIDDER,
    unlockBlock: 900000,
    name: "alice",
    bondSats: "99000",
    bondAddress,
    fundingInput: {
      txid: "22".repeat(32),
      vout: 0,
      valueSats: FUNDING_VALUE_SATS.toString(),
      scriptPubKeyHex: bytesToHex(funding.output),
    },
    feeSats: "1000",
    network: "mainnet",
  };
  return { input, fundingScript: funding.output };
}

describe("buildAndSignAuctionBid — auction-bid artifact", () => {
  it("produces a signed tx that parses with the expected shape (1 input, bond + carrier outputs)", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = Transaction.fromHex(r.artifact.signedTransactionHex);
    expect(tx.ins.length).toBe(1);
    expect(tx.outs.length).toBe(2);
  });

  it("embeds exactly one AuctionBid carrier (0x07) that decodes via @ont/wire with the 32-byte commitments intact", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = Transaction.fromHex(r.artifact.signedTransactionHex);
    expect(tx.outs.filter((o) => o.script[0] === 0x6a).length).toBe(1);
    const ev = decodeEvent(hexToBytes(r.artifact.auctionBidEventHex));
    expect(ev.type).toBe(EventType.AuctionBid);
    if (ev.type !== EventType.AuctionBid) return;
    expect(ev.auctionLotCommitment).toBe(LOT);
    expect(ev.auctionStateCommitment).toBe(STATE);
    expect(ev.bidderCommitment).toBe(BIDDER);
    expect(ev.ownerPubkey).toBe(input.ownerPubkey);
    expect(ev.bidAmountSats).toBe(50000n);
    expect(ev.settlementLockBlocks).toBe(144);
    expect(ev.unlockBlock).toBe(900000);
    expect(ev.bondVout).toBe(0);
    expect(ev.name).toBe("alice");
    expect((ev.flags & AUCTION_BID_FLAG_INCLUDES_NAME) !== 0).toBe(true);
  });

  it("signs the funding input with a taproot key-path signature over the real BIP-341 sighash", () => {
    const s = signer();
    const { input, fundingScript } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tx = Transaction.fromHex(r.artifact.signedTransactionHex);
    const witness = tx.ins[0]?.witness ?? [];
    expect(witness.length).toBe(1);
    const sig = witness[0]?.slice(0, 64);
    if (!sig) return;
    const sighash = tx.hashForWitnessV1(0, [fundingScript], [FUNDING_VALUE_SATS], Transaction.SIGHASH_DEFAULT);
    const outputKey = fundingScript.slice(2); // OP_1 <32-byte taproot output key>
    expect(verifySchnorr(bytesToHex(sig), sighash, bytesToHex(outputKey))).toBe(true);
  });

  it("orders outputs by bondVout (bondVout=1 → [carrier, bond])", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, bondVout: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.artifact.outputs[0]?.role).toBe("ont_auction_bid");
    expect(r.artifact.outputs[1]?.role).toBe("bidder_bond");
  });

  it("is deterministic (fixed inputs → identical signed tx)", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const a = s.buildAndSignAuctionBid(input);
    const b = s.buildAndSignAuctionBid(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.artifact.signedTransactionHex).toBe(b.artifact.signedTransactionHex);
  });

  it("includes a change output when funding exceeds bond + fee and a change address is given", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, bondSats: "90000", changeAddress: input.bondAddress });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.artifact.changeValueSats).toBe("9000");
    expect(r.artifact.outputs.some((o) => o.role === "change")).toBe(true);
  });

  it("exposes no private key / seed / mnemonic in the artifact", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dump = JSON.stringify(r.artifact);
    expect(dump).not.toContain(OWNER0_PRIVATE);
    expect(dump).not.toContain(MNEMONIC);
  });
});

describe("buildAndSignAuctionBid — fail-closed", () => {
  it("funding cannot cover bond + fee → insufficient-funds", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, feeSats: "1000000" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("insufficient-funds");
  });

  it("bondVout outside {0,1} → invalid-bond-vout", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, bondVout: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-bond-vout");
  });

  it("flags missing AUCTION_BID_FLAG_INCLUDES_NAME → missing-name-flag", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, flags: 0 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("missing-name-flag");
  });

  it("change owed but no change address → change-without-address", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, bondSats: "90000" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("change-without-address");
  });

  it("a truncated 16-byte commitment is rejected (proves the W16 32-byte path) → invalid-input", () => {
    const s = signer();
    const { input } = buildInput(s.ownerPubkey);
    const r = s.buildAndSignAuctionBid({ ...input, auctionLotCommitment: "aa".repeat(16) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("invalid-input");
  });
});
