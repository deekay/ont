// Demo-mode publisher: a local stand-in for the batching publisher so the
// cheap-rail claim flow is walkable on the private signet, where the Lexe
// Lightning payment doesn't exist (Lexe is mainnet-only).
//
// What is faked: the publisher service itself — the quote, the "payment", and a
// synthetic anchor. What is NOT faked: the cryptography. The receipt carries a
// real inclusion proof built against a self-consistent single-leaf accumulator
// root, so the app's real verifyConfirmedReceipt / verifyAccumulatorProof runs
// and passes for the right reasons. Swap a real PublisherClient back in (turn
// demo mode off + set PUBLISHER_BASE) and nothing else in the flow changes.
import {
  accumulatorKeyForName,
  accumulatorRootForSingleLeaf,
  normalizeName,
} from "../wallet/accumulator";
import {
  PublisherError,
  type PaymentRail,
  type PublisherClaimReceipt,
  type PublisherClientLike,
  type PublisherInclusionProof,
  type PublisherQuote,
} from "./publisher";

// A plausible-but-clearly-synthetic anchor height + txid for demo receipts.
const DEMO_ANCHOR_HEIGHT = 1000;
const DEMO_ANCHOR_TXID = "de".repeat(32);
const QUOTE_TTL_MS = 10 * 60 * 1000;

export class MockPublisherClient implements PublisherClientLike {
  readonly isDemo = true;
  private readonly quotes = new Map<string, { name: string; ownerPubkey: string }>();
  private counter = 0;

  async info(): Promise<Record<string, unknown>> {
    return { kind: "ont-publisher-info", operatorName: "demo (local stub)", demo: true };
  }

  async quote(input: { name: string; ownerPubkey: string; paymentRail: PaymentRail }): Promise<PublisherQuote> {
    const name = normalizeName(input.name);
    const ownerPubkey = input.ownerPubkey.toLowerCase();
    this.counter += 1;
    const quoteId = `demo-${name}-${this.counter}`;
    this.quotes.set(quoteId, { name, ownerPubkey });

    return {
      kind: "ont-publisher-quote",
      quoteId,
      name,
      available: true,
      gateBaseSats: "1000",
      serviceBaseSats: "0",
      totalBaseSats: "1000",
      expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
      paymentRail: input.paymentRail,
      ...(input.paymentRail === "lightning"
        ? { lightningInvoice: `lnbc10n1demo${quoteId.replace(/[^a-z0-9]/g, "")}` }
        : { l1Address: "tb1qdemo0000000000000000000000000000000000" }),
      // Commit to exactly the deterministic leaf + this wallet's owner key, so
      // the real pre-payment check (verifyQuoteCommitments) passes honestly.
      ownerCommitment: input.ownerPubkey,
      leaf: accumulatorKeyForName(name),
    };
  }

  async submit(input: {
    quoteId: string;
    paymentProof: { rail: PaymentRail; paymentHash?: string; txid?: string };
  }): Promise<PublisherClaimReceipt> {
    return this.confirmedReceipt(input.quoteId);
  }

  async status(quoteId: string): Promise<PublisherClaimReceipt> {
    return this.confirmedReceipt(quoteId);
  }

  private confirmedReceipt(quoteId: string): PublisherClaimReceipt {
    const entry = this.quotes.get(quoteId);
    if (!entry) {
      throw new PublisherError(`demo publisher has no quote ${quoteId}`, 404);
    }
    const leaf = accumulatorKeyForName(entry.name);
    const value = entry.ownerPubkey;
    // Real proof against a real (synthetic) root: a tree containing only this
    // leaf. siblings: [] → the verifier folds through default empty-subtree
    // hashes, which is exactly what accumulatorRootForSingleLeaf computed.
    const proof: PublisherInclusionProof = {
      root: accumulatorRootForSingleLeaf(leaf, value),
      leaf,
      value,
      siblings: [],
    };
    return {
      kind: "ont-publisher-claim-receipt",
      quoteId,
      status: "confirmed",
      name: entry.name,
      anchorTxid: DEMO_ANCHOR_TXID,
      anchorHeight: DEMO_ANCHOR_HEIGHT,
      inclusionProof: proof,
    };
  }
}
