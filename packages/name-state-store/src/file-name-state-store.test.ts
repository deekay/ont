import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NameStateRecord } from "./record.js";
import { createFileNameStateStore, type FileStoreFs, nodeFileStoreFs } from "./file-name-state-store.js";

function recordFor(name: string, ownerByte: string): NameStateRecord {
  return {
    canonicalName: name,
    leafKeyHex: "a".repeat(64),
    owner: { kind: "owner-key", ownerPubkeyHex: ownerByte.repeat(64) },
    batchLocalIndex: 0,
    anchoredRoot: "7".repeat(64),
    anchor: { txid: "b".repeat(64), minedHeight: 170, txIndex: 0, vout: 1 },
    firstServableHeight: 170,
    trace: [{ step: "verdict", ok: true, reason: "accept" }],
  };
}

describe("createFileNameStateStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-name-state-"));
    filePath = join(dir, "name-state.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("a missing file is an empty store (clean start)", async () => {
    const store = createFileNameStateStore(filePath);
    expect(await store.has("alice")).toBe(false);
    expect(await store.getByName("alice")).toBeNull();
  });

  it("put then has/getByName returns the record", async () => {
    const store = createFileNameStateStore(filePath);
    const rec = recordFor("alice", "1");
    await store.put(rec);
    expect(await store.has("alice")).toBe(true);
    expect(await store.getByName("alice")).toEqual(rec);
  });

  it("put is replace-by-canonicalName (a re-accepted name replaces)", async () => {
    const store = createFileNameStateStore(filePath);
    await store.put(recordFor("alice", "1"));
    const replacement = recordFor("alice", "2");
    await store.put(replacement);
    expect(await store.getByName("alice")).toEqual(replacement);
  });

  it("persists across a fresh store over the same dir (durable)", async () => {
    const writer = createFileNameStateStore(filePath);
    await writer.put(recordFor("alice", "1"));
    await writer.put(recordFor("bob", "2"));

    const reader = createFileNameStateStore(filePath); // fresh hydrate from disk
    expect(await reader.getByName("alice")).toEqual(recordFor("alice", "1"));
    expect(await reader.getByName("bob")).toEqual(recordFor("bob", "2"));
  });

  it("fails closed on a non-JSON file", async () => {
    await writeFile(filePath, "not json", "utf8");
    const store = createFileNameStateStore(filePath);
    await expect(store.has("alice")).rejects.toThrow(/invalid name-state store file/);
  });

  it("fails closed on a duplicate canonicalName in the file", async () => {
    const dup = JSON.stringify([recordFor("alice", "1"), recordFor("alice", "2")]);
    await writeFile(filePath, dup, "utf8");
    const store = createFileNameStateStore(filePath);
    await expect(store.getByName("alice")).rejects.toThrow(/duplicate canonicalName/);
  });

  it("fails closed on an undecodable record in the file", async () => {
    await writeFile(filePath, JSON.stringify([{ canonicalName: "alice" }]), "utf8");
    const store = createFileNameStateStore(filePath);
    await expect(store.has("alice")).rejects.toThrow(/invalid name-state store file/);
  });

  it("writes atomically: temp file then rename (no partial final file)", async () => {
    const calls: string[] = [];
    const spyFs: FileStoreFs = {
      readFile: nodeFileStoreFs.readFile,
      mkdir: async (p) => { calls.push(`mkdir ${p}`); await nodeFileStoreFs.mkdir(p); },
      writeFile: async (p, d) => { calls.push(`write ${p.endsWith(".tmp") ? "tmp" : "final"}`); await nodeFileStoreFs.writeFile(p, d); },
      rename: async (a, b) => { calls.push(`rename ${a.endsWith(".tmp") ? "tmp" : "?"}→final`); await nodeFileStoreFs.rename(a, b); },
    };
    const store = createFileNameStateStore(filePath, spyFs);
    await store.put(recordFor("alice", "1"));
    // The temp is written, THEN renamed over the final file — never a direct write to the final path.
    expect(calls).toEqual(["mkdir " + dir, "write tmp", "rename tmp→final"]);
    expect(JSON.parse(await readFile(filePath, "utf8"))).toHaveLength(1);
  });

  it("a write failure leaves the last durable state (durability-before-visibility)", async () => {
    const store = createFileNameStateStore(filePath);
    await store.put(recordFor("alice", "1")); // durable

    const failingFs: FileStoreFs = {
      ...nodeFileStoreFs,
      writeFile: async () => { throw new Error("disk full"); },
    };
    const sameDirStore = createFileNameStateStore(filePath, failingFs);
    await expect(sameDirStore.put(recordFor("bob", "2"))).rejects.toThrow(/disk full/);
    // alice (the last durable write) is intact; bob never landed.
    const reader = createFileNameStateStore(filePath);
    expect(await reader.getByName("alice")).toEqual(recordFor("alice", "1"));
    expect(await reader.has("bob")).toBe(false);
  });
});
