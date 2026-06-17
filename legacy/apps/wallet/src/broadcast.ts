// Broadcast a signed transaction to the Bitcoin network via an Esplora-style
// HTTP API (the same API mempool.space and Blockstream expose).
//
// This is the only place the wallet pushes bytes to the wider network, and it's
// always opt-in: a claim or transfer is built and signed locally, and only sent
// when you ask. For signet/testnet/mainnet we default to mempool.space; regtest
// has no public endpoint, so set ONT_BROADCAST_URL to your own node's Esplora.

import type { OntNetwork } from "./keys.js";

export class BroadcastError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "BroadcastError";
    this.status = status;
  }
}

interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

const DEFAULT_ESPLORA_BASE_URLS: Record<OntNetwork, string | null> = {
  main: "https://mempool.space/api",
  testnet: "https://mempool.space/testnet/api",
  signet: "https://mempool.space/signet/api",
  regtest: null
};

/** Resolve the Esplora base URL: explicit > ONT_BROADCAST_URL > network default. */
export function resolveBroadcastBaseUrl(
  network: OntNetwork,
  explicit: string | undefined,
  envUrl: string | undefined
): string {
  const chosen = explicit ?? envUrl ?? DEFAULT_ESPLORA_BASE_URLS[network] ?? undefined;
  if (chosen === undefined || chosen.trim() === "") {
    throw new BroadcastError(
      `no broadcast endpoint for ${network} — set ONT_BROADCAST_URL to an Esplora API base URL`,
      null
    );
  }
  return chosen.replace(/\/+$/, "");
}

export class BroadcastClient {
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /** POST a raw transaction hex to {baseUrl}/tx; returns the broadcast txid. */
  async broadcastTransaction(transactionHex: string): Promise<string> {
    let response: HttpResponse;
    try {
      response = (await fetch(`${this.baseUrl}/tx`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: transactionHex
      })) as HttpResponse;
    } catch (error) {
      throw new BroadcastError(
        `could not reach broadcast endpoint at ${this.baseUrl} — ${error instanceof Error ? error.message : String(error)}`,
        null
      );
    }

    const body = (await response.text()).trim();
    if (!response.ok) {
      throw new BroadcastError(`broadcast endpoint returned HTTP ${response.status}: ${body}`, response.status);
    }
    return body;
  }
}
