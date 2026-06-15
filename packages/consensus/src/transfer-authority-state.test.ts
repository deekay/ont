import { describe, expect, it } from "vitest";

import { transferAuthorityByState, type NameLifecycleState } from "./transfer-authority-state.js";

describe("transferAuthorityByState — X11 transfer authority requires an owned state", () => {
  it("admits a transfer only in the owned state", () => {
    expect(transferAuthorityByState({ nameLifecycleState: "owned" })).toEqual({
      transferable: true,
      reason: "x11-owned-transferable",
    });
  });

  it("refuses a transfer against every non-owned state (the X11 negative battery)", () => {
    for (const state of ["provisional", "live-auction", "nullified", "broken-bond", "nonexistent"] as const) {
      expect(transferAuthorityByState({ nameLifecycleState: state })).toEqual({
        transferable: false,
        reason: "x11-non-owned-state-no-transfer",
      });
    }
  });

  it("fails closed on an unknown state, a non-object, or an extra actor/signature/owner-key field", () => {
    expect(transferAuthorityByState({ nameLifecycleState: "recovery-pending" as never }).reason).toBe("x11-unknown-lifecycle-state");
    expect(transferAuthorityByState(null as never).transferable).toBe(false);
    // an extra signature/owner-key field cannot ride the boundary to grant authority
    expect(transferAuthorityByState({ nameLifecycleState: "nullified", signature: "ab".repeat(32) } as never)).toEqual({
      transferable: false,
      reason: "x11-input-malformed",
    });
    expect(transferAuthorityByState({ nameLifecycleState: "owned", ownerKey: "a".repeat(64) } as never).reason).toBe("x11-input-malformed");
  });

  it("is deterministic on identical inputs", () => {
    const i = { nameLifecycleState: "live-auction" as NameLifecycleState };
    expect(transferAuthorityByState(i)).toEqual(transferAuthorityByState(i));
  });
});
