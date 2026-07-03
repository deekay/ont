// @ont/resolver live — LE-RESOLVE battery: the env-selected read-only enforced name-state view source.
//
// Env semantics EXACTLY match selectResolverAnchorTxView / selectIndexerStores — unset/"memory" → undefined;
// "file" requires a nonempty ONT_STORE_DIR; unknown/empty/case-variant fail closed (no relative-cwd files). File
// mode reads name-state.json and returns the persisted NameStateRecord (or null), read-only (a fresh construction
// = a process restart) + freshness (b): a record persisted AFTER the source was built is seen on a later call.
// Plus a boundary guard: the HTTP /names/:name/state contract is governed entirely by the injected source.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import type { NameStateRecord } from "@ont/name-state-store";
import { handleResolverRequest, type NameStateViewSource, type ResolverStore } from "../server.js";
import { selectResolverNameStateView } from "./select-resolver-name-state-view.js";

// A valid on-disk NameStateRecord (the codec's exact shape; leaf key recomputed so getByName decodes it).
function record(name: string, ownerPair: string, rootByte: string, height: number): NameStateRecord {
  return {
    canonicalName: name,
    leafKeyHex: sha256Hex(utf8ToBytes(name)),
    owner: { kind: "owner-key", ownerPubkeyHex: ownerPair.repeat(32) },
    batchLocalIndex: 0,
    anchoredRoot: rootByte.repeat(32),
    anchor: { txid: "b".repeat(64), minedHeight: height, txIndex: 0, vout: 1 },
    firstServableHeight: height,
    trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
    proofBundle: { format: "ont-proof-bundle", proofSource: "accumulator_batch_claim", name },
  };
}
const REC_A = record("alice", "11", "7a", 170);
const REC_B = record("carol", "22", "5b", 202);
const nameStateJson = (recs: NameStateRecord[]): string => JSON.stringify(recs);

describe("selectResolverNameStateView env contract (LE-RESOLVE)", () => {
  it("unset ONT_STORE → undefined (no live read; /names/:name/state stays the hermetic 404)", () => {
    expect(selectResolverNameStateView({})).toBeUndefined();
  });

  it('ONT_STORE="memory" → undefined', () => {
    expect(selectResolverNameStateView({ ONT_STORE: "memory" })).toBeUndefined();
  });

  it('ONT_STORE="file" + nonempty ONT_STORE_DIR → a NameStateViewSource function', () => {
    expect(typeof selectResolverNameStateView({ ONT_STORE: "file", ONT_STORE_DIR: "/tmp/ont-x" })).toBe("function");
  });

  it('ONT_STORE="file" with missing ONT_STORE_DIR → throws /ONT_STORE_DIR/ (fail closed)', () => {
    expect(() => selectResolverNameStateView({ ONT_STORE: "file" })).toThrow(/ONT_STORE_DIR/);
  });

  it('ONT_STORE="file" with empty ONT_STORE_DIR → throws /ONT_STORE_DIR/ (no relative cwd files)', () => {
    expect(() => selectResolverNameStateView({ ONT_STORE: "file", ONT_STORE_DIR: "" })).toThrow(/ONT_STORE_DIR/);
  });

  it("unknown ONT_STORE → throws /ONT_STORE/ (fail closed)", () => {
    expect(() => selectResolverNameStateView({ ONT_STORE: "postgres" })).toThrow(/ONT_STORE/);
  });

  it('ONT_STORE="" (empty) → throws (fail closed, not normalized to memory)', () => {
    expect(() => selectResolverNameStateView({ ONT_STORE: "" })).toThrow(/ONT_STORE/);
  });

  it('ONT_STORE="FILE" (case variant) → throws (exact match only)', () => {
    expect(() => selectResolverNameStateView({ ONT_STORE: "FILE", ONT_STORE_DIR: "/tmp/ont-x" })).toThrow(/ONT_STORE/);
  });
});

describe("selectResolverNameStateView file-mode read (LE-RESOLVE)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-resolver-name-state-"));
    await writeFile(join(dir, "name-state.json"), nameStateJson([REC_A]));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the persisted NameStateRecord for a known name (fresh construction = read after restart)", async () => {
    const src = selectResolverNameStateView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected a source");
    expect(await src("alice")).toEqual(REC_A);
  });

  it("returns null for an absent name (read-only miss — no mint, no repair)", async () => {
    const src = selectResolverNameStateView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected a source");
    expect(await src("bob")).toBeNull();
  });
});

describe("selectResolverNameStateView freshness — option (b): fresh read per call (LE-RESOLVE)", () => {
  // A long-running resolver must NOT snapshot at startup — it has to see name-state the indexer persists after the
  // source was built. One constructed source, read once while a name is absent, then the record is appended; the
  // SAME source must see it. A memoized store instance fails this; a fresh-store-per-read (option b) passes.
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-resolver-name-state-fresh-"));
    await writeFile(join(dir, "name-state.json"), nameStateJson([REC_A])); // carol not yet persisted
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("the same source sees a record persisted AFTER its first read (no startup snapshot)", async () => {
    const src = selectResolverNameStateView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected a source");
    expect(await src("carol")).toBeNull(); // carol absent at first read
    // The indexer enforces a new accepted batch AFTER the resolver's source was built + first used.
    await writeFile(join(dir, "name-state.json"), nameStateJson([REC_A, REC_B]));
    expect(await src("carol")).toEqual(REC_B); // SAME source — reflects the new durable state (fresh per read)
  });
});

describe("resolver HTTP /names/:name/state is governed only by NameStateViewSource (LE-RESOLVE boundary)", () => {
  // server.ts request handling stays store-agnostic: the @ont/name-state-store dependency the selector adds is
  // confined to live/* and never reaches request handling. These pin that the route contract is the injected
  // source alone (the 200 + reason paths are covered by server.test.ts).
  const emptyStore = {} as ResolverStore; // the state route never touches the submission store

  it("no nameStateView → 404 (route fully governed by the injected source)", async () => {
    const res = await handleResolverRequest(new Request("http://r.test/names/alice/state"), { store: emptyStore });
    expect(res.status).toBe(404);
  });

  it("a throwing nameStateView → 503 (broken read surfaced, never indexer-coupled)", async () => {
    const nameStateView: NameStateViewSource = async () => {
      throw new Error("boom");
    };
    const res = await handleResolverRequest(new Request("http://r.test/names/alice/state"), { store: emptyStore, nameStateView });
    expect(res.status).toBe(503);
  });
});
