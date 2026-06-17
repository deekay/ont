// Invoice creation — the interface a publisher uses to get a BOLT11 invoice
// for a quote. A real publisher creates the invoice on its own LN node so the
// payment lands where the publisher can spend it; the stub mirrors the
// wallet's StubLightningPayer pattern and produces a synthetic invoice
// without contacting a node.

export interface InvoiceProviderInput {
  readonly quoteId: string;
  readonly amountSats: bigint;
  readonly description: string;
}

export interface InvoiceProviderResult {
  readonly bolt11: string;
  readonly paymentHash: string;
}

export interface InvoiceProvider {
  create(input: InvoiceProviderInput): Promise<InvoiceProviderResult>;
}

/** Default: synthetic invoice + payment hash; doesn't contact a node. */
export class StubInvoiceProvider implements InvoiceProvider {
  async create(input: InvoiceProviderInput): Promise<InvoiceProviderResult> {
    return {
      bolt11: `lnbcrt:stub:${input.quoteId}`,
      paymentHash: `stub-${input.quoteId}`
    };
  }
}

/**
 * Calls a Lexe node's local sidecar to create a BOLT11 invoice. Field names
 * for the response are parsed permissively because the exact sidecar schema
 * still needs confirming against docs.lexe.tech.
 */
export class LexeSidecarInvoiceProvider implements InvoiceProvider {
  readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:5393") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async create(input: InvoiceProviderInput): Promise<InvoiceProviderResult> {
    const res = await fetch(`${this.baseUrl}/v2/node/create_invoice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount_sats: Number(input.amountSats),
        description: input.description
      })
    });
    if (!res.ok) {
      throw new Error(`lexe create_invoice returned HTTP ${res.status}: ${await res.text()}`);
    }
    const raw = (await res.json()) as unknown;
    const bolt11 = pickString(raw, "bolt11", "invoice", "payment_request");
    const paymentHash = pickString(raw, "payment_hash", "paymentHash", "hash");
    if (bolt11 === null || paymentHash === null) {
      throw new Error(`lexe create_invoice response missing bolt11/payment_hash: ${JSON.stringify(raw)}`);
    }
    return { bolt11, paymentHash };
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
