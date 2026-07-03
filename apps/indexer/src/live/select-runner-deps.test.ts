import { describe, expect, it } from "vitest";
import { createInMemoryHeaderRangeStore, type HeaderRangeStore } from "@ont/header-store";
import { backfillIndexerHeaderRange } from "./select-runner-deps.js";
import type { IndexerHeaderSource } from "./select-block-source.js";
import { createInMemoryIndexerCursorStore } from "../runner.js";

const H1 = "11".repeat(80);
const H2 = "22".repeat(80);
const H3 = "33".repeat(80);

describe("backfillIndexerHeaderRange", () => {
  it("backfills checkpoint-forward headers through the loaded cursor and skips already persisted heights", async () => {
    const cursorStore = createInMemoryIndexerCursorStore(3);
    const headerStore = createInMemoryHeaderRangeStore([{ height: 1, headerHex: H1 }]);
    const calls: number[] = [];
    const headers = new Map([
      [2, H2],
      [3, H3],
    ]);
    const headerSource: IndexerHeaderSource = {
      headerAtHeight: async (height) => {
        calls.push(height);
        const headerHex = headers.get(height);
        if (headerHex === undefined) throw new Error(`missing fixture header ${height}`);
        return { height, headerHex };
      },
    };

    await backfillIndexerHeaderRange({ cursorStore, headerStore, headerSource, startHeight: 1 });

    expect(calls).toEqual([2, 3]);
    await expect(headerStore.getRange(1, 3)).resolves.toEqual([H1, H2, H3]);
    await expect(cursorStore.load()).resolves.toEqual({ height: 3 });
  });

  it("propagates header-store persist failure before any cursor mutation", async () => {
    const cursorStore = createInMemoryIndexerCursorStore(2);
    const headerStore: HeaderRangeStore = {
      has: () => Promise.resolve(false),
      put: () => Promise.reject(new Error("persist failed")),
      putMany: () => Promise.reject(new Error("persist failed")),
      getRange: () => Promise.resolve(null),
    };
    const headerSource: IndexerHeaderSource = {
      headerAtHeight: async (height) => ({ height, headerHex: height === 1 ? H1 : H2 }),
    };

    await expect(backfillIndexerHeaderRange({
      cursorStore,
      headerStore,
      headerSource,
      startHeight: 1,
    })).rejects.toThrow(/persist failed/);
    await expect(cursorStore.load()).resolves.toEqual({ height: 2 });
  });
});
