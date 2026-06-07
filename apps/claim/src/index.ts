// Minimal bare-claim site server.
//
// Serves one page + the self-contained browser client, and proxies the claim
// endpoints to the publisher (so the publisher URL stays server-side and we can
// rate-limit a public, spend-triggering endpoint). Deliberately tiny: no DB, no
// auth, no framework — this is the low-friction "claim with any Lightning wallet"
// front door, meant to run on its own origin (e.g. claim.opennametags.org),
// isolated from the marketing/docs site so a key-handling page shares no origin
// with general web content.
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { promisify } from "node:util";
import { getClaimClientBundle } from "./bundle.js";
import { renderClaimPage } from "./page.js";

const execFileAsync = promisify(execFile);

const port = parsePort(process.env.CLAIM_WEB_PORT ?? process.env.PORT ?? "3001");
const publisherUrl = (process.env.CLAIM_PUBLISHER_URL ?? process.env.ONT_WEB_PUBLISHER_URL ?? "http://127.0.0.1:8788").replace(/\/$/, "");
const networkLabel = (process.env.CLAIM_NETWORK_LABEL ?? "signet").trim();
const rateLimitPerMinute = parseRate(process.env.CLAIM_RATE_LIMIT_PER_MINUTE ?? "10");
const esploraUrl = (process.env.CLAIM_ESPLORA_URL ?? "http://127.0.0.1:3010").replace(/\/$/, "");
// Faucet (signet only): fixed amount, server-side; mines a block, so rate-limited hard.
const faucetCmd = process.env.CLAIM_FAUCET_CMD ?? "ont-private-signet-fund";
const faucetAmountBtc = process.env.CLAIM_FAUCET_AMOUNT_BTC ?? "0.0005"; // 50,000 sats
const faucetEnabled = (process.env.CLAIM_FAUCET_ENABLED ?? "true") === "true";
const faucetPerHour = parseRate(process.env.CLAIM_FAUCET_PER_HOUR ?? "6");
const ADDRESS_RE = /^(tb1|bcrt1)[a-z0-9]{6,90}$/;

const CLIENT_BUNDLE_PATH = "/claim.js";

const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    writeJson(response, 500, { error: "internal", message: error instanceof Error ? error.message : "error" });
  });
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathname = url.pathname;

  if (method === "GET" && (pathname === "/" || pathname === "")) {
    const html = renderClaimPage(networkLabel, CLIENT_BUNDLE_PATH);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
    return;
  }

  if (method === "GET" && pathname === CLIENT_BUNDLE_PATH) {
    const bundle = await getClaimClientBundle();
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" });
    response.end(bundle);
    return;
  }

  if (method === "GET" && pathname === "/healthz") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/claim/quote" || pathname === "/api/claim/submit") {
    if (method !== "POST") {
      writeJson(response, 405, { error: "method_not_allowed", message: "Use POST." });
      return;
    }
    if (rateExceeded(clientIp(request))) {
      writeJson(response, 429, { error: "rate_limited", message: "Too many claim requests. Wait a minute and retry." });
      return;
    }
    const body = await readJsonBody(request);
    const target = pathname === "/api/claim/quote" ? "quote" : "submit";
    await proxyJson(response, `${publisherUrl}/claim/${target}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return;
  }

  if (method === "GET" && pathname === "/api/publisher/info") {
    await proxyJson(response, `${publisherUrl}/info`);
    return;
  }

  const statusMatch = pathname.match(/^\/api\/claim\/([A-Za-z0-9._-]+)$/);
  if (statusMatch && statusMatch[1] && method === "GET") {
    await proxyJson(response, `${publisherUrl}/claim/${encodeURIComponent(statusMatch[1])}`);
    return;
  }

  // Wallet balance: read-only esplora address lookup (the client computes the
  // balance from chain_stats/mempool_stats). Restricted to bech32 addresses.
  const addrMatch = pathname.match(/^\/api\/address\/(tb1[a-z0-9]{6,90}|bcrt1[a-z0-9]{6,90})$/);
  if (method === "GET" && addrMatch && addrMatch[1]) {
    await proxyJson(response, `${esploraUrl}/address/${addrMatch[1]}`);
    return;
  }

  // Signet faucet: drips a fixed amount to a validated address. execFile (no shell)
  // + strict address regex + hard hourly rate limit, because each call mines a block.
  if (pathname === "/api/faucet") {
    if (!faucetEnabled) { writeJson(response, 404, { error: "faucet_disabled", message: "Faucet is not enabled." }); return; }
    if (method !== "POST") { writeJson(response, 405, { error: "method_not_allowed", message: "Use POST." }); return; }
    if (faucetExceeded(clientIp(request))) { writeJson(response, 429, { error: "rate_limited", message: "Faucet limit reached — try again later." }); return; }
    const body = (await readJsonBody(request)) as { address?: unknown };
    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!ADDRESS_RE.test(address)) { writeJson(response, 400, { error: "bad_address", message: "Provide a valid signet address." }); return; }
    // The fund command mines a block (~60s), so don't hold the request open —
    // kick it off and let the client poll the balance.
    void execFileAsync(faucetCmd, [address, faucetAmountBtc], { timeout: 180_000 })
      .catch((error) => console.error("faucet fund failed:", error instanceof Error ? error.message : error));
    writeJson(response, 202, { ok: true, pending: true, address, amountBtc: faucetAmountBtc, etaSeconds: 75 });
    return;
  }

  writeJson(response, 404, { error: "not_found", message: "Supported: /, /claim.js, /healthz, /api/claim/quote, /api/claim/submit, /api/claim/{id}, /api/publisher/info, /api/address/{addr}, /api/faucet" });
}

async function proxyJson(response: ServerResponse, targetUrl: string, init?: RequestInit): Promise<void> {
  try {
    const upstream = await fetch(targetUrl, init);
    const body = await upstream.text();
    response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8" });
    response.end(body);
  } catch (error) {
    writeJson(response, 502, { error: "publisher_unreachable", message: error instanceof Error ? error.message : "Could not reach the publisher." });
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > 64 * 1024) throw new Error("request body too large");
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

// --- rate limit: sliding 60s window per client IP ---
const hits = new Map<string, number[]>();
function rateExceeded(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > rateLimitPerMinute;
}
const faucetHits = new Map<string, number[]>();
function faucetExceeded(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 3_600_000; // 1 hour
  const recent = (faucetHits.get(ip) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  faucetHits.set(ip, recent);
  return recent.length > faucetPerHour;
}
function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.socket.remoteAddress ?? "unknown";
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`invalid port: ${value}`);
  return port;
}
function parseRate(value: string): number {
  const rate = Number.parseInt(value, 10);
  return Number.isInteger(rate) && rate > 0 ? rate : 10;
}

server.listen(port, () => {
  console.log(`ONT claim site on http://127.0.0.1:${port} (${networkLabel}) → publisher ${publisherUrl}`);
});
