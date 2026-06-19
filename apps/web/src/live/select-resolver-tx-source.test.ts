// @ont/web live — G2 slice 5b-2 RED battery: the main env selector for the live resolver tx source.
//
// Pins the env contract concurred by CL (5b-2 concur): unset ONT_RESOLVER_URL -> undefined (hermetic default);
// present nonempty -> a usable ResolverTxSource (createResolverTxSource(url)); present empty/blank -> THROW
// /ONT_RESOLVER_URL/ (fail closed — empty is NOT normalized to absent, and no relative `/tx` fetch is allowed).
// RED until selectResolverTxSource is implemented (the stub throws not-implemented, so every case is red).
import { describe, expect, it } from "vitest";
import { selectResolverTxSource } from "./select-resolver-tx-source.js";

describe("selectResolverTxSource (G2 slice 5b-2)", () => {
  it("unset ONT_RESOLVER_URL -> undefined (hermetic default, no live source)", () => {
    expect(selectResolverTxSource({})).toBeUndefined();
  });

  it("present nonempty -> a ResolverTxSource function", () => {
    const src = selectResolverTxSource({ ONT_RESOLVER_URL: "http://resolver:8787" });
    expect(typeof src).toBe("function");
  });

  it("present empty -> throws /ONT_RESOLVER_URL/ (fail closed, never normalized to absent)", () => {
    expect(() => selectResolverTxSource({ ONT_RESOLVER_URL: "" })).toThrow(/ONT_RESOLVER_URL/);
  });

  it("present blank (whitespace-only) -> throws /ONT_RESOLVER_URL/ (no relative /tx fetch slips through)", () => {
    expect(() => selectResolverTxSource({ ONT_RESOLVER_URL: "   " })).toThrow(/ONT_RESOLVER_URL/);
  });
});
