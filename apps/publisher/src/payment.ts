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
