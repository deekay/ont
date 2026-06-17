import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FilePublisherStore, InMemoryPublisherStore } from "./store.js";

describe("FilePublisherStore", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ont-publisher-store-"));
    path = join(dir, "state.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns null when the file does not exist yet", async () => {
    const store = new FilePublisherStore(path);
    expect(await store.load()).toBeNull();
  });

  it("round-trips a snapshot", async () => {
    const store = new FilePublisherStore(path);
    await store.save({ hello: "world", n: 42 });
    expect(await store.load()).toEqual({ hello: "world", n: 42 });
  });

  it("rejects a file with an unexpected format", async () => {
    const store = new FilePublisherStore(path);
    await store.save({ hello: "world" });
    // Corrupt the format
    const { readFileSync, writeFileSync } = await import("node:fs");
    const text = readFileSync(path, "utf8").replace("ont-publisher-state", "something-else");
    writeFileSync(path, text, "utf8");
    await expect(store.load()).rejects.toThrow(/format/);
  });
});

describe("InMemoryPublisherStore", () => {
  it("returns null initially, then the saved snapshot", async () => {
    const store = new InMemoryPublisherStore();
    expect(await store.load()).toBeNull();
    await store.save({ thing: 1 });
    expect(await store.load()).toEqual({ thing: 1 });
  });
});
