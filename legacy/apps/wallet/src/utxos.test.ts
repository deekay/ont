import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAddressUtxos, sumUtxoValue, UtxoLookupError } from "./utxos.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status: number; body: string }): ReturnType<typeof vi.fn> {
  const mock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    text: () => Promise.resolve(response.body)
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const UTXOS = JSON.stringify([
  { txid: "aa".repeat(32), vout: 0, value: 1000, status: { confirmed: true } },
  { txid: "bb".repeat(32), vout: 1, value: 5000, status: { confirmed: true } },
  { txid: "cc".repeat(32), vout: 0, value: 9000, status: { confirmed: false } }
]);

describe("fetchAddressUtxos", () => {
  it("returns confirmed UTXOs as descriptors, largest value first", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: UTXOS });
    const utxos = await fetchAddressUtxos({ esploraBaseUrl: "http://e/", address: "tb1qx" });

    expect(utxos.map((u) => u.valueSats)).toEqual([5000n, 1000n]);
    expect(utxos[0]?.address).toBe("tb1qx");
    expect(mock.mock.calls[0]?.[0]).toBe("http://e/address/tb1qx/utxo");
  });

  it("includes unconfirmed when asked", async () => {
    stubFetch({ ok: true, status: 200, body: UTXOS });
    const utxos = await fetchAddressUtxos({
      esploraBaseUrl: "http://e",
      address: "tb1qx",
      includeUnconfirmed: true
    });
    expect(utxos).toHaveLength(3);
    expect(sumUtxoValue(utxos)).toBe(15000n);
  });

  it("throws on a server error", async () => {
    stubFetch({ ok: false, status: 500, body: "boom" });
    await expect(fetchAddressUtxos({ esploraBaseUrl: "http://e", address: "tb1qx" })).rejects.toThrow(
      UtxoLookupError
    );
  });

  it("throws when the endpoint returns non-array JSON", async () => {
    stubFetch({ ok: true, status: 200, body: "{}" });
    await expect(fetchAddressUtxos({ esploraBaseUrl: "http://e", address: "tb1qx" })).rejects.toThrow(
      UtxoLookupError
    );
  });
});
