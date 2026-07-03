import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { renderLanding, route } from "./render-explorer-landing.js";
import { renderNameView, shapeName, type BitcoinVerificationRenderOptions } from "./render-name-view.js";
import { renderTxView, renderServedTx, shapeTxid } from "./render-tx-view.js";
import type { WebReadPort, ServedNameStateResult } from "./web-read-port.js";
import type { BitcoinHeaderSource } from "@ont/light-client";
import type { ResolverTxSource } from "./live/resolver-tx-source.js";
import type { ResolverNameStateSource } from "./live/resolver-name-state-source.js";

export interface WebServiceOptions {
  readonly port: WebReadPort;
  // Optional live resolver tx read source (G2 slice 5b-2/5c). When configured, txid reads go to the live
  // resolver (async): the direct /tx/:txid handler AND txid queries via /?q=<txid> and /search?q=<txid>. In
  // every case — source ServedTx -> tx page; source null -> unavailable page; source throw -> generic 502
  // before rendering. Non-txid queries (names, empty, malformed) and the no-txSource case stay on the pure sync
  // renderTxView / route(q, port) path, byte-stable. `| undefined` is explicit so the env selector's
  // ResolverTxSource | undefined result is assignable under exactOptionalPropertyTypes.
  readonly txSource?: ResolverTxSource | undefined;
  readonly nameStateSource?: ResolverNameStateSource | undefined;
  readonly bitcoinHeaderSource?: BitcoinHeaderSource | undefined;
  readonly verificationCheckpointId?: string | undefined;
  readonly verificationNetwork?: string | undefined;
}

export function createEmptyWebReadPort(): WebReadPort {
  return {
    valueHistory: () => null,
    recoveryHistory: () => null,
    nameState: () => null,
    tx: () => null,
  };
}

export async function handleWebRequest(request: Request, options: WebServiceOptions): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = pathSegments(url);
    if (request.method !== "GET") return json({ ok: false, reason: "method-not-allowed" }, 405);

    if (segments.length === 1 && segments[0] === "health") {
      return json({ ok: true, service: "@ont/web" });
    }

    if (segments.length === 0) {
      const q = url.searchParams.get("q");
      if (q === null) return html(renderLanding());
      return await routeResponse(q, options);
    }

    if (segments.length === 1 && segments[0] === "search") {
      return await routeResponse(url.searchParams.get("q") ?? "", options);
    }

    if (segments.length === 2 && segments[0] === "names") {
      const rawName = segments[1];
      if (options.nameStateSource === undefined) {
        return html(renderNameView({ name: rawName, port: options.port, bitcoinVerification: bitcoinVerificationOptions(options) }));
      }
      const shaped = shapeName(rawName);
      if (!shaped.ok) {
        return html(renderNameView({ name: rawName, port: options.port, bitcoinVerification: bitcoinVerificationOptions(options) }));
      }
      return await liveNameResponse(shaped.name, options);
    }

    if (segments.length === 2 && segments[0] === "tx") {
      const rawTxid = segments[1];
      // No live source configured → the documented pure sync path (renderTxView wraps the sync port).
      if (options.txSource === undefined) {
        return html(renderTxView({ txid: rawTxid, port: options.port }));
      }
      // Live resolver read (G2 slice 5b-2) — validate before fetch: a bad txid renders the error view and NEVER
      // calls the source; a good txid goes through the shared live tx path.
      const shaped = shapeTxid(rawTxid);
      if (!shaped.ok) return html(renderServedTx(rawTxid, null)); // error view, no fetch
      return await liveTxResponse(shaped.txid, options.txSource);
    }

    return json({ ok: false, reason: "not-found" }, 404);
  } catch {
    return json({ ok: false, reason: "bad-request" }, 400);
  }
}

