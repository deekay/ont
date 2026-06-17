// Cheap-rail claim flow for the no-install browser tool.
//
// Mirrors the wallet/app claim discipline: it trusts NOTHING the publisher
// returns. The quote must commit to exactly H(name) and this owner key before
// any "payment"; a "confirmed" receipt's inclusion proof must verify against its
// own anchored root and commit the right leaf + owner key. On our signet the
// Lightning payment is stubbed, so submit carries a rail-only proof.
import { accumulatorKeyForName, normalizeName, verifyAccumulatorProof } from "./browser-accumulator.js";

export const NOTICE_WINDOW_BLOCKS = 6;

export interface ClaimQuote {
  readonly quoteId: string;
  readonly name: string;
  readonly available: boolean;
  readonly reason?: string;
  readonly gateBaseSats?: string;
  readonly totalBaseSats?: string;
  readonly ownerCommitment: string;
  readonly leaf: string;
  readonly lightningInvoice?: string;
}

export interface InclusionProof {
  readonly root: string;
  readonly leaf: string;
  readonly value: string;
  readonly siblings: ReadonlyArray<{ readonly level: number; readonly hash: string }>;
}

export interface ClaimReceipt {
  readonly status: string;
  readonly name: string;
  readonly reason?: string;
  readonly anchorTxid?: string;
  readonly anchorHeight?: number;
  readonly inclusionProof?: InclusionProof;
}

export interface ClaimResult {
  readonly ok: boolean;
  readonly problems: string[];
  readonly name: string;
  readonly ownerPubkey: string;
  readonly receipt: ClaimReceipt | null;
  readonly status: string;
  readonly anchorTxid: string | null;
  readonly anchorHeight: number;
  readonly noticeWindowCloseHeight: number;
  readonly proofVerified: boolean;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    throw new Error(`Non-JSON response from ${url}`);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    if (parsed && typeof parsed === "object" && "message" in parsed) {
      message = String((parsed as Record<string, unknown>).message);
    }
    throw new Error(message);
  }
  return parsed as T;
}

/** Fetch + locally verify a claim quote. Throws if commitments don't match. */
export async function fetchVerifiedQuote(
  basePath: string,
  name: string,
  ownerPubkey: string
): Promise<ClaimQuote> {
  const normalized = normalizeName(name);
  const quote = await requestJson<ClaimQuote>(`${basePath}/api/claim/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: normalized, ownerPubkey, paymentRail: "lightning" })
  });
  const problems: string[] = [];
  if (!quote.available) {
    problems.push(`publisher reports "${normalized}" unavailable (${quote.reason ?? "no reason"})`);
  }
  if ((quote.leaf ?? "").toLowerCase() !== accumulatorKeyForName(normalized)) {
    problems.push("quote leaf does not match H(name)");
  }
  if ((quote.ownerCommitment ?? "").toLowerCase() !== ownerPubkey.toLowerCase()) {
    problems.push("quote does not commit this owner key");
  }
  if (problems.length > 0) {
    throw new Error(problems.join("; "));
  }
  return quote;
}

/** Run the full claim: verified quote -> submit (stubbed pay) -> verify proof. */
export async function claimAvailableName(opts: {
  readonly basePath: string;
  readonly name: string;
  readonly ownerPubkey: string;
}): Promise<ClaimResult> {
  const name = normalizeName(opts.name);
  const ownerPubkey = opts.ownerPubkey.toLowerCase();

  const quote = await fetchVerifiedQuote(opts.basePath, name, ownerPubkey);
  const receipt = await requestJson<ClaimReceipt>(`${opts.basePath}/api/claim/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteId: quote.quoteId, paymentProof: { rail: "lightning" } })
  });

  return evaluateReceipt(name, ownerPubkey, receipt);
}

/** Re-check a receipt (used after submit, or when polling status). */
export function evaluateReceipt(name: string, ownerPubkey: string, receipt: ClaimReceipt): ClaimResult {
  const problems: string[] = [];
  const proof = receipt.inclusionProof;
  let proofVerified = false;

  if (receipt.status === "confirmed") {
    if (!proof || !receipt.anchorTxid) {
      problems.push("publisher reported confirmed without an inclusion proof + anchor txid");
    } else {
      proofVerified = verifyAccumulatorProof(proof.root, {
        keyHex: proof.leaf,
        value: proof.value,
        siblings: proof.siblings
      });
      if (!proofVerified) problems.push("inclusion proof does not verify against its committed root");
      if ((proof.leaf ?? "").toLowerCase() !== accumulatorKeyForName(name)) {
        problems.push("inclusion proof is for a different name");
      }
      if ((proof.value ?? "").toLowerCase() !== ownerPubkey) {
        problems.push("inclusion proof commits a different owner key");
      }
    }
  }

  const anchorHeight = receipt.anchorHeight ?? 0;
  return {
    ok: receipt.status === "confirmed" && problems.length === 0,
    problems,
    name,
    ownerPubkey,
    receipt,
    status: receipt.status,
    anchorTxid: receipt.anchorTxid ?? null,
    anchorHeight,
    noticeWindowCloseHeight: anchorHeight > 0 ? anchorHeight + NOTICE_WINDOW_BLOCKS : 0,
    proofVerified
  };
}
