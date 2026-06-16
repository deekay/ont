// Look up the spendable outputs at an address via an Esplora-style API (the
// same API used for broadcast). This lets the wallet fund a claim or transfer
// from its own funding address instead of asking you to hand-type UTXOs.
//
// We intentionally do no fancy coin selection: callers spend the confirmed set
// and let the transaction builder return change. Good enough for a reference
// client; a production wallet would select and estimate fees more carefully.

import type { FundingInputDescriptor } from "@ont/architect";

export class UtxoLookupError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "UtxoLookupError";
    this.status = status;
  }
}

interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

interface EsploraUtxo {
  readonly txid: string;
  readonly vout: number;
  readonly value: number;
  readonly status?: { readonly confirmed?: boolean };
}

/**
 * Fetch the UTXOs at an address as funding-input descriptors, newest value
 * first. By default only confirmed outputs are returned.
 */
export async function fetchAddressUtxos(input: {
  readonly esploraBaseUrl: string;
  readonly address: string;
  readonly includeUnconfirmed?: boolean;
}): Promise<readonly FundingInputDescriptor[]> {
  const baseUrl = input.esploraBaseUrl.replace(/\/+$/, "");
  const url = `${baseUrl}/address/${encodeURIComponent(input.address)}/utxo`;

  let response: HttpResponse;
  try {
    response = (await fetch(url)) as HttpResponse;
  } catch (error) {
    throw new UtxoLookupError(
      `could not reach UTXO endpoint at ${baseUrl} — ${error instanceof Error ? error.message : String(error)}`,
      null
    );
  }

  const body = await response.text();
  if (!response.ok) {
    throw new UtxoLookupError(`UTXO endpoint returned HTTP ${response.status}: ${body.trim()}`, response.status);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new UtxoLookupError(`UTXO endpoint returned non-JSON: ${body.slice(0, 120)}`, response.status);
  }
  if (!Array.isArray(parsed)) {
    throw new UtxoLookupError("UTXO endpoint did not return an array", response.status);
  }

  return (parsed as EsploraUtxo[])
    .filter((utxo) => (input.includeUnconfirmed ? true : utxo.status?.confirmed === true))
    .map((utxo) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      valueSats: BigInt(utxo.value),
      address: input.address
    }))
    .sort((a, b) => (b.valueSats > a.valueSats ? 1 : b.valueSats < a.valueSats ? -1 : 0));
}

export function sumUtxoValue(utxos: readonly FundingInputDescriptor[]): bigint {
  return utxos.reduce((total, utxo) => total + utxo.valueSats, 0n);
}
