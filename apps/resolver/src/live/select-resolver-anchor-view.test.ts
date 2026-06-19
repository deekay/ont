// @ont/resolver live — G2 slice 6a RED battery: the env-selected read-only confirmed-anchor view source.
//
// Pins (CL, event 718cea68): env semantics EXACTLY match selectIndexerStores — unset/"memory" -> undefined;
// "file" requires a nonempty ONT_STORE_DIR; unknown/empty/case-variant fail closed (no relative-cwd files).
// File mode reads confirmed-anchors.json and maps the persisted record -> { anchorTx, minedHeight, anchoredRoot,
// batchSize } only, read-only (a fresh construction = a process restart). Plus a boundary guard: the HTTP
// server's /tx contract is governed entirely by the injected AnchorTxViewSource (no indexer in request
// handling). RED until selectResolverAnchorTxView is implemented (the stub throws, so every selector case is red).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serializeLegacyTransaction, legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import { handleResolverRequest, type AnchorTxViewSource, type ResolverStore } from "../server.js";
import { selectResolverAnchorTxView } from "./select-resolver-anchor-view.js";

// A real anchor tx so legacyTxidOf matches the on-disk anchorTxid (the slice-2a codec enforces that on read).
const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: "ab".repeat(32), prevoutVout: 1, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [
    { valueSats: 0n, scriptPubKeyHex: "6a49" + "7a".repeat(73) },
    { valueSats: 9_007_199_254_740_993n, scriptPubKeyHex: "0014" + "11".repeat(20) },
  ],
  locktime: 0,
};
const ANCHORED_ROOT = "7a".repeat(32);
const MINED_HEIGHT = 101;
const BATCH_SIZE = 5;

function txidOf(tx: LegacyTransaction): string {
  const t = legacyTxidOf(tx);
  if (!t) throw new Error("fixture txid");
  return t;
}
function txHexOf(tx: LegacyTransaction): string {
  const bytes = serializeLegacyTransaction(tx);
  if (!bytes) throw new Error("fixture serialize");
  return Buffer.from(bytes).toString("hex");
}
const ANCHOR_TXID = txidOf(anchorTx);

/** One on-disk encoded record — the EXACT slice-2a form, hand-built via @ont/bitcoin (so the RED battery needs
 *  no @ont/indexer dep; the slice-2b store decodes it verbatim at green). */
function encodedRecord(tx: LegacyTransaction, anchoredRoot: string, minedHeight: number, batchSize: number) {
  return {
    confirmedAnchor: { anchorTxid: txidOf(tx), minedHeight, anchoredRoot, batchSize },
    feeTxParts: { anchorTxHex: txHexOf(tx), prevoutTxHexes: [] as string[] },
  };
}
const anchorsJson = (entries: ReturnType<typeof encodedRecord>[]): string => JSON.stringify(entries);

// A second confirmed anchor (distinct txid via locktime) for the freshness (option b) pin.
const anchorTxB: LegacyTransaction = { ...anchorTx, locktime: 7 };
const TXID_B = txidOf(anchorTxB);
const ANCHORED_ROOT_B = "5b".repeat(32);
const MINED_HEIGHT_B = 202;
const BATCH_SIZE_B = 3;
const encodedA = encodedRecord(anchorTx, ANCHORED_ROOT, MINED_HEIGHT, BATCH_SIZE);
const encodedB = encodedRecord(anchorTxB, ANCHORED_ROOT_B, MINED_HEIGHT_B, BATCH_SIZE_B);

describe("selectResolverAnchorTxView env contract (G2 slice 6a)", () => {
  it("unset ONT_STORE -> undefined (no live read; /tx stays the hermetic 404)", () => {
    expect(selectResolverAnchorTxView({})).toBeUndefined();
  });

  it('ONT_STORE="memory" -> undefined', () => {
    expect(selectResolverAnchorTxView({ ONT_STORE: "memory" })).toBeUndefined();
  });

  it('ONT_STORE="file" + nonempty ONT_STORE_DIR -> an AnchorTxViewSource function', () => {
    expect(typeof selectResolverAnchorTxView({ ONT_STORE: "file", ONT_STORE_DIR: "/tmp/ont-x" })).toBe("function");
  });

  it('ONT_STORE="file" with missing ONT_STORE_DIR -> throws /ONT_STORE_DIR/ (fail closed)', () => {
    expect(() => selectResolverAnchorTxView({ ONT_STORE: "file" })).toThrow(/ONT_STORE_DIR/);
  });

  it('ONT_STORE="file" with empty ONT_STORE_DIR -> throws /ONT_STORE_DIR/ (no relative cwd files)', () => {
    expect(() => selectResolverAnchorTxView({ ONT_STORE: "file", ONT_STORE_DIR: "" })).toThrow(/ONT_STORE_DIR/);
  });

  it("unknown ONT_STORE -> throws /ONT_STORE/ (fail closed)", () => {
    expect(() => selectResolverAnchorTxView({ ONT_STORE: "postgres" })).toThrow(/ONT_STORE/);
  });

  it('ONT_STORE="" (empty) -> throws (fail closed, not normalized to memory)', () => {
    expect(() => selectResolverAnchorTxView({ ONT_STORE: "" })).toThrow(/ONT_STORE/);
  });

  it('ONT_STORE="FILE" (case variant) -> throws (exact match only)', () => {
    expect(() => selectResolverAnchorTxView({ ONT_STORE: "FILE", ONT_STORE_DIR: "/tmp/ont-x" })).toThrow(/ONT_STORE/);
  });
});

