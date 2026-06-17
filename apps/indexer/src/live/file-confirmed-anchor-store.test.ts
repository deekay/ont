// @ont/indexer live — G2 slice 2b RED battery: durable FILE-backed ConfirmedAnchorStore.
//
// Pins ChatLunatique's 2b watches (event f9aa7f6d): missing file → empty (ENOENT only; other read errors fail
// closed); corrupt file (non-JSON / non-array / undecodable record / duplicate root / duplicate txid) fails
// closed; a fresh instance rehydrates BOTH has(root) and getByTxid(txid); replace-by-root drops the stale txid
// and persists that removal; a txid-collision-on-put with a different root throws and leaves reads unchanged;
// getByTxid/has are read-only (no writes on reads); a successful put leaves no same-dir temp file; and the
// durability-before-visibility property — a failed durable write keeps the last durable state in memory and on a
// fresh instance. Negative assertions match the impl's specific reason strings so the not-implemented stub stays
// red for the right reason.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeLegacyTransaction, legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import type { ConfirmedAnchorRecord } from "../ingest-anchors.js";
import { encodeConfirmedAnchorRecord } from "./confirmed-anchor-codec.js";
import {
  createFileConfirmedAnchorStore,
  nodeFileStoreFs,
  type FileStoreFs,
} from "./file-confirmed-anchor-store.js";

// ── Fixtures: two distinct anchor txs (A, B differ by locktime → distinct txids) + prevouts. ──
const anchorTxA: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [
    { valueSats: 0n, scriptPubKeyHex: "6a49" + "7a".repeat(73) },
    { valueSats: 9_007_199_254_740_993n, scriptPubKeyHex: "0014" + "11".repeat(20) },
  ],
  locktime: 0,
};
const anchorTxB: LegacyTransaction = { ...anchorTxA, locktime: 7 };
const prevout0: LegacyTransaction = {
  version: 1,
  inputs: [{ prevoutTxid: "00".repeat(32), prevoutVout: 0, scriptSigHex: "51", sequence: 0 }],
  outputs: [{ valueSats: 1000n, scriptPubKeyHex: "76a914" + "22".repeat(20) + "88ac" }],
  locktime: 0,
};
const prevout1: LegacyTransaction = {
  version: 1,
  inputs: [{ prevoutTxid: "11".repeat(32), prevoutVout: 2, scriptSigHex: "52", sequence: 7 }],
  outputs: [{ valueSats: 2000n, scriptPubKeyHex: "0014" + "33".repeat(20) }],
  locktime: 9,
};

function txidOf(tx: LegacyTransaction): string {
  const t = legacyTxidOf(tx);
  if (!t) throw new Error("fixture txid");
  return t;
}
// Sanity: A and B must serialize and have distinct txids for the fixtures to mean anything.
if (!serializeLegacyTransaction(anchorTxA) || !serializeLegacyTransaction(anchorTxB)) throw new Error("fixture serialize");
const TA = txidOf(anchorTxA);
const TB = txidOf(anchorTxB);
const RA = "7a".repeat(32);
const RB = "5b".repeat(32);

function recordOf(o: {
  anchorTx: LegacyTransaction;
  anchorTxid: string;
  anchoredRoot: string;
  minedHeight: number;
  batchSize: number;
  prevoutTxs: LegacyTransaction[];
}): ConfirmedAnchorRecord {
  return {
    confirmedAnchor: { anchorTxid: o.anchorTxid, minedHeight: o.minedHeight, anchoredRoot: o.anchoredRoot, batchSize: o.batchSize },
    feeTxParts: { anchorTx: o.anchorTx, prevoutTxs: o.prevoutTxs },
  };
}

const recordA = recordOf({ anchorTx: anchorTxA, anchorTxid: TA, anchoredRoot: RA, minedHeight: 101, batchSize: 5, prevoutTxs: [prevout0, prevout1] });
const recordB = recordOf({ anchorTx: anchorTxB, anchorTxid: TB, anchoredRoot: RB, minedHeight: 202, batchSize: 3, prevoutTxs: [prevout0] });

