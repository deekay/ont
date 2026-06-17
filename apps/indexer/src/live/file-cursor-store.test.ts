// @ont/indexer live — G2 slice 1 RED battery: durable FILE-backed IndexerCursorStore.
//
// Pins ChatLunatique's slice-1 contract (event f7c09334): missing file ⇒ genesis cursor; malformed /
// non-integer / negative height ⇒ fail closed; save→load round trip; restart reload over the same path (a
// NEW store instance reads the persisted height — the actual restart-survival property, not a process-global
// snapshot). Negative assertions match the impl's SPECIFIC reason strings so the generic not-implemented stub
// stays red for the right reason.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileIndexerCursorStore } from "./file-cursor-store.js";
import { nodeFileStoreFs, type FileStoreFs } from "./file-store-fs.js";

describe("createFileIndexerCursorStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-cursor-"));
    path = join(dir, "cursor.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("load() on a missing file returns the genesis cursor (height 0 by default)", async () => {
    const store = createFileIndexerCursorStore(path);
    await expect(store.load()).resolves.toEqual({ height: 0 });
  });

  it("load() on a missing file honors a configured genesis height", async () => {
    const store = createFileIndexerCursorStore(path, 840000);
    await expect(store.load()).resolves.toEqual({ height: 840000 });
  });

  it("save() then load() round-trips the cursor on the same instance", async () => {
    const store = createFileIndexerCursorStore(path);
    await store.save({ height: 12 });
    await expect(store.load()).resolves.toEqual({ height: 12 });
  });

  it("reloads the saved cursor across a restart (a fresh store over the same path)", async () => {
    const writer = createFileIndexerCursorStore(path);
    await writer.save({ height: 101 });
    const restarted = createFileIndexerCursorStore(path); // simulates a process restart
    await expect(restarted.load()).resolves.toEqual({ height: 101 });
  });

  it("last write wins on disk — save() overwrites a prior persisted cursor", async () => {
    const store = createFileIndexerCursorStore(path);
    await store.save({ height: 5 });
    await store.save({ height: 9 });
    const restarted = createFileIndexerCursorStore(path);
    await expect(restarted.load()).resolves.toEqual({ height: 9 });
  });

  it("fails closed on a malformed (non-JSON) cursor file", async () => {
    await writeFile(path, "not json {{{", "utf8");
    const store = createFileIndexerCursorStore(path);
    await expect(store.load()).rejects.toThrow(/invalid cursor file/i);
  });

  it("fails closed when the JSON is not an object carrying a height", async () => {
    await writeFile(path, JSON.stringify({ nope: 1 }), "utf8");
    const store = createFileIndexerCursorStore(path);
    await expect(store.load()).rejects.toThrow(/invalid cursor file/i);
  });

  it("fails closed on a non-integer height", async () => {
    await writeFile(path, JSON.stringify({ height: 1.5 }), "utf8");
    const store = createFileIndexerCursorStore(path);
    await expect(store.load()).rejects.toThrow(/non-negative integer/i);
  });

  it("fails closed on a string height (no coercion)", async () => {
    await writeFile(path, JSON.stringify({ height: "12" }), "utf8");
    const store = createFileIndexerCursorStore(path);
    await expect(store.load()).rejects.toThrow(/non-negative integer/i);
  });

  it("fails closed on a negative height", async () => {
    await writeFile(path, JSON.stringify({ height: -1 }), "utf8");
    const store = createFileIndexerCursorStore(path);
    await expect(store.load()).rejects.toThrow(/non-negative integer/i);
  });

  it("persists a canonical { height } JSON shape (no extra keys leak to disk)", async () => {
    const store = createFileIndexerCursorStore(path);
    await store.save({ height: 7 });
    const raw = await readFile(path, "utf8");
    expect(JSON.parse(raw)).toEqual({ height: 7 });
  });

  // ── atomic write retrofit (CL event a71ccd1e): same-dir temp + rename, durability-before-visibility ──
  it("leaves no same-dir temp file behind after a successful save", async () => {
    const store = createFileIndexerCursorStore(path);
    await store.save({ height: 5 });
    await expect(readdir(dir)).resolves.toEqual(["cursor.json"]);
  });

  it("a failed durable write preserves the last durable cursor (atomic temp + rename)", async () => {
    await createFileIndexerCursorStore(path).save({ height: 5 }); // durable { height: 5 }
    const failingRename: FileStoreFs = {
      ...nodeFileStoreFs,
      rename: () => Promise.reject(new Error("rename failed")),
    };
    const store = createFileIndexerCursorStore(path, 0, failingRename);
    await expect(store.save({ height: 9 })).rejects.toThrow();
    // the durable cursor is still 5 — a failed write must not corrupt it to 9
    await expect(createFileIndexerCursorStore(path).load()).resolves.toEqual({ height: 5 });
  });
});
