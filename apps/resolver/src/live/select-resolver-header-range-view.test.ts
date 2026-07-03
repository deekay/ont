import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { encodeHeaderRecord } from "@ont/header-store";
import { handleResolverRequest, type HeaderRangeViewSource, type ResolverStore } from "../server.js";
import { selectResolverHeaderRangeView } from "./select-resolver-header-range-view.js";

const H1 = "11".repeat(80);
const H2 = "22".repeat(80);
const H3 = "33".repeat(80);
const headerJson = (records: readonly { readonly height: number; readonly headerHex: string }[]): string =>
  JSON.stringify(records.map(encodeHeaderRecord));

describe("selectResolverHeaderRangeView env contract", () => {
  it("unset/memory ONT_STORE -> undefined", () => {
    expect(selectResolverHeaderRangeView({})).toBeUndefined();
    expect(selectResolverHeaderRangeView({ ONT_STORE: "memory" })).toBeUndefined();
  });

  it("file mode requires ONT_STORE_DIR and unknown values fail closed", () => {
    expect(typeof selectResolverHeaderRangeView({ ONT_STORE: "file", ONT_STORE_DIR: "/tmp/ont-x" })).toBe("function");
    expect(() => selectResolverHeaderRangeView({ ONT_STORE: "file" })).toThrow(/ONT_STORE_DIR/);
    expect(() => selectResolverHeaderRangeView({ ONT_STORE: "file", ONT_STORE_DIR: "" })).toThrow(/ONT_STORE_DIR/);
    expect(() => selectResolverHeaderRangeView({ ONT_STORE: "" })).toThrow(/ONT_STORE/);
    expect(() => selectResolverHeaderRangeView({ ONT_STORE: "FILE", ONT_STORE_DIR: "/tmp/ont-x" })).toThrow(/ONT_STORE/);
  });
});

describe("selectResolverHeaderRangeView file-mode read", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ont-resolver-headers-"));
    await writeFile(join(dir, "headers.json"), headerJson([
      { height: 311_446, headerHex: H1 },
      { height: 311_447, headerHex: H2 },
    ]));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns exact contiguous ranges and null for gaps", async () => {
    const src = selectResolverHeaderRangeView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected source");

    await expect(src(311_446, 2)).resolves.toEqual([H1, H2]);
    await expect(src(311_446, 3)).resolves.toBeNull();
  });

  it("the same source sees headers persisted after an earlier miss", async () => {
    const src = selectResolverHeaderRangeView({ ONT_STORE: "file", ONT_STORE_DIR: dir });
    if (!src) throw new Error("expected source");

    await expect(src(311_446, 3)).resolves.toBeNull();
    await writeFile(join(dir, "headers.json"), headerJson([
      { height: 311_446, headerHex: H1 },
      { height: 311_447, headerHex: H2 },
      { height: 311_448, headerHex: H3 },
    ]));
    await expect(src(311_446, 3)).resolves.toEqual([H1, H2, H3]);
  });
});

describe("resolver HTTP /bitcoin/header-range is governed only by HeaderRangeViewSource", () => {
  const emptyStore = {} as ResolverStore;

  it("no headerRangeView -> unavailable", async () => {
    const res = await handleResolverRequest(
      new Request("http://r.test/bitcoin/header-range?startHeight=1&count=1"),
      { store: emptyStore },
    );
    expect(res.status).toBe(404);
  });

  it("a throwing headerRangeView -> 503", async () => {
    const headerRangeView: HeaderRangeViewSource = async () => {
      throw new Error("boom");
    };
    const res = await handleResolverRequest(
      new Request("http://r.test/bitcoin/header-range?startHeight=1&count=1"),
      { store: emptyStore, headerRangeView },
    );
    expect(res.status).toBe(503);
  });
});
