import { afterEach, describe, expect, it, vi } from "vitest";

import type { AvailabilityMode, LaunchParams } from "./params.js";

afterEach(() => {
  vi.doUnmock("./params.js");
  vi.resetModules();
});

describe("reduceBlock — §7.8 modeAt activation-boundary replay seam", () => {
  it("resolves availability mode at each block height, not the re-fold tip height", async () => {
    const observed: Array<{ height: number; mode: AvailabilityMode }> = [];
    const activationHeight = 200;
    const syntheticTip = 200;

    vi.doMock("./params.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./params.js")>();
      return {
        ...actual,
        modeAt: vi.fn((height: number, _params: LaunchParams): AvailabilityMode => {
          const mode = height < activationHeight ? "O1-collapsed" : "O2-in-band";
          observed.push({ height, mode });
          return mode;
        }),
      };
    });

    const { createEmptyState, reduceBlock } = await import("./engine.js");
    const state = createEmptyState();
    const params: LaunchParams = {
      launchHeight: 0,
      daWindow: { K: 3, W: 1, C: 1 },
      availabilityMode: "O1-collapsed",
    };
    const evidence = { batchMaterialByAnchor: new Map(), availabilityByAnchor: new Map() };

    for (const height of [199, syntheticTip]) {
      reduceBlock(state, { height, txs: [] }, evidence, params);
    }

    expect(observed).toEqual([
      { height: 199, mode: "O1-collapsed" },
      { height: 200, mode: "O2-in-band" },
    ]);
    expect(observed.map(({ height }) => height)).not.toEqual([syntheticTip, syntheticTip]);
  });
});
