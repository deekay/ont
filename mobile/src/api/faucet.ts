// Private-signet test faucet client.
//
// Asks the hosted faucet to send test coins to the wallet's funding address and
// mine a block. Signet coins are worthless, so this isn't a payment — it's the
// way to fund real on-chain flows (fees, bonds, value/recovery writes) without
// any real money. No-op on mainnet, where there is no faucet (FAUCET_URL null).
import { FAUCET_REQUEST_SATS, FAUCET_URL } from "../config";

export interface FaucetResult {
  readonly txid: string;
  readonly fundedSats: string;
  readonly cooldownMs: number;
}

/** Whether a faucet exists for the active network (signet yes, mainnet no). */
export const faucetAvailable = FAUCET_URL !== null;

export async function requestTestFunds(
  address: string,
  amountSats: number = FAUCET_REQUEST_SATS,
): Promise<FaucetResult> {
  if (!FAUCET_URL) {
    throw new Error("The faucet is only available on signet.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(FAUCET_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, amountSats: String(amountSats) }),
      signal: controller.signal,
    });
  } catch {
    throw new Error("Couldn't reach the faucet. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON response handled below */
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;

  if (!res.ok) {
    const message =
      record && typeof record.message === "string"
        ? record.message
        : `Faucet request failed (${res.status}).`;
    throw new Error(message);
  }

  const txid = record && typeof record.txid === "string" ? record.txid : "";
  if (!/^[a-f0-9]{64}$/i.test(txid)) {
    throw new Error("The faucet didn't return a transaction id.");
  }
  const fundedSats =
    record && typeof record.fundedSats === "string" ? record.fundedSats : String(amountSats);
  const cooldownMs = record && typeof record.cooldownMs === "number" ? record.cooldownMs : 0;
  return { txid, fundedSats, cooldownMs };
}
