// @ont/resolver — G2 slice 4b RED battery: read-only GET /tx/:txid over an injected confirmed-anchor view source.
//
// Pins CL's 4b contract (event 2a405a64): the resolver server is generic over
// anchorTxView(txid): Promise<ConfirmedAnchorTxView | null> (the @ont/adapter-resolver type — never the indexer
// record/file store). GET /tx/:txid: source miss → 404; projection returns null (inconsistent anchor) →
// CLEAN 404; projection succeeds → 200 ServedTx. Read-only: no mint, no put, no creation path. Plus the
// dependency guard: the resolver package must not import from apps/indexer. RED until serveConfirmedTx is real.
import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";
import type { ConfirmedAnchorTxView } from "@ont/adapter-resolver";
import { handleResolverRequest, createInMemoryResolverStore, type AnchorTxViewSource } from "./server.js";

const h32 = (n: number): string => n.toString(16).padStart(2, "0").repeat(32);
const NEW_ROOT = h32(0x7a);
const payloadHexOf = (p: Uint8Array): string => Buffer.from(p).toString("hex");
const opReturnScriptFor = (p: Uint8Array): string =>
  "6a" + p.length.toString(16).padStart(2, "0") + payloadHexOf(p);

const anchorPayload = encodeEvent({ type: EventType.RootAnchor, prevRoot: h32(0xbb), newRoot: NEW_ROOT, batchSize: 5 });
const anchorScript = opReturnScriptFor(anchorPayload);
const anchorTx: LegacyTransaction = {
  version: 2,
  inputs: [{ prevoutTxid: h32(0xa1), prevoutVout: 0, scriptSigHex: "", sequence: 0xffffffff }],
  outputs: [{ valueSats: 0n, scriptPubKeyHex: anchorScript }],
  locktime: 0,
};
const TXID = (() => {
  const t = legacyTxidOf(anchorTx);
  if (!t) throw new Error("fixture txid");
  return t;
})();
const validView: ConfirmedAnchorTxView = { anchorTx, minedHeight: 101, anchoredRoot: NEW_ROOT, batchSize: 5 };
const inconsistentView: ConfirmedAnchorTxView = { ...validView, anchoredRoot: h32(0x99) }; // newRoot ≠ anchoredRoot

const store = createInMemoryResolverStore();
const opts = (anchorTxView?: AnchorTxViewSource) => ({ store, ...(anchorTxView ? { anchorTxView } : {}) });
const txReq = (txid: string, method = "GET") => new Request(`http://res/tx/${txid}`, { method });

describe("GET /tx/:txid (G2 slice 4b)", () => {
  it("200 + ServedTx for a confirmed anchor view", async () => {
    const res = await handleResolverRequest(txReq(TXID), opts(async (id) => (id === TXID ? validView : null)));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { txid: string; blockHeight: number; carrierPayloadHex: string };
    expect(body.txid).toBe(TXID);
    expect(body.blockHeight).toBe(101);
    expect(body.carrierPayloadHex).toBe(payloadHexOf(anchorPayload));
  });

  it("404 when the source has no such tx (clean not-found, no creation)", async () => {
    const res = await handleResolverRequest(txReq("ab".repeat(32)), opts(async () => null));
    expect(res.status).toBe(404);
  });

  it("404 (clean not-found) when the anchor is inconsistent and the projection returns null", async () => {
    const res = await handleResolverRequest(txReq(TXID), opts(async () => inconsistentView));
    expect(res.status).toBe(404);
  });

  it("404 when no anchorTxView read source is configured", async () => {
    const res = await handleResolverRequest(txReq(TXID), opts());
    expect(res.status).toBe(404);
  });

  it("405 for a non-GET method (read-only — no creation path on /tx)", async () => {
    const res = await handleResolverRequest(txReq(TXID, "POST"), opts(async () => validView));
    expect(res.status).toBe(405);
  });

  it("the resolver package never imports from apps/indexer (composition stays in the harness)", async () => {
    const srcDir = dirname(fileURLToPath(import.meta.url));
    const files = (await readdir(srcDir)).filter((f) => f.endsWith(".ts"));
    for (const file of files) {
      const content = await readFile(join(srcDir, file), "utf8");
      expect(content).not.toMatch(/from\s+["'][^"']*(?:apps\/indexer|@ont\/indexer)/);
    }
  });
});