/** Encode records to the on-disk array JSON (for hand-writing corrupt/duplicate fixtures). */
function fileJson(records: ConfirmedAnchorRecord[]): string {
  return JSON.stringify(records.map(encodeConfirmedAnchorRecord));
}

describe("createFileConfirmedAnchorStore", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-anchors-"));
    path = join(dir, "anchors.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("missing file → empty store", async () => {
    const store = createFileConfirmedAnchorStore(path);
    await expect(store.has(RA)).resolves.toBe(false);
    await expect(store.getByTxid(TA)).resolves.toBeNull();
  });

  it("put then has(root) and getByTxid(txid) on the same instance", async () => {
    const store = createFileConfirmedAnchorStore(path);
    await store.put(recordA);
    await expect(store.has(RA)).resolves.toBe(true);
    await expect(store.getByTxid(TA)).resolves.toEqual(recordA);
  });

  it("persists across a fresh instance — rehydrates both has(root) and getByTxid(txid)", async () => {
    await createFileConfirmedAnchorStore(path).put(recordA);
    const restarted = createFileConfirmedAnchorStore(path);
    await expect(restarted.has(RA)).resolves.toBe(true);
    await expect(restarted.getByTxid(TA)).resolves.toEqual(recordA);
  });

  it("holds multiple distinct records across a restart", async () => {
    const store = createFileConfirmedAnchorStore(path);
    await store.put(recordA);
    await store.put(recordB);
    const restarted = createFileConfirmedAnchorStore(path);
    await expect(restarted.has(RA)).resolves.toBe(true);
    await expect(restarted.has(RB)).resolves.toBe(true);
    await expect(restarted.getByTxid(TA)).resolves.toEqual(recordA);
    await expect(restarted.getByTxid(TB)).resolves.toEqual(recordB);
  });

  it("replace-by-root drops the stale txid and persists the removal across a fresh instance", async () => {
    const store = createFileConfirmedAnchorStore(path);
    await store.put(recordA); // root RA, txid TA
    const recordA2 = recordOf({ anchorTx: anchorTxB, anchorTxid: TB, anchoredRoot: RA, minedHeight: 150, batchSize: 9, prevoutTxs: [prevout0] }); // same root RA, txid TB
    await store.put(recordA2);
    await expect(store.getByTxid(TA)).resolves.toBeNull();
    await expect(store.getByTxid(TB)).resolves.toEqual(recordA2);
    await expect(store.has(RA)).resolves.toBe(true);
    const restarted = createFileConfirmedAnchorStore(path);
    await expect(restarted.getByTxid(TA)).resolves.toBeNull();
    await expect(restarted.getByTxid(TB)).resolves.toEqual(recordA2);
  });

  it("put fails closed when a txid is already mapped to a different root, leaving reads unchanged", async () => {
    const store = createFileConfirmedAnchorStore(path);
    await store.put(recordA); // root RA, txid TA
    const collide = recordOf({ anchorTx: anchorTxA, anchorTxid: TA, anchoredRoot: RB, minedHeight: 1, batchSize: 1, prevoutTxs: [prevout0] }); // root RB, txid TA
    await expect(store.put(collide)).rejects.toThrow(/different root/i);
    await expect(store.has(RA)).resolves.toBe(true);
    await expect(store.has(RB)).resolves.toBe(false);
    await expect(store.getByTxid(TA)).resolves.toEqual(recordA);
  });

  it("fails closed on a non-JSON file", async () => {
    await writeFile(path, "not json {{{", "utf8");
    await expect(createFileConfirmedAnchorStore(path).has(RA)).rejects.toThrow(/invalid confirmed-anchor store file/i);
  });

  it("fails closed when the JSON is not an array", async () => {
    await writeFile(path, JSON.stringify({ not: "an array" }), "utf8");
    await expect(createFileConfirmedAnchorStore(path).has(RA)).rejects.toThrow(/invalid confirmed-anchor store file/i);
  });

  it("fails closed on an undecodable record in the array", async () => {
    await writeFile(path, JSON.stringify([{ confirmedAnchor: { anchorTxid: "zz" }, feeTxParts: {} }]), "utf8");
    await expect(createFileConfirmedAnchorStore(path).has(RA)).rejects.toThrow(/invalid confirmed-anchor store file/i);
  });

  it("fails closed on a duplicate root in the file", async () => {
    const dupRoot = recordOf({ anchorTx: anchorTxB, anchorTxid: TB, anchoredRoot: RA, minedHeight: 9, batchSize: 1, prevoutTxs: [prevout0] });
    await writeFile(path, fileJson([recordA, dupRoot]), "utf8");
    await expect(createFileConfirmedAnchorStore(path).has(RA)).rejects.toThrow(/invalid confirmed-anchor store file/i);
  });

  it("fails closed on a duplicate txid in the file", async () => {
    const dupTxid = recordOf({ anchorTx: anchorTxA, anchorTxid: TA, anchoredRoot: RB, minedHeight: 9, batchSize: 1, prevoutTxs: [prevout0] });
    await writeFile(path, fileJson([recordA, dupTxid]), "utf8");
    await expect(createFileConfirmedAnchorStore(path).has(RA)).rejects.toThrow(/invalid confirmed-anchor store file/i);
  });

  it("fails closed on a non-ENOENT read error (does not treat it as an empty store)", async () => {
    const failingRead: FileStoreFs = {
      ...nodeFileStoreFs,
      readFile: () => Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" })),
    };
    await expect(createFileConfirmedAnchorStore(path, failingRead).has(RA)).rejects.toThrow(
      /invalid confirmed-anchor store file/i,
    );
  });

  it("getByTxid and has are read-only — repeated reads never write", async () => {
    await createFileConfirmedAnchorStore(path).put(recordA);
    let writes = 0;
    const countingFs: FileStoreFs = {
      ...nodeFileStoreFs,
      writeFile: (p, d) => {
        writes += 1;
        return nodeFileStoreFs.writeFile(p, d);
      },
      rename: (a, b) => {
        writes += 1;
        return nodeFileStoreFs.rename(a, b);
      },
    };
    const store = createFileConfirmedAnchorStore(path, countingFs);
    await store.getByTxid(TA);
    await store.getByTxid(TA);
    await store.has(RA);
    expect(writes).toBe(0);
  });

  it("leaves no same-dir temp file behind after a successful put", async () => {
    await createFileConfirmedAnchorStore(path).put(recordA);
    await expect(readdir(dir)).resolves.toEqual(["anchors.json"]);
  });

  it("a failed durable write keeps the last durable state (in memory and on a fresh instance)", async () => {
    await createFileConfirmedAnchorStore(path).put(recordA); // durable file = [A]
    const failingWrite: FileStoreFs = {
      ...nodeFileStoreFs,
      writeFile: () => Promise.reject(new Error("ENOSPC simulated")),
    };
    const store = createFileConfirmedAnchorStore(path, failingWrite);
    await expect(store.put(recordB)).rejects.toThrow();
    // in-memory state unchanged: B not visible, A still visible
    await expect(store.has(RB)).resolves.toBe(false);
    await expect(store.has(RA)).resolves.toBe(true);
    await expect(store.getByTxid(TA)).resolves.toEqual(recordA);
    // fresh instance over the real file still reads only A
    const restarted = createFileConfirmedAnchorStore(path);
    await expect(restarted.has(RB)).resolves.toBe(false);
    await expect(restarted.getByTxid(TA)).resolves.toEqual(recordA);
  });
});
