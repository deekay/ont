// Slice 5 red battery — ConfirmedAnchorStore.getByTxid read accessor (go-live confirmed-anchor read path).
// The resolver/web read indexer-produced confirmed-anchor facts BY TXID. Read-only: getByTxid returns the
// already-put record, null for an unknown txid, and never mutates the store (has/put stay correct after reads).
// RED until the in-memory store implements getByTxid (stub rejects).
import { describe, expect, it } from "vitest";
import type { LegacyTransaction } from "@ont/bitcoin";
import { createInMemoryConfirmedAnchorStore } from "./runner.js";
import type { ConfirmedAnchorRecord } from "./ingest-anchors.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);

const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: h32(0xa1), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 0n, scriptPubKeyHex: "6a0100" }],
  locktime: 0,
};

const record = (anchorTxid: string, anchoredRoot: string): ConfirmedAnchorRecord => ({
  confirmedAnchor: { anchorTxid, minedHeight: 101, anchoredRoot, batchSize: 5 },
  feeTxParts: { anchorTx, prevoutTxs: [] },
});

describe("ConfirmedAnchorStore.getByTxid (G1 slice 5)", () => {
  it("returns the put record for its confirmed-anchor txid", async () => {
    const store = createInMemoryConfirmedAnchorStore();
    const r = record(h32(0x11), h32(0xab));
    await store.put(r);
    expect(await store.getByTxid(h32(0x11))).toEqual(r);
  });

  it("returns null for an unknown txid", async () => {
    const store = createInMemoryConfirmedAnchorStore();
    await store.put(record(h32(0x11), h32(0xab)));
    expect(await store.getByTxid(h32(0x22))).toBeNull();
  });

  it("is a pure read — leaves has()/getByTxid stable, mints nothing", async () => {
    const store = createInMemoryConfirmedAnchorStore();
    const r = record(h32(0x11), h32(0xab));
    await store.put(r);
    expect(await store.getByTxid(h32(0x11))).toEqual(r);
    expect(await store.has(h32(0xab))).toBe(true);
    // a second read returns the same fact and a still-unknown txid is still null
    expect(await store.getByTxid(h32(0x11))).toEqual(r);
    expect(await store.getByTxid(h32(0x22))).toBeNull();
  });
});
