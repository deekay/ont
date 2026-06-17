// Lightning payment adapter for the ONT reference client.
//
// ONT uses Lightning only for the cheap-claim fee leg — a small payment to a
// publisher. We talk to a Lexe node through its local "sidecar": a Rust binary
// that runs a REST server at http://localhost:5393 and proxies to the node. The
// sidecar is language-agnostic ("your app can be written in any language"), so
// this TS client just speaks HTTP to it — no Lexe SDK, no enclave, no BDK here.
//
// Endpoints (Lexe sidecar v2): POST /v2/node/pay, POST /v2/node/create_invoice,
// GET /v2/node/payment, GET /v2/node/node_info.
//
// NOTE: the exact request/response field names still need confirming against
// docs.lexe.tech/sidecar/api-reference. The request body and response parsing
// below are intentionally permissive so they adapt without changing this
// module's interface to the rest of the client.

export type LightningPaymentStatus = "succeeded" | "pending" | "failed";

export interface LightningPaymentResult {
  readonly status: LightningPaymentStatus;
  readonly paymentId: string | null;
  readonly raw: unknown;
}

export interface LightningPayInput {
  /** Anything the node can pay: BOLT11 invoice, BOLT12 offer, Lightning address, LNURL, etc. */
  readonly payable: string;
  /** Amount in bitcoin base units, for when the payable doesn't already fix it. */
  readonly amountSats?: number;
  readonly note?: string;
}

/** All the ONT client needs from a Lightning backend — nothing more. */
export interface LightningPayer {
  pay(input: LightningPayInput): Promise<LightningPaymentResult>;
}

/** Minimal structural view of a fetch Response, so we don't depend on lib DOM. */
interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** Pays through a Lexe node via its local sidecar REST server. */
export class LexeSidecarLightningPayer implements LightningPayer {
  readonly baseUrl: string;

  constructor(baseUrl = "http://localhost:5393") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async pay(input: LightningPayInput): Promise<LightningPaymentResult> {
    const body: Record<string, unknown> = { payable: input.payable };
    if (input.amountSats !== undefined) {
      body.amount_sats = input.amountSats;
    }
    if (input.note !== undefined) {
      body.note = input.note;
    }

    const response = (await fetch(`${this.baseUrl}/v2/node/pay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })) as HttpResponse;

    const raw = await readJson(response);
    if (!response.ok) {
      throw new LightningError(`Lexe sidecar pay failed (${response.status}): ${describe(raw)}`);
    }

    return { status: parseStatus(raw), paymentId: parsePaymentId(raw), raw };
  }

  /** Sanity check that the sidecar is up and connected to a node. */
  async nodeInfo(): Promise<unknown> {
    const response = (await fetch(`${this.baseUrl}/v2/node/node_info`)) as HttpResponse;
    const raw = await readJson(response);
    if (!response.ok) {
      throw new LightningError(
        `Lexe sidecar node_info failed (${response.status}): ${describe(raw)}`
      );
    }
    return raw;
  }
}

/**
 * Offline stand-in for development and tests, and the launch-time fallback
 * before the publisher/Lightning path is live. Records every payment and reports
 * success without touching a node.
 */
export class StubLightningPayer implements LightningPayer {
  readonly payments: LightningPayInput[] = [];

  pay(input: LightningPayInput): Promise<LightningPaymentResult> {
    this.payments.push(input);
    return Promise.resolve({
      status: "succeeded",
      paymentId: `stub-${this.payments.length}`,
      raw: { stub: true, payable: input.payable }
    });
  }
}

export class LightningError extends Error {}

async function readJson(response: HttpResponse): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseStatus(raw: unknown): LightningPaymentStatus {
  const status = pick(raw, "status");
  if (typeof status === "string") {
    const normalized = status.toLowerCase();
    if (normalized.includes("succeed") || normalized === "completed" || normalized === "paid") {
      return "succeeded";
    }
    if (normalized.includes("fail")) {
      return "failed";
    }
    if (normalized.includes("pend") || normalized.includes("progress")) {
      return "pending";
    }
  }
  // A 2xx with no explicit status is treated as accepted-but-not-yet-final.
  return "pending";
}

function parsePaymentId(raw: unknown): string | null {
  for (const key of ["payment_id", "paymentId", "index", "id"]) {
    const value = pick(raw, key);
    if (typeof value === "string" && value !== "") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

function pick(raw: unknown, key: string): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return (raw as Record<string, unknown>)[key];
  }
  return undefined;
}

function describe(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}
