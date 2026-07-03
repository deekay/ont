import { describe, expect, it } from "vitest";
import type { ServedNameStateResult } from "@ont/adapter-resolver";
import { createResolverNameStateSource } from "./resolver-name-state-source.js";

const BASE = "http://resolver:8787";
const served: Extract<ServedNameStateResult, { readonly ok: true }> = {
  ok: true,
  canonicalName: "alice",
  owner: { kind: "owner-key", ownerPubkeyHex: "22".repeat(32) },
  leafKeyHex: "2bd806c97f0e00af1a1fc3328fa763a9269723c8db8fac4f93af71db186d6e90",
  batchLocalIndex: 0,
  anchoredRoot: "f93b90c055208630762382e331ef07f3be22df520a7ab7e4ff54707b599839b8",
  anchor: {
    txid: "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16",
    minedHeight: 170,
    txIndex: 1,
    vout: 0,
  },
  firstServableHeight: 170,
  trace: [{ step: "verdict", ok: true, reason: "batched-claim-accepted" }],
  proofBundle: { format: "ont-proof-bundle", proofSource: "accumulator_batch_claim" },
  provenance: "resolver-indexed-mirror",
  authority: "not-ownership-authority",
};

const fetchOf = (handler: (input: RequestInfo | URL) => Promise<Response>): typeof fetch =>
  handler as unknown as typeof fetch;

describe("createResolverNameStateSource", () => {
  it("200 + valid ok:true ServedNameStateResult -> returns the served state", async () => {
    let url = "";
    const f = fetchOf(async (input) => {
      url = String(input);
      return new Response(JSON.stringify(served), { status: 200 });
    });
    await expect(createResolverNameStateSource(BASE, f)("alice")).resolves.toEqual(served);
    expect(url).toBe(`${BASE}/names/alice/state`);
  });

  it("404 -> null (absent/not served)", async () => {
    const f = fetchOf(async () => new Response("", { status: 404 }));
    await expect(createResolverNameStateSource(BASE, f)("bob")).resolves.toBeNull();
  });

  it("409 corrupt mirror -> throws, never null", async () => {
    const f = fetchOf(async () => new Response(JSON.stringify({ ok: false, reason: "invalid-record" }), { status: 409 }));
    await expect(createResolverNameStateSource(BASE, f)("alice")).rejects.toThrow(/resolver name-state read failed/i);
  });

  it("503 store unavailable -> throws, never null", async () => {
    const f = fetchOf(async () => new Response(JSON.stringify({ ok: false, reason: "store-unavailable" }), { status: 503 }));
    await expect(createResolverNameStateSource(BASE, f)("alice")).rejects.toThrow(/resolver name-state read failed/i);
  });

  it("malformed 200 (wrong ok:true shape) -> throws", async () => {
    const f = fetchOf(async () => new Response(JSON.stringify({ ok: true, canonicalName: "alice" }), { status: 200 }));
    await expect(createResolverNameStateSource(BASE, f)("alice")).rejects.toThrow(/malformed|resolver name-state read failed/i);
  });
});
