// Cheap-rail claim orchestration + local verification.
//
// The security model: the wallet trusts NOTHING the publisher says. Before
// paying, it checks the quote commits to the deterministic leaf and to this
// wallet's owner key. After the publisher reports "confirmed", it re-derives the
// leaf, checks the committed value is this wallet's owner key, and verifies the
// inclusion proof against its own root with the bit-exact accumulator port. Only
// then is the claim real — and even then it is provisional until the on-chain
// notice window closes (ONT one-path model).
//
// This file is a faithful port of the verification half of apps/wallet/src
// runClaimCheap (index.ts ~840). The pure functions below are unit-tested
// offline against the engine's Accumulator; the stepper drives the UI.
import { NOTICE_WINDOW_BLOCKS } from "../config";
import type {
  PaymentRail,
  PublisherClaimReceipt,
  PublisherClientLike,
  PublisherQuote,
} from "../api/publisher";
import { accumulatorKeyForName, normalizeName, verifyAccumulatorProof } from "./accumulator";

export interface ClaimCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
}

/**
 * Pre-payment check: the publisher must commit to exactly the leaf `H(name)`
 * and to this wallet's owner key. Never pay a quote that promises anything else.
 */
export function verifyQuoteCommitments(
  quote: PublisherQuote,
  params: { name: string; ownerPubkey: string },
): ClaimCheck {
  const problems: string[] = [];
  const expectedLeaf = accumulatorKeyForName(params.name);
  if (!quote.available) {
    problems.push(`publisher reports "${params.name}" unavailable (${quote.reason ?? "no reason given"})`);
  }
  if (quote.leaf.toLowerCase() !== expectedLeaf) {
    problems.push(`quote leaf does not match sha256(name) — got ${quote.leaf}, expected ${expectedLeaf}`);
  }
  if (quote.ownerCommitment.toLowerCase() !== params.ownerPubkey.toLowerCase()) {
    problems.push("quote ownerCommitment does not match this wallet's owner key");
  }
  return { ok: problems.length === 0, problems };
}

export interface ConfirmedClaim extends ClaimCheck {
  /** Block height the claim was anchored at, if known (0 when unconfirmed on-chain). */
  readonly anchorHeight: number;
  /** Anchoring transaction id, when present. */
  readonly anchorTxid: string | null;
  /**
   * Height at which the notice/contest window closes. The claim finalizes only
   * if uncontested past this height. 0 when the anchor height is unknown.
   */
  readonly noticeWindowCloseHeight: number;
  readonly noticeWindowBlocks: number;
}

/**
 * Post-confirmation verification. Mirrors the engine: requires an inclusion
 * proof + anchor txid, checks the proof verifies against its committed root,
 * that the leaf matches the name, and that the committed value is this wallet's
 * owner key. Returns the notice-window framing so the UI never implies a cheap
 * claim is final the instant the publisher says "confirmed".
 */
export function verifyConfirmedReceipt(
  receipt: PublisherClaimReceipt,
  params: { name: string; ownerPubkey: string },
): ConfirmedClaim {
  const problems: string[] = [];
  const proof = receipt.inclusionProof;

  if (proof === undefined || receipt.anchorTxid === undefined) {
    return {
      ok: false,
      problems: ["publisher reported confirmed status without an inclusion proof + anchor txid"],
      anchorHeight: 0,
      anchorTxid: receipt.anchorTxid ?? null,
      noticeWindowCloseHeight: 0,
      noticeWindowBlocks: NOTICE_WINDOW_BLOCKS,
    };
  }

  const proofOk = verifyAccumulatorProof(proof.root, {
    keyHex: proof.leaf,
    value: proof.value,
    siblings: proof.siblings,
  });
  if (!proofOk) {
    problems.push("inclusion proof does not verify against its committed root — refusing to record this claim");
  }
  const expectedLeaf = accumulatorKeyForName(params.name);
  if (proof.leaf.toLowerCase() !== expectedLeaf) {
    problems.push("inclusion proof is for a different leaf than the quoted name");
  }
  if (proof.value.toLowerCase() !== params.ownerPubkey.toLowerCase()) {
    problems.push("inclusion proof commits a different owner pubkey than this wallet");
  }

  const anchorHeight = receipt.anchorHeight ?? 0;
  const noticeWindowCloseHeight = anchorHeight > 0 ? anchorHeight + NOTICE_WINDOW_BLOCKS : 0;
  return {
    ok: problems.length === 0,
    problems,
    anchorHeight,
    anchorTxid: receipt.anchorTxid,
    noticeWindowCloseHeight,
    noticeWindowBlocks: NOTICE_WINDOW_BLOCKS,
  };
}

export class ClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimError";
  }
}

/**
 * Fetch and locally verify a quote. Throws ClaimError if the publisher's
 * commitments don't match — the caller should never proceed to payment then.
 */
export async function fetchVerifiedQuote(
  client: PublisherClientLike,
  params: { name: string; ownerPubkey: string; rail?: PaymentRail },
): Promise<PublisherQuote> {
  const name = normalizeName(params.name); // throws on an invalid name before any network call
  const quote = await client.quote({
    name,
    ownerPubkey: params.ownerPubkey,
    paymentRail: params.rail ?? "lightning",
  });
  const check = verifyQuoteCommitments(quote, { name, ownerPubkey: params.ownerPubkey });
  if (!check.ok) {
    throw new ClaimError(check.problems.join("; "));
  }
  return quote;
}
