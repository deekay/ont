// Payment verification — the interface a publisher uses to confirm a wallet
// has actually paid the quoted amount. A real publisher checks a BOLT11
// invoice's paymentHash via its Lightning node, or watches an L1 address for
// the expected payment; the stub records the proof and accepts it without
// touching anything. The wallet's StubLightningPayer mirrors this on the
// other side.

import type { PaymentRail } from "./types.js";

export interface PaymentVerifierInput {
  readonly quoteId: string;
  readonly rail: PaymentRail;
  readonly expectedSats: bigint;
  readonly paymentProof: {
    readonly rail: PaymentRail;
    readonly paymentHash?: string;
    readonly txid?: string;
  };
  /** What the publisher told the wallet was the invoice or address. */
  readonly expectedReference: string;
}

export interface PaymentVerification {
  readonly accepted: boolean;
  readonly reason?: string;
}

export interface PaymentVerifier {
  verify(input: PaymentVerifierInput): Promise<PaymentVerification>;
}

/**
 * Accepts any payment proof. Records each verification so tests can assert on
 * them. Use only in dev / regtest — a real publisher must verify against a
 * Lightning node or watch the L1 chain.
 */
export class StubPaymentVerifier implements PaymentVerifier {
  readonly accepted: PaymentVerifierInput[] = [];

  verify(input: PaymentVerifierInput): Promise<PaymentVerification> {
    this.accepted.push(input);
    return Promise.resolve({ accepted: true });
  }
}

/**
 * Verifies a payment by querying a Lexe node's local sidecar for the payment
 * record associated with the wallet-supplied paymentHash. Accepted iff the
 * sidecar reports the payment as succeeded and the received amount covers the
 * expected total. Field names parsed permissively because the sidecar schema
 * still needs confirming against docs.lexe.tech.
 */
export class LexeSidecarPaymentVerifier implements PaymentVerifier {
  readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:5393") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async verify(input: PaymentVerifierInput): Promise<PaymentVerification> {
    const hash = input.paymentProof.paymentHash;
    if (hash === undefined || hash === "") {
      return { accepted: false, reason: "paymentProof.paymentHash is required" };
    }
    const res = await fetch(`${this.baseUrl}/v2/node/payment?hash=${encodeURIComponent(hash)}`);
    if (!res.ok) {
      return { accepted: false, reason: `lexe payment lookup returned HTTP ${res.status}` };
    }
    const raw = (await res.json()) as unknown;
    const status = pickString(raw, "status", "state")?.toLowerCase() ?? "";
    const settled = ["succeeded", "completed", "paid", "settled"].includes(status);
    if (!settled) {
      return { accepted: false, reason: `payment status is "${status}"` };
    }
    const amountSatsField = pickNumber(raw, "amount_sats", "amountSats", "amount") ?? 0;
    if (BigInt(amountSatsField) < input.expectedSats) {
      return {
        accepted: false,
        reason: `received ${amountSatsField} sats, expected ${input.expectedSats}`
      };
    }
    return { accepted: true };
  }
}

function pickString(raw: unknown, ...keys: string[]): string | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return null;
}

function pickNumber(raw: unknown, ...keys: string[]): number | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return null;
}
