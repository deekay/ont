import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  assembleRecoverOwnerInvokeTx,
  assembleRootAnchorTx,
  type AssembleRecoverOwnerInvokeInput,
  type AssembleRootAnchorInput,
} from "@ont/adapter-publisher";
import { isHex64Lower, type DaRecordStore } from "@ont/adapter-da";
import {
  legacyTxidOf,
  parseLegacyTransaction,
  serializeLegacyTransaction,
  type LegacyTransaction,
} from "@ont/bitcoin";

export type PublisherBroadcastResult =
  | { readonly ok: true; readonly txid: string }
  | { readonly ok: false; readonly reason: string };

export interface PublisherBroadcastPort {
  broadcast(tx: LegacyTransaction): Promise<PublisherBroadcastResult>;
}

export interface PublisherServiceOptions {
  readonly broadcast: PublisherBroadcastPort;
  readonly daRecordSource?: DaRecordStore | undefined;
}

export function createInMemoryPublisherBroadcastPort(): PublisherBroadcastPort {
  const seen = new Map<string, LegacyTransaction>();
  return {
    async broadcast(tx) {
      const txid = legacyTxidOf(tx);
      if (txid === null) return { ok: false, reason: "tx-not-serializable" };
      seen.set(txid, tx);
      return { ok: true, txid };
    },
  };
}

// The HTTP seam is split so the assemble path can NEVER reach the broadcast port:
//   POST /assemble/root-anchor          -> assemble an UNSIGNED tx, return it; no broadcast.
//   POST /assemble/recover-owner-invoke -> assemble an UNSIGNED tx, return it; no broadcast.
//   POST /broadcast                     -> relay an already-signed legacy raw through the broadcast port.
// Signing happens off this service (B5 wallet); the publisher never signs and never inspects signedness.
// Only the broadcast handler is handed `options.broadcast` — the assemble handlers structurally cannot
// submit a tx, so an unsigned assembled tx can never reach `sendrawtransaction`.
export async function handlePublisherRequest(request: Request, options: PublisherServiceOptions): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = pathSegments(url);

    if (segments.length === 1 && segments[0] === "health") {
      if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return json({ ok: true, service: "@ont/publisher" });
    }

    if (segments.length === 2 && segments[0] === "assemble" && segments[1] === "root-anchor") {
      if (request.method !== "POST") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return assembleRootAnchorRoute(request);
    }
    if (segments.length === 2 && segments[0] === "assemble" && segments[1] === "recover-owner-invoke") {
      if (request.method !== "POST") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return assembleRecoverOwnerInvokeRoute(request);
    }
    if (segments.length === 1 && segments[0] === "broadcast") {
      if (request.method !== "POST") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return broadcastSignedRoute(request, options.broadcast);
    }
    if (segments.length === 2 && segments[0] === "da") {
      if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return daRecordRoute(segments[1]!, options.daRecordSource);
    }

    return json({ ok: false, reason: "not-found" }, 404);
  } catch {
    return json({ ok: false, reason: "bad-request" }, 400);
  }
}

export function createPublisherHttpServer(options: PublisherServiceOptions): Server {
  return createServer((req, res) => {
    void handleNodeRequest(req, res, options);
  });
}

async function daRecordRoute(anchoredRoot: string, daRecordSource?: DaRecordStore | undefined): Promise<Response> {
  if (!isHex64Lower(anchoredRoot)) return json({ ok: false, reason: "malformed-root" }, 400);
  if (daRecordSource === undefined) return json({ ok: false, reason: "not-found" }, 404);
  try {
    const record = await daRecordSource.getRecord(anchoredRoot);
    if (record === null) return json({ ok: false, reason: "not-found" }, 404);
    return new Response(record, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } catch {
    return json({ ok: false, reason: "not-found" }, 404);
  }
}

// Assemble-only: no broadcast port in scope. Returns the unsigned tx for off-service signing.
async function assembleRootAnchorRoute(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const input = normalizeBigIntFields(body.value) as AssembleRootAnchorInput;
  const tx = assembleRootAnchorTx(input);
  if (tx === null) return json({ ok: false, reason: "invalid-root-anchor" }, 422);
  return assembledResponse(tx);
}

async function assembleRecoverOwnerInvokeRoute(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const input = normalizeBigIntFields(body.value) as AssembleRecoverOwnerInvokeInput;
  const tx = assembleRecoverOwnerInvokeTx(input);
  if (tx === null) return json({ ok: false, reason: "invalid-recover-owner-invoke" }, 422);
  return assembledResponse(tx);
}

// `unsignedTxid` is the legacy txid over the UNSIGNED serialization (scriptSigs empty). Signing fills the
// scriptSigs, which changes the serialization and therefore the txid — so this is a TEMPLATE id, NOT the
// chain txid. The real chain txid comes from /broadcast (the node's response after the signed raw is submitted).
function assembledResponse(tx: LegacyTransaction): Response {
  const bytes = serializeLegacyTransaction(tx);
  const unsignedTxid = legacyTxidOf(tx);
  if (bytes === null || unsignedTxid === null) return json({ ok: false, reason: "tx-not-serializable" }, 422);
  return json({ ok: true, unsignedTxid, unsignedTxHex: Buffer.from(bytes).toString("hex") }, 200);
}

// The ONLY route handed the broadcast port. Relays an already-signed legacy raw; fails closed on any
// raw that is not legacy-serializable (witness/segwit) before the port is ever touched.
async function broadcastSignedRoute(request: Request, broadcast: PublisherBroadcastPort): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const value = body.value;
  const signedTxHex =
    typeof value === "object" && value !== null && "signedTxHex" in value
      ? (value as { signedTxHex: unknown }).signedTxHex
      : undefined;
  if (typeof signedTxHex !== "string") return json({ ok: false, reason: "missing-signed-tx-hex" }, 400);
  const tx = parseLegacyTransaction(signedTxHex);
  if (tx === null) return json({ ok: false, reason: "tx-not-legacy" }, 422);
  try {
    const result = await broadcast.broadcast(tx);
    return json(result, result.ok ? 202 : 502);
  } catch {
    return json({ ok: false, reason: "broadcast-unavailable" }, 503);
  }
}

function normalizeBigIntFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => normalizeBigIntFields(entry));
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = key === "valueSats" && typeof entry === "string" && /^[0-9]+$/.test(entry)
      ? BigInt(entry)
      : normalizeBigIntFields(entry);
  }
  return out;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function pathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; reason: "bad-json" }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, reason: "bad-json" };
  }
}

async function handleNodeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: PublisherServiceOptions
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  const host = req.headers.host ?? "127.0.0.1";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const init: RequestInit = {
    method: req.method ?? "GET",
    headers,
  };
  if (chunks.length > 0) init.body = Buffer.concat(chunks);
  const request = new Request(`http://${host}${req.url ?? "/"}`, init);
  const response = await handlePublisherRequest(request, options);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