describe("selectResolverAnchorTxView file-mode read (G2 slice 6a)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-resolver-anchors-"));
    await writeFile(join(dir, "confirmed-anchors.json"), anchorsJson([encodedA]));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the ConfirmedAnchorTxView for a persisted anchor (fresh construction = read after restart)", async () => {
    const src = selectResolverAnchorTxView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected a source");
    const view = await src(ANCHOR_TXID);
    expect(view).not.toBeNull();
    expect(view?.minedHeight).toBe(MINED_HEIGHT);
    expect(view?.anchoredRoot).toBe(ANCHORED_ROOT);
    expect(view?.batchSize).toBe(BATCH_SIZE);
    expect(view && legacyTxidOf(view.anchorTx)).toBe(ANCHOR_TXID); // the persisted anchor tx round-tripped
  });

  it("returns null for an absent txid (read-only miss — no mint, no repair)", async () => {
    const src = selectResolverAnchorTxView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected a source");
    expect(await src("cd".repeat(32))).toBeNull();
  });
});

describe("resolver HTTP /tx is governed only by AnchorTxViewSource (G2 slice 6a boundary)", () => {
  // server.ts is untouched by 6a; the @ont/indexer dependency the selector adds is confined to live/* and never
  // reaches request handling. These pin that the /tx contract is the injected source alone (200 path is already
  // covered by tx-route.test.ts). Green at red.
  const emptyStore = {} as ResolverStore; // /tx never touches the name store

  it("no anchorTxView -> 404 (route fully governed by the injected source)", async () => {
    const res = await handleResolverRequest(new Request(`http://r.test/tx/${ANCHOR_TXID}`), { store: emptyStore });
    expect(res.status).toBe(404);
  });

  it("a throwing anchorTxView -> 503 (broken read surfaced, never indexer-coupled)", async () => {
    const anchorTxView: AnchorTxViewSource = async () => {
      throw new Error("boom");
    };
    const res = await handleResolverRequest(new Request(`http://r.test/tx/${ANCHOR_TXID}`), {
      store: emptyStore,
      anchorTxView,
    });
    expect(res.status).toBe(503);
  });
});

describe("selectResolverAnchorTxView freshness — option (b): fresh read per call (G2 slice 6a)", () => {
  // CL ruled (b): a long-running resolver must NOT snapshot at startup — it has to see anchors the indexer
  // persists after the source was built. One constructed source, read once while a txid is absent, then the
  // record is appended to confirmed-anchors.json; the SAME source must see it on a later call. A memoized store
  // instance fails this; a fresh-store-per-read (option b) passes. RED until the green selector reads per call.
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-resolver-fresh-"));
    await writeFile(join(dir, "confirmed-anchors.json"), anchorsJson([encodedA])); // B not yet persisted
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("the same source sees a record persisted AFTER its first read (no startup snapshot)", async () => {
    const src = selectResolverAnchorTxView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected a source");
    expect(await src(TXID_B)).toBeNull(); // B absent at first read
    // The indexer confirms a new anchor AFTER the resolver's source was built + first used.
    await writeFile(join(dir, "confirmed-anchors.json"), anchorsJson([encodedA, encodedB]));
    const view = await src(TXID_B); // SAME source — must reflect the new durable state (fresh per read)
    expect(view).not.toBeNull();
    expect(view?.minedHeight).toBe(MINED_HEIGHT_B);
    expect(view?.anchoredRoot).toBe(ANCHORED_ROOT_B);
    expect(view?.batchSize).toBe(BATCH_SIZE_B);
  });
});
