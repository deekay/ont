// The cheap-rail LOOP test: claim → seal → REAL anchor tx bytes → indexer decodes
// the anchor off the (synthetic) chain → fetches the DA bundle → verifies + merges
// → the name resolves.
//
// This crosses the exact boundary that has already broken once in production: the
// publisher's EsploraAnchorBroadcaster emitted body-only OP_RETURN bytes (no "ONT"
// magic) while the indexer decoded the full framed payload, so live anchors were
// silently invisible (fixed in PR #10). Unit tests and golden vectors on each side
// stayed green through that bug — only a test that pushes the publisher's actual
// transaction bytes through the indexer's actual decoder can catch encode/decode
// drift. That is this test's whole job; do not "simplify" it to share an encoder.
import { Transaction, networks, payments, script as btcScript } from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import { describe, expect, it } from "vitest";

import type { BitcoinBlock, BitcoinTransaction } from "@ont/bitcoin";
import { InMemoryOntIndexer } from "@ont/core";
import type { RootAnchorEventPayload } from "@ont/protocol";

import { type AnchorBroadcastInput, type AnchorBroadcaster, type AnchorBroadcastResult } from "./anchor.js";
import { EsploraAnchorBroadcaster } from "./esplora-anchor.js";
import { Publisher } from "./publisher.js";

const ECPair = ECPairFactory(tinysecp);
const OWNER = "ab".repeat(32);

/** Captures the payload the publisher hands its broadcaster at seal time. */
class CapturingBroadcaster implements AnchorBroadcaster {
  readonly payloads: RootAnchorEventPayload[] = [];
  async broadcast(input: AnchorBroadcastInput): Promise<AnchorBroadcastResult> {
    this.payloads.push(input.payload);
    return { txid: "11".repeat(32), height: 0 };
  }
}

/** Parse a signed anchor tx back into the indexer's BitcoinTransaction shape. */
function toIndexerTransaction(hex: string): BitcoinTransaction {
  const tx = Transaction.fromHex(hex);
  return {
    txid: tx.getId(),
    inputs: [{ txid: null, vout: null, coinbase: false }],
    outputs: tx.outs.map((out) => {
      const decompiled = btcScript.decompile(out.script);
      const push = decompiled?.[0] === 0x6a /* OP_RETURN */ ? decompiled[1] : undefined;
      if (push instanceof Uint8Array) {
        return { valueSats: out.value, scriptType: "op_return" as const, dataHex: Buffer.from(push).toString("hex") };
      }
      return { valueSats: out.value, scriptType: "payment" as const };
    })
  };
}

describe("cheap-rail loop (publisher tx bytes → indexer → resolved name)", () => {
  it("a claimed name resolves from the publisher's REAL anchor transaction bytes", async () => {
    // 1. Claim + seal: the publisher batches the claim and hands its broadcaster
    //    the root-anchor payload, exactly as in production.
    const capture = new CapturingBroadcaster();
    const publisher = new Publisher({ network: "regtest", anchorBroadcaster: capture });
    const quote = await publisher.quote({ name: "alice", ownerPubkey: OWNER, paymentRail: "lightning" });
    const receipt = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
    expect(receipt.status).toBe("confirmed");
    const root = receipt.inclusionProof!.root;
    expect(capture.payloads).toHaveLength(1);

    // 2. Build the REAL signed anchor transaction those bytes would ship in —
    //    the same buildAndSign path production uses (no network needed).
    const keyPair = ECPair.makeRandom({ network: networks.regtest });
    const broadcaster = new EsploraAnchorBroadcaster({
      esploraBaseUrl: "http://unused",
      network: "regtest",
      fundingWif: keyPair.toWIF(),
      feeSats: 500n
    });
    void payments; // (payments import kept for parity with esplora-anchor.test.ts helpers)
    const { hex } = broadcaster.buildAndSign(
      [{ txid: "aa".repeat(32), vout: 0, value: 50_000, status: { confirmed: true } }],
      capture.payloads[0]!
    );

    // 3. The indexer ingests the block containing that transaction and must
    //    decode the anchor from the raw OP_RETURN bytes.
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });
    const block: BitcoinBlock = { height: 100, hash: "22".repeat(32), transactions: [toIndexerTransaction(hex)] };
    indexer.ingestBlock(block);
    expect(indexer.getAppliedRootAnchorCount()).toBe(1); // ← the boundary that broke in prod
    expect(indexer.getConfirmedAccumulatorRoot()).toBe(root);
    expect(indexer.unresolvedAnchorRoots()).toEqual([root.toLowerCase()]);

    // 4. DA fetch + verify + merge → the name resolves.
    const bundle = publisher.daBundle(root);
    expect(indexer.applyBatchData(root, bundle.leaves)).toBe(1);
    const resolved = indexer.resolveName("alice");
    expect(resolved?.source).toBe("accumulator");
    expect(resolved && "currentOwnerPubkey" in resolved.record && resolved.record.currentOwnerPubkey).toBe(OWNER);
  });

  it("chains a second batch onto the first (prevRoot continuity across real txs)", async () => {
    const capture = new CapturingBroadcaster();
    const publisher = new Publisher({ network: "regtest", anchorBroadcaster: capture });
    const indexer = new InMemoryOntIndexer({ launchHeight: 100 });
    const keyPair = ECPair.makeRandom({ network: networks.regtest });
    const broadcaster = new EsploraAnchorBroadcaster({
      esploraBaseUrl: "http://unused",
      network: "regtest",
      fundingWif: keyPair.toWIF(),
      feeSats: 500n
    });

    const names = ["alice", "bob"];
    for (const [i, name] of names.entries()) {
      const quote = await publisher.quote({ name, ownerPubkey: OWNER, paymentRail: "lightning" });
      const receipt = await publisher.submit({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } });
      const { hex } = broadcaster.buildAndSign(
        [{ txid: (i === 0 ? "aa" : "bb").repeat(32), vout: 0, value: 50_000, status: { confirmed: true } }],
        capture.payloads[i]!
      );
      indexer.ingestBlock({ height: 100 + i, hash: (i === 0 ? "33" : "44").repeat(32), transactions: [toIndexerTransaction(hex)] });
      const root = receipt.inclusionProof!.root;
      indexer.applyBatchData(root, publisher.daBundle(root).leaves);
    }

    expect(indexer.getAppliedRootAnchorCount()).toBe(2);
    expect(indexer.resolveName("alice")?.source).toBe("accumulator");
    expect(indexer.resolveName("bob")?.source).toBe("accumulator");
  });
});
