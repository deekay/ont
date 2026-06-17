// @ont/indexer live — G2 slice 3 RED battery: env-selected durable store wiring.
//
// Pins the selector contract (CL concur, event a71ccd1e): ONT_STORE unset/`memory` → hermetic in-memory pair,
// NEVER consulting ONT_STORE_DIR (a stale file-mode env can't perturb a memory run); `file` requires
// ONT_STORE_DIR and persists both stores durably under it (a fresh selector over the same dir reloads them);
// `file` without ONT_STORE_DIR and any unknown value (incl. empty string / case variants) fail closed.
// Negative assertions match the impl's specific reason strings so the not-implemented stub stays red.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import type { ConfirmedAnchorRecord } from "../ingest-anchors.js";
import { selectIndexerStores } from "./select-stores.js";

const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [
    { valueSats: 0n, scriptPubKeyHex: "6a49" + "7a".repeat(73) },
    { valueSats: 1234n, scriptPubKeyHex: "0014" + "11".repeat(20) },
  ],
  locktime: 0,
};
const ANCHOR_TXID = (() => {
  const t = legacyTxidOf(anchorTx);
  if (!t) throw new Error("fixture anchor txid");
  return t;
})();
const ANCHORED_ROOT = "7a".repeat(32);
const record: ConfirmedAnchorRecord = {
  confirmedAnchor: { anchorTxid: ANCHOR_TXID, minedHeight: 101, anchoredRoot: ANCHORED_ROOT, batchSize: 5 },
  feeTxParts: { anchorTx, prevoutTxs: [] },
};

describe("selectIndexerStores", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-stores-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ONT_STORE unset → in-memory stores (genesis cursor + empty anchors), no dir needed", async () => {
    const { cursorStore, anchorStore } = selectIndexerStores({});
    await expect(cursorStore.load()).resolves.toEqual({ height: 0 });
    await expect(anchorStore.has(ANCHORED_ROOT)).resolves.toBe(false);
  });

  it("ONT_STORE=memory never consults ONT_STORE_DIR (no file touched)", async () => {
    const { cursorStore, anchorStore } = selectIndexerStores({ ONT_STORE: "memory", ONT_STORE_DIR: dir });
    await cursorStore.save({ height: 9 });
    await anchorStore.put(record);
    await expect(readdir(dir)).resolves.toEqual([]); // memory mode wrote nothing to the dir
  });

  it("ONT_STORE=file persists both stores durably under ONT_STORE_DIR", async () => {
    const a = selectIndexerStores({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    await a.cursorStore.save({ height: 7 });
    await a.anchorStore.put(record);
    // a fresh selector over the same dir reloads both indexes
    const b = selectIndexerStores({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    await expect(b.cursorStore.load()).resolves.toEqual({ height: 7 });
    await expect(b.anchorStore.getByTxid(ANCHOR_TXID)).resolves.toEqual(record);
  });

  it("ONT_STORE=file without ONT_STORE_DIR fails closed", () => {
    expect(() => selectIndexerStores({ ONT_STORE: "file" })).toThrow(/ONT_STORE_DIR/);
  });

  it("unknown ONT_STORE fails closed (empty string, case variants, other)", () => {
    for (const ONT_STORE of ["", "File", "MEMORY", "postgres", "memory "]) {
      expect(() => selectIndexerStores({ ONT_STORE })).toThrow(/ONT_STORE/);
    }
  });
});
