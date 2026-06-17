import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { renderLanding, route } from "./render-explorer-landing.js";
import { renderNameView } from "./render-name-view.js";
import { renderTxView, renderServedTx, shapeTxid } from "./render-tx-view.js";
import type { WebReadPort, ServedTx } from "./web-read-port.js";
import type { ResolverTxSource } from "./live/resolver-tx-source.js";

export interface WebServiceOptions {
  readonly port: WebReadPort;
  // Optional live resolver tx read source (G2 slice 5b-2). When configured, the /tx/:txid handler reads the
  // live resolver (async) instead of the sync `port`: bad txid -> error view (no fetch); source ServedTx ->
  // rendered tx page; source null -> unavailable page; source throw -> 502 before rendering. When absent, the
  // existing sync renderTxView({ txid, port }) path is unchanged. `| undefined` is explicit so the env selector's
  // ResolverTxSource | undefined result is assignable under exactOptionalPropertyTypes.
  readonly txSource?: ResolverTxSource | undefined;
}

export function createEmptyWebReadPort(): WebReadPort {
  return {
    valueHistory: () => null,
    recoveryHistory: () => null,
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
      return html(q === null ? renderLanding() : route(q, options.port));
    }

    if (segments.length === 1 && segments[0] === "search") {
      return html(route(url.searchParams.get("q") ?? "", options.port));
    }

    if (segments.length === 2 && segments[0] === "names") {
      return html(renderNameView({ name: segments[1], port: options.port }));
    }

    if (segments.length === 2 && segments[0] === "tx") {
      const rawTxid = segments[1];
      // No live source configured → the documented pure sync path (renderTxView wraps the sync port).
      if (options.txSource === undefined) {
        return html(renderTxView({ txid: rawTxid, port: options.port }));
      }
      // Live resolver read (G2 slice 5b-2) — DIRECT /tx/:txid only; /?q= and /search?q= stay on the pure sync
      // route(q, port) path with no live coverage (CL scope boundary, event a322f29e). Validate before fetch:
      // a bad txid renders the error view and NEVER calls the source.
      const shaped = shapeTxid(rawTxid);
      if (!shaped.ok) return html(renderServedTx(rawTxid, null)); // error view, no fetch
      let served: ServedTx | null;
      try {
        served = await options.txSource(shaped.txid);
      } catch {
        // A broken live read is NOT "absent": 502 before rendering, generic body (no resolver-exception leak).
        return html(LIVE_READ_ERROR, 502);
      }
      return html(renderServedTx(rawTxid, served)); // ServedTx → tx page; null → unavailable page (200)
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
