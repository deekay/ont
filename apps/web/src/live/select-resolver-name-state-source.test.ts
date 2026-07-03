import { describe, expect, it } from "vitest";
import { selectResolverNameStateSource } from "./select-resolver-name-state-source.js";

describe("selectResolverNameStateSource", () => {
  it("unset ONT_RESOLVER_URL -> undefined (hermetic default)", () => {
    expect(selectResolverNameStateSource({})).toBeUndefined();
  });

  it("present nonempty -> a ResolverNameStateSource function", () => {
    const src = selectResolverNameStateSource({ ONT_RESOLVER_URL: "http://resolver:8787" });
    expect(typeof src).toBe("function");
  });

  it("present empty -> throws /ONT_RESOLVER_URL/ (fail closed)", () => {
    expect(() => selectResolverNameStateSource({ ONT_RESOLVER_URL: "" })).toThrow(/ONT_RESOLVER_URL/);
  });

  it("present blank -> throws /ONT_RESOLVER_URL/", () => {
    expect(() => selectResolverNameStateSource({ ONT_RESOLVER_URL: "   " })).toThrow(/ONT_RESOLVER_URL/);
  });
});
