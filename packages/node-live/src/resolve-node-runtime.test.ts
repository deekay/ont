// Slice 4b red battery — resolveNodeRuntime (go-live env reader).
// Pins CL's watches: unset ONT_SOURCE → memory downstream (source undefined); ONT_SOURCE=""
// preserved (not coerced to unset, so the selector rejects it); node mode requires an RPC URL
// before selection can reach live; chain + rpc creds read through; username/password omitted
// when absent. RED until implemented.
import { describe, expect, it } from "vitest";
import { resolveNodeRuntime } from "./index.js";

describe("resolveNodeRuntime (G1 slice 4b)", () => {
  it("unset ONT_SOURCE → source undefined (memory default downstream)", () => {
    const out = resolveNodeRuntime({});
    expect(out.source).toBeUndefined();
    expect(out.chain).toBeUndefined();
    expect(out.rpc.url).toBe("");
  });

  it("ONT_SOURCE='' is preserved, NOT coerced to unset", () => {
    expect(resolveNodeRuntime({ ONT_SOURCE: "" }).source).toBe("");
  });

  it("memory mode tolerates a missing RPC url", () => {
    const out = resolveNodeRuntime({ ONT_SOURCE: "memory" });
    expect(out.source).toBe("memory");
    expect(out.rpc.url).toBe("");
  });

  it("node mode requires ONT_RPC_URL — missing OR empty (the deployment footgun) fails closed", () => {
    expect(() => resolveNodeRuntime({ ONT_SOURCE: "node", ONT_CHAIN: "regtest" })).toThrow(/ONT_RPC_URL/);
    expect(() => resolveNodeRuntime({ ONT_SOURCE: "node", ONT_CHAIN: "regtest", ONT_RPC_URL: "" })).toThrow(/ONT_RPC_URL/);
  });

  it("node mode rejects ONT_RPC_PASSWORD without ONT_RPC_USER (else auth is silently dropped)", () => {
    expect(() =>
      resolveNodeRuntime({ ONT_SOURCE: "node", ONT_CHAIN: "regtest", ONT_RPC_URL: "http://127.0.0.1:18443", ONT_RPC_PASSWORD: "p" }),
    ).toThrow(/password requires.*username|username/);
  });

  it("node mode reads chain + rpc url/user/password", () => {
    const out = resolveNodeRuntime({
      ONT_SOURCE: "node",
      ONT_CHAIN: "regtest",
      ONT_RPC_URL: "http://127.0.0.1:18443",
      ONT_RPC_USER: "u",
      ONT_RPC_PASSWORD: "p",
    });
    expect(out.source).toBe("node");
    expect(out.chain).toBe("regtest");
    expect(out.rpc).toEqual({ url: "http://127.0.0.1:18443", username: "u", password: "p" });
  });

  it("omits username/password when their env vars are absent", () => {
    const out = resolveNodeRuntime({ ONT_SOURCE: "node", ONT_CHAIN: "regtest", ONT_RPC_URL: "http://127.0.0.1:18443" });
    expect(out.rpc).toEqual({ url: "http://127.0.0.1:18443" });
  });
});