export function createWebHttpServer(options: WebServiceOptions): Server {
  return createServer((req, res) => {
    void handleNodeRequest(req, res, options);
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// The 502 body for a broken live resolver read (G2 slice 5b-2). GENERIC by design: it carries the operator
// signal in the 502 status, never the resolver exception text (no internal leak into HTML), and is distinct
// from the "not currently served" unavailable page (a broken read is not "absent").
const LIVE_READ_ERROR =
  `<!doctype html><html><head><title>Resolver unavailable</title></head><body>` +
  `<h1>Resolver unavailable</h1>` +
  `<p>The resolver could not be reached to read this transaction. Please try again later.</p>` +
  `</body></html>`;

const LIVE_NAME_STATE_READ_ERROR =
  `<!doctype html><html><head><title>Resolver unavailable</title></head><body>` +
  `<h1>Resolver unavailable</h1>` +
  `<p>The resolver could not be reached to read this name state. Please try again later.</p>` +
  `</body></html>`;

/**
 * The shared live tx path (G2 slice 5b-2/5c). The txid is already validated. Owns the async + HTTP status so
 * the pure `route` / `renderServedTx` stay status-free: source ServedTx → tx page (200); source null →
 * unavailable page (200); source throw → the fixed generic 502 (no resolver-exception leak), returned BEFORE
 * rendering so a broken read is never confused with "absent". Both the direct /tx/:txid handler and the txid
 * search queries render through this one path and share the one 502 body.
 */
async function liveTxResponse(txid: string, txSource: ResolverTxSource): Promise<Response> {
  try {
    return html(renderServedTx(txid, await txSource(txid)));
  } catch {
    return html(LIVE_READ_ERROR, 502);
  }
}

async function liveNameResponse(name: string, options: WebServiceOptions): Promise<Response> {
  if (options.nameStateSource === undefined) {
    return html(renderNameView({ name, port: options.port, bitcoinVerification: bitcoinVerificationOptions(options) }));
  }
  try {
    const served = await options.nameStateSource(name);
    return html(
      renderNameView({
        name,
        port: withNameState(options.port, served),
        bitcoinVerification: bitcoinVerificationOptions(options),
      }),
    );
  } catch {
    return html(LIVE_NAME_STATE_READ_ERROR, 502);
  }
}

/**
 * Async companion to the pure `route` (G2 slice 5c). When a live `txSource` is configured AND the trimmed
 * query shapes to a txid, the landing/search query goes through the SAME live tx path as direct /tx/:txid.
 * When a live `nameStateSource` is configured and the trimmed query shapes to a name, it goes through the
 * live name-state path. Empty/malformed queries and unconfigured live sources fall to the byte-stable sync
 * route(q, port). Keeps `route` pure (string-returning).
 */
async function routeResponse(rawQuery: string, options: WebServiceOptions): Promise<Response> {
  const trimmed = rawQuery.trim();
  if (options.txSource !== undefined) {
    const shaped = shapeTxid(trimmed); // trim mirrors route(); only a txid query goes live
    if (shaped.ok) return liveTxResponse(shaped.txid, options.txSource);
  }
  if (options.nameStateSource !== undefined) {
    const shaped = shapeName(trimmed);
    if (shaped.ok) return liveNameResponse(shaped.name, options);
  }
  return html(route(rawQuery, options.port)); // names / empty / malformed → pure sync, byte-stable
}

function withNameState(port: WebReadPort, served: ServedNameStateResult | null): WebReadPort {
  return {
    ...port,
    nameState: () => served,
  };
}

function bitcoinVerificationOptions(options: WebServiceOptions): BitcoinVerificationRenderOptions {
  return {
    headerSource: options.bitcoinHeaderSource ?? null,
    checkpointId: options.verificationCheckpointId,
    network: options.verificationNetwork,
  };
}

function pathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

async function handleNodeRequest(req: IncomingMessage, res: ServerResponse, options: WebServiceOptions): Promise<void> {
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
  const response = await handleWebRequest(new Request(`http://${host}${req.url ?? "/"}`, init), options);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
