import { describe, expect, it } from "vitest";
import { assembleRecoverOwnerInvokeTx, assembleRootAnchorTx } from "@ont/adapter-publisher";
import { legacyTxidOf, parseLegacyTransaction, serializeLegacyTransaction, type LegacyTransaction } from "@ont/bitcoin";
import { handlePublisherRequest, type PublisherBroadcastPort } from "./server.js";

const ROOT_A = "0a".repeat(32);
const ROOT_B = "ab".repeat(32);
const TXID_A = "11".repeat(32);
const TXID_B = "22".repeat(32);
const PUBKEY = "cd".repeat(32);
const SIG = "ef".repeat(64);

function rootAnchorInput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    prevRoot: ROOT_A,
    newRoot: ROOT_B,
    batchSize: 2,
    fundingInputs: [{ prevoutTxid: TXID_A, prevoutVout: 0 }],
    changeOutput: { valueSats: "50000", scriptPubKeyHex: "51" },
    ...over,
  };
}

function recoverInvokeInput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    prevStateTxid: TXID_B,
    newOwnerPubkey: PUBKEY,
    flags: 0,
    successorBondVout: 1,
    challengeWindowBlocks: 144,
    recoveryDescriptorHash: ROOT_A,
    signature: SIG,
    fundingInputs: [{ prevoutTxid: TXID_A, prevoutVout: 0 }],
    changeOutput: { valueSats: "25000", scriptPubKeyHex: "51" },
    ...over,
  };
}

function request(path: string, body: unknown, method = "POST"): Request {
  return new Request(`http://publisher.test${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function broadcastFixture(result = { ok: true as const, txid: TXID_B }) {
  const seen: LegacyTransaction[] = [];
  const port: PublisherBroadcastPort = {
    async broadcast(tx) {
      seen.push(tx);
      return result;
    },
  };
  return { port, seen };
}

// A legacy-serializable raw tx hex for the /broadcast tests. The publisher never inspects signedness — it
// relays whatever legacy raw it is handed — so this fixture being unsigned-shaped (empty scriptSigs) is fine;
// it exercises the relay path, not a signedness check. An operator POSTs the externally-signed raw in practice.
function legacyRawHex(): { hex: string; tx: LegacyTransaction; txid: string } {
  const tx = assembleRootAnchorTx({ ...rootAnchorInput(), changeOutput: { valueSats: 50000n, scriptPubKeyHex: "51" } });
  if (tx === null) throw new Error("fixture: assembleRootAnchorTx returned null");
  const bytes = serializeLegacyTransaction(tx);
  if (bytes === null) throw new Error("fixture: serializeLegacyTransaction returned null");
  const txid = legacyTxidOf(tx);
  if (txid === null) throw new Error("fixture: legacyTxidOf returned null");
  return { hex: Buffer.from(bytes).toString("hex"), tx, txid };
}

describe("publisher service — HTTP shell (assemble / broadcast split)", () => {
  it("GET /health returns running status", async () => {
    const { port } = broadcastFixture();
    const res = await handlePublisherRequest(new Request("http://publisher.test/health"), { broadcast: port });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "@ont/publisher" });
  });

  it("POST /assemble/root-anchor returns the unsigned tx and NEVER broadcasts", async () => {
    const { port, seen } = broadcastFixture();
    const input = rootAnchorInput();
    const res = await handlePublisherRequest(request("/assemble/root-anchor", input), { broadcast: port });
    expect(res.status).toBe(200);
    const assembled = assembleRootAnchorTx({ ...input, changeOutput: { valueSats: 50000n, scriptPubKeyHex: "51" } });
    expect(assembled).not.toBeNull();
    const expectedHex = Buffer.from(serializeLegacyTransaction(assembled!)!).toString("hex");
    expect(await res.json()).toEqual({ ok: true, unsignedTxid: legacyTxidOf(assembled!), unsignedTxHex: expectedHex });
    // STRUCTURAL SAFETY: the assemble path cannot reach the broadcast seam.
    expect(seen).toEqual([]);
  });

  it("POST /assemble/recover-owner-invoke returns the unsigned tx and NEVER broadcasts", async () => {
    const { port, seen } = broadcastFixture();
    const input = recoverInvokeInput();
    const res = await handlePublisherRequest(request("/assemble/recover-owner-invoke", input), { broadcast: port });
    expect(res.status).toBe(200);
    const assembled = assembleRecoverOwnerInvokeTx({ ...input, changeOutput: { valueSats: 25000n, scriptPubKeyHex: "51" } });
    expect(assembled).not.toBeNull();
    const expectedHex = Buffer.from(serializeLegacyTransaction(assembled!)!).toString("hex");
    expect(await res.json()).toEqual({ ok: true, unsignedTxid: legacyTxidOf(assembled!), unsignedTxHex: expectedHex });
    expect(seen).toEqual([]);
  });

  it("invalid operator intent fails closed at assembly", async () => {
    const { port, seen } = broadcastFixture();
    const res = await handlePublisherRequest(
      request("/assemble/root-anchor", rootAnchorInput({ newRoot: ROOT_B.toUpperCase() })),
      { broadcast: port }
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, reason: "invalid-root-anchor" });
    expect(seen).toEqual([]);
  });

  it("POST /broadcast relays a legacy raw verbatim through the port", async () => {
    const { port, seen } = broadcastFixture({ ok: true as const, txid: TXID_B });
    const { hex, tx } = legacyRawHex();
    const res = await handlePublisherRequest(request("/broadcast", { signedTxHex: hex }), { broadcast: port });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, txid: TXID_B });
    expect(seen).toEqual([parseLegacyTransaction(hex)]);
    expect(seen[0]).toEqual(tx);
  });

  it("POST /broadcast fails closed on a non-legacy raw before the port is touched", async () => {
    const { port, seen } = broadcastFixture();
    const res = await handlePublisherRequest(request("/broadcast", { signedTxHex: "00ff" }), { broadcast: port });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, reason: "tx-not-legacy" });
    expect(seen).toEqual([]);
  });

  it("POST /broadcast surfaces port reject and throw without echoing tx bytes", async () => {
    const { hex } = legacyRawHex();
    const reject = await handlePublisherRequest(request("/broadcast", { signedTxHex: hex }), {
      broadcast: broadcastFixture({ ok: false, reason: "mempool-reject" }).port,
    });
    expect(reject.status).toBe(502);
    expect(await reject.json()).toEqual({ ok: false, reason: "mempool-reject" });

    const throwing: PublisherBroadcastPort = {
      async broadcast() {
        throw new Error("down");
      },
    };
    const unavailable = await handlePublisherRequest(request("/broadcast", { signedTxHex: hex }), { broadcast: throwing });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ ok: false, reason: "broadcast-unavailable" });
  });

  it("bad JSON, unsupported methods, and unknown routes return JSON errors", async () => {
    const { port } = broadcastFixture();
    const badJson = await handlePublisherRequest(
      new Request("http://publisher.test/assemble/root-anchor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      { broadcast: port }
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ ok: false, reason: "bad-json" });

    const method = await handlePublisherRequest(new Request("http://publisher.test/broadcast"), { broadcast: port });
    expect(method.status).toBe(405);
    expect(await method.json()).toEqual({ ok: false, reason: "method-not-allowed" });

    const unknown = await handlePublisherRequest(new Request("http://publisher.test/unknown"), { broadcast: port });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ ok: false, reason: "not-found" });
  });
});
