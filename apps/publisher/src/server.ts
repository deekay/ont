import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  assembleRecoverOwnerInvokeTx,
  assembleRootAnchorTx,
  type AssembleRecoverOwnerInvokeInput,
  type AssembleRootAnchorInput,
} from "@ont/adapter-publisher";
import { legacyTxidOf, type LegacyTransaction } from "@ont/bitcoin";

export type PublisherBroadcastResult =
  | { readonly ok: true; readonly txid: string }
  | { readonly ok: false; readonly reason: string };

export interface PublisherBroadcastPort {
  broadcast(tx: LegacyTransaction): Promise<PublisherBroadcastResult>;
}

export interface PublisherServiceOptions {
  readonly broadcast: PublisherBroadcastPort;
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

export async function handlePublisherRequest(request: Request, options: PublisherServiceOptions): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = pathSegments(url);

    if (segments.length === 1 && segments[0] === "health") {
      if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return json({ ok: true, service: "@ont/publisher" });
    }

    if (segments.length === 1 && segments[0] === "root-anchor") {
      if (request.method !== "POST") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return publishRootAnchor(request, options.broadcast);
    }
    if (segments.length === 1 && segments[0] === "recover-owner-invoke") {
      if (request.method !== "POST") return json({ ok: false, reason: "method-not-allowed" }, 405);
      return publishRecoverOwnerInvoke(request, options.broadcast);
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

async function publishRootAnchor(request: Request, broadcast: PublisherBroadcastPort): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const input = normalizeBigIntFields(body.value) as AssembleRootAnchorInput;
  const tx = assembleRootAnchorTx(input);
  if (tx === null) return json({ ok: false, reason: "invalid-root-anchor" }, 422);
  return publishTx(tx, broadcast);
}

async function publishRecoverOwnerInvoke(request: Request, broadcast: PublisherBroadcastPort): Promise<Response> {
  const body = await readJson(request);
  if (!body.ok) return json({ ok: false, reason: body.reason }, 400);
  const input = normalizeBigIntFields(body.value) as AssembleRecoverOwnerInvokeInput;
  const tx = assembleRecoverOwnerInvokeTx(input);
  if (tx === null) return json({ ok: false, reason: "invalid-recover-owner-invoke" }, 422);
  return publishTx(tx, broadcast);
}

async function publishTx(tx: LegacyTransaction, broadcast: PublisherBroadcastPort): Promise<Response> {
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
