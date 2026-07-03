import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { encodeHeaderRecord } from "./header-record-codec.js";
import {
  createFileHeaderRangeStore,
  nodeFileStoreFs,
  type FileStoreFs,
} from "./file-header-range-store.js";

const H1 = "11".repeat(80);
const H2 = "22".repeat(80);
const H3 = "33".repeat(80);
const H4 = "44".repeat(80);

describe("createFileHeaderRangeStore", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-headers-"));
    path = join(dir, "headers.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("missing file -> empty store and unavailable ranges", async () => {
    const store = createFileHeaderRangeStore(path);
    await expect(store.has(311_446)).resolves.toBe(false);
    await expect(store.getRange(311_446, 1)).resolves.toBeNull();
  });

  it("persists and rehydrates exact contiguous ranges", async () => {
    const store = createFileHeaderRangeStore(path);
    await store.putMany([
      { height: 311_446, headerHex: H1 },
      { height: 311_447, headerHex: H2 },
      { height: 311_448, headerHex: H3 },
    ]);

    const restarted = createFileHeaderRangeStore(path);
    await expect(restarted.has(311_447)).resolves.toBe(true);
    await expect(restarted.getRange(311_446, 3)).resolves.toEqual([H1, H2, H3]);
  });

  it("returns null for any gap and never returns sparse/truncated ranges", async () => {
    const store = createFileHeaderRangeStore(path);
    await store.putMany([
      { height: 311_446, headerHex: H1 },
      { height: 311_448, headerHex: H3 },
    ]);

    await expect(store.getRange(311_446, 3)).resolves.toBeNull();
    await expect(store.getRange(311_446, 1)).resolves.toEqual([H1]);
  });

  it("is idempotent for identical headers and rejects conflicting headers", async () => {
    const store = createFileHeaderRangeStore(path);
    await store.put({ height: 311_446, headerHex: H1 });
    await expect(store.put({ height: 311_446, headerHex: H1 })).resolves.toBeUndefined();
    await expect(store.put({ height: 311_446, headerHex: H4 })).rejects.toThrow(/different header/i);
    await expect(store.getRange(311_446, 1)).resolves.toEqual([H1]);
  });

  it("fails closed on corrupt files and duplicate heights", async () => {
    await writeFile(path, "not json", "utf8");
    await expect(createFileHeaderRangeStore(path).has(1)).rejects.toThrow(/invalid header-range store file/i);

    await writeFile(
      path,
      JSON.stringify([
        encodeHeaderRecord({ height: 1, headerHex: H1 }),
        encodeHeaderRecord({ height: 1, headerHex: H1 }),
      ]),
      "utf8",
    );
    await expect(createFileHeaderRangeStore(path).has(1)).rejects.toThrow(/duplicate height/i);
  });

  it("fails closed on a non-ENOENT read error", async () => {
    const failingRead: FileStoreFs = {
      ...nodeFileStoreFs,
      readFile: () => Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" })),
    };
    await expect(createFileHeaderRangeStore(path, failingRead).has(1)).rejects.toThrow(/invalid header-range store file/i);
  });

  it("leaves no temp file after success", async () => {
    await createFileHeaderRangeStore(path).put({ height: 1, headerHex: H1 });
    await expect(readdir(dir)).resolves.toEqual(["headers.json"]);
  });

  it("a failed durable write keeps the last durable state in memory and on restart", async () => {
    await createFileHeaderRangeStore(path).put({ height: 1, headerHex: H1 });
    const failingWrite: FileStoreFs = {
      ...nodeFileStoreFs,
      writeFile: () => Promise.reject(new Error("ENOSPC simulated")),
    };
    const store = createFileHeaderRangeStore(path, failingWrite);
    await expect(store.put({ height: 2, headerHex: H2 })).rejects.toThrow(/ENOSPC/);
    await expect(store.getRange(1, 1)).resolves.toEqual([H1]);
    await expect(store.getRange(1, 2)).resolves.toBeNull();

    const restarted = createFileHeaderRangeStore(path);
    await expect(restarted.getRange(1, 1)).resolves.toEqual([H1]);
    await expect(restarted.getRange(1, 2)).resolves.toBeNull();
  });
});
