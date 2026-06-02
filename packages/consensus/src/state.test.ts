import { describe, expect, it } from "vitest";

import { BOND_MATURITY_BLOCKS, getBondSats } from "@ont/protocol";

import { createClaimState } from "./state.js";

describe("claim state constants", () => {
  it("uses the fixed current bond maturity instead of the retired epoch schedule", () => {
    const claim = createClaimState({ name: "alice", claimHeight: 100, epochIndex: 99 });

    expect(claim).toMatchObject({
      name: "alice",
      claimHeight: 100,
      maturityHeight: 100 + BOND_MATURITY_BLOCKS,
      requiredBondSats: getBondSats("alice".length)
    });
  });
});
