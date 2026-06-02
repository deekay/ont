import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  parseSignedValueRecord,
  PRODUCT_NAME,
  PROTOCOL_NAME
} from "@ont/protocol";
import { loadLaunchAuctionLab } from "./auction-lab.js";
import { getAuctionToolsClientBundle } from "./auction-tools-bundle.js";
import { renderClientScript } from "./client-script.js";
import { getKeyToolsClientBundle } from "./key-tools-bundle.js";
import { renderPageHtml } from "./page-shell.js";
import {
  fetchNameValueHistoryFromResolvers,
  publishValueRecordToResolvers,
  resolveConfiguredResolverUrls
} from "./resolver-fanout.js";
import { STYLESHEET } from "./styles.js";
import { getValuePublishClientBundle } from "./value-publish-bundle.js";

const execFile = promisify(execFileCallback);

const resolverPort = parsePort(
  process.env.ONT_RESOLVER_PORT ?? "8787",
  "ONT_RESOLVER_PORT"
);
const port = parsePort(
  process.env.ONT_WEB_PORT ?? process.env.PORT ?? "3000",
  "ONT_WEB_PORT"
);
const resolverUrl =
  process.env.ONT_WEB_RESOLVER_URL
  ?? `http://127.0.0.1:${resolverPort}`;
// The batching publisher (cheap-rail 1,000 sats claims) — co-located on the box,
// bound to localhost. The web /api proxies the claim endpoints so the no-install
// browser tools can claim an available name end to end.
const publisherUrl =
  normalizeOptionalText(process.env.ONT_WEB_PUBLISHER_URL)
  ?? "http://127.0.0.1:7878";

// A public claim endpoint makes the publisher spend + anchor, so throttle it
// per client IP (sliding 60s window). Default 10/min; tune via env.
const claimRateMaxPerMinute = (() => {
  const parsed = Number.parseInt(process.env.ONT_WEB_CLAIM_RATE_LIMIT_PER_MINUTE ?? "10", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
})();
const claimRateWindowMs = 60_000;
const claimHitsByIp = new Map<string, number[]>();

function clientIpFor(request: import("node:http").IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.socket?.remoteAddress ?? "unknown";
}

function claimRateExceeded(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - claimRateWindowMs;
  if (claimHitsByIp.size > 5000) {
    claimHitsByIp.clear(); // crude unbounded-growth guard
  }
  const hits = (claimHitsByIp.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= claimRateMaxPerMinute) {
    claimHitsByIp.set(ip, hits);
    return true;
  }
  hits.push(now);
  claimHitsByIp.set(ip, hits);
  return false;
}
const resolverCandidateUrls = resolveConfiguredResolverUrls(
  resolverUrl,
  normalizeOptionalText(process.env.ONT_WEB_RESOLVER_URLS)
  ?? normalizeOptionalText(process.env.ONT_RESOLVER_URLS)
);
const basePath = normalizeBasePath(process.env.ONT_WEB_BASE_PATH ?? "");
const networkLabel =
  normalizeOptionalText(process.env.ONT_WEB_NETWORK_LABEL)
  ?? "Private Signet Demo";
const showPrivateAuctionSmoke = parseBoolean(
  process.env.ONT_WEB_SHOW_PRIVATE_AUCTION_SMOKE,
  networkLabel.toLowerCase().includes("private signet")
);
const privateSignetFundingCommand =
  normalizeOptionalText(process.env.ONT_WEB_PRIVATE_SIGNET_FUNDING_COMMAND) ??
  "/usr/local/bin/ont-private-signet-fund";
const privateSignetFundingAmountSats = parseSatsValue(
  process.env.ONT_WEB_PRIVATE_SIGNET_FUNDING_AMOUNT_SATS
    ?? "1000000",
  "ONT_WEB_PRIVATE_SIGNET_FUNDING_AMOUNT_SATS"
);
const privateSignetFundingAmountBtc = satsToBitcoinString(privateSignetFundingAmountSats);
const privateSignetFundingMaxSats = parseSatsValue(
  process.env.ONT_WEB_PRIVATE_SIGNET_FUNDING_MAX_SATS
    ?? "100000000",
  "ONT_WEB_PRIVATE_SIGNET_FUNDING_MAX_SATS"
);
const privateSignetFundingMaxBtc = satsToBitcoinString(privateSignetFundingMaxSats);
const privateSignetFundingCooldownMs = parseNonNegativeInteger(
  process.env.ONT_WEB_PRIVATE_SIGNET_FUNDING_COOLDOWN_MS
    ?? "30000",
  "ONT_WEB_PRIVATE_SIGNET_FUNDING_COOLDOWN_MS"
);
const privateSignetFundingEnabled =
  parseBoolean(
    process.env.ONT_WEB_PRIVATE_SIGNET_FUNDING_ENABLED,
    networkLabel.toLowerCase().includes("private signet")
  ) && existsSync(privateSignetFundingCommand);
const privateSignetElectrumEndpoint =
  normalizeOptionalText(process.env.ONT_WEB_PRIVATE_SIGNET_ELECTRUM_ENDPOINT)
  ?? (networkLabel.toLowerCase().includes("private signet") ? "opennametags.org:50001:t" : null);
const privateDemoBasePath = normalizeBasePath(
  process.env.ONT_WEB_PRIVATE_DEMO_BASE_PATH
    ?? (networkLabel.toLowerCase().includes("private signet") ? basePath : "/ont-private")
);
const privateSignetFundingRequestTimes = new Map<string, number>();
const faviconDataUrl =
  "data:image/svg+xml," +
  encodeURIComponent(
    readFileSync(
      fileURLToPath(new URL("../../../icon.svg", import.meta.url)),
      "utf8"
    )
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
const privateAuctionSmokeStatusPath =
  normalizeOptionalText(process.env.ONT_WEB_PRIVATE_AUCTION_SMOKE_STATUS_PATH) ??
  fileURLToPath(new URL("../../../.data/private-signet-demo/auction-smoke-summary.json", import.meta.url));

const server = createServer(async (request, response) => {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathname = stripBasePath(url.pathname, basePath);

  if (pathname === "/api/private-signet-fund") {
    if (method !== "POST") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Use POST for private signet funding requests."
      });
    }

    if (!privateSignetFundingEnabled) {
      return writeJson(response, 404, {
        error: "not_found",
        message: "Private signet funding is not enabled for this deployment."
      });
    }

    try {
      const body = await readJsonBody(request);
      const address =
        body &&
        typeof body === "object" &&
        "address" in body &&
        typeof body.address === "string"
          ? normalizeOptionalText(body.address)
          : null;

      if (!address) {
        return writeJson(response, 400, {
          error: "invalid_address",
          message: "Paste a signet receive address from Sparrow first."
        });
      }

      const fundingResult = await fundPrivateSignetAddress(address, parseFundingRequestAmountSats(body));
      return writeJson(response, 200, fundingResult);
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeJson(response, error.statusCode, {
          error: error.code,
          message: error.message
        });
      }

      return writeJson(response, 502, {
        error: "private_signet_funding_failed",
        message: error instanceof Error ? error.message : "Unable to fund the requested address."
      });
    }
  }

  if (pathname === "/api/values") {
    if (method !== "POST") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Use POST for signed value record publishing."
      });
    }

    try {
      const body = await readJsonBody(request);
      return proxyJson(response, `${resolverUrl}/values`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeJson(response, error.statusCode, {
          error: error.code,
          message: error.message
        });
      }

      return writeJson(response, 400, {
        error: "invalid_value_record",
        message: error instanceof Error ? error.message : "Unable to publish the signed value record."
      });
    }
  }

  if (pathname === "/api/recovery-descriptors") {
    if (method !== "POST") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Use POST for signed recovery descriptor publishing."
      });
    }

    try {
      const body = await readJsonBody(request);
      return proxyJson(response, `${resolverUrl}/recovery-descriptors`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeJson(response, error.statusCode, {
          error: error.code,
          message: error.message
        });
      }

      return writeJson(response, 400, {
        error: "invalid_recovery_descriptor",
        message: error instanceof Error ? error.message : "Unable to publish the signed recovery descriptor."
      });
    }
  }

  if (pathname === "/api/recovery-proofs") {
    if (method !== "POST") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Use POST for signed recovery wallet proof publishing."
      });
    }

    try {
      const body = await readJsonBody(request);
      return proxyJson(response, `${resolverUrl}/recovery-proofs`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeJson(response, error.statusCode, {
          error: error.code,
          message: error.message
        });
      }

      return writeJson(response, 400, {
        error: "invalid_recovery_wallet_proof",
        message: error instanceof Error ? error.message : "Unable to publish the signed recovery wallet proof."
      });
    }
  }

  // Cheap-rail claim — proxied to the batching publisher so the no-install
  // browser tools can claim an available name. The wallet/browser trusts nothing
  // the publisher returns: the quote is checked to commit H(name) + the owner key
  // before "payment", and the inclusion proof is verified against its anchored
  // root before the claim is treated as real.
  if (pathname === "/api/claim/quote" || pathname === "/api/claim/submit") {
    if (method !== "POST") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Use POST for claim quote/submit."
      });
    }
    if (claimRateExceeded(clientIpFor(request))) {
      return writeJson(response, 429, {
        error: "rate_limited",
        message: "Too many claim requests from your address. Please wait a minute and try again."
      });
    }
    try {
      const body = await readJsonBody(request);
      const target = pathname === "/api/claim/quote" ? "quote" : "submit";
      return proxyJson(response, `${publisherUrl}/claim/${target}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof HttpRequestError) {
        return writeJson(response, error.statusCode, { error: error.code, message: error.message });
      }
      return writeJson(response, 502, {
        error: "publisher_unreachable",
        message: error instanceof Error ? error.message : "Could not reach the publisher."
      });
    }
  }

  if (pathname === "/api/publisher/info") {
    return proxyJson(response, `${publisherUrl}/info`);
  }

  const claimStatusMatch = pathname ? pathname.match(/^\/api\/claim\/([A-Za-z0-9._-]+)$/) : null;
  if (claimStatusMatch && claimStatusMatch[1] && method === "GET") {
    return proxyJson(response, `${publisherUrl}/claim/${encodeURIComponent(claimStatusMatch[1])}`);
  }

  if (pathname === "/api/values/fanout") {
    if (method !== "POST") {
      return writeJson(response, 405, {
        error: "method_not_allowed",
        message: "Use POST for signed destination-record fanout publishing."
      });
    }

    try {
      const body = await readJsonBody(request);
      const valueRecord = parseSignedValueRecord(body);
      return writeJson(
        response,
        200,
        await publishValueRecordToResolvers({
          resolverUrls: resolverCandidateUrls,
          valueRecord
        })
      );
    } catch (error) {
      return writeJson(response, 400, {
        error: "invalid_value_record",
        message:
          error instanceof Error ? error.message : "Unable to publish the signed value record to the configured resolver set."
      });
    }
  }

  if (method !== "GET") {
    return writeJson(response, 405, {
      error: "method_not_allowed",
      message: "Only GET is supported in the prototype web app."
    });
  }

  if (pathname === null) {
    return writeJson(response, 404, {
      error: "not_found",
      message: `Path is outside configured base path ${basePath}.`
    });
  }

  if (
    pathname === "/"
    || isExplorePath(pathname)
    || isAdvancedPath(pathname)
    || isAuctionsPath(pathname)
    || isNameDetailPath(pathname)
    || isValuesPath(pathname)
    || isTransferPath(pathname)
    || isSetupPath(pathname)
    || isExplainerPath(pathname)
  ) {
    return writeHtml(
      response,
      renderPageHtml({
        basePath,
        faviconDataUrl,
        includePrivateAuctionSmoke: showPrivateAuctionSmoke,
        networkLabel,
        pageKind: pathname === "/"
          ? "home"
          : isAdvancedPath(pathname)
          ? "advanced"
          : isAuctionsPath(pathname)
          ? "auctions"
          : isValuesPath(pathname)
            ? "values"
          : isTransferPath(pathname)
            ? "transfer"
            : isSetupPath(pathname)
              ? "setup"
            : isExplainerPath(pathname)
              ? "explainer"
              : "explore",
        privateSignetElectrumEndpoint,
        privateSignetFundingAmountSats,
        privateSignetFundingMaxSats,
        privateSignetFundingEnabled
      })
    );
  }

  if (isClaimPath(pathname)) {
    return writeRedirect(response, `${basePath}/auctions`);
  }

  if (pathname === "/styles.css") {
    return writeText(response, 200, STYLESHEET, "text/css; charset=utf-8", {
      "cache-control": "no-store"
    });
  }

  if (pathname === "/app.js") {
    return writeText(response, 200, renderClientScript(basePath), "application/javascript; charset=utf-8", {
      "cache-control": "no-store"
    });
  }

  if (pathname === "/key-tools.js") {
    try {
      return writeText(
        response,
        200,
        await getKeyToolsClientBundle(),
        "application/javascript; charset=utf-8",
        {
          "cache-control": "no-store"
        }
      );
    } catch (error) {
      return writeJson(response, 500, {
        error: "key_tools_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate the browser key tools bundle."
      });
    }
  }

  if (pathname === "/auction-tools.js") {
    try {
      return writeText(
        response,
        200,
        await getAuctionToolsClientBundle(),
        "application/javascript; charset=utf-8",
        {
          "cache-control": "no-store"
        }
      );
    } catch (error) {
      return writeJson(response, 500, {
        error: "auction_tools_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate the auction helper client bundle."
      });
    }
  }

  if (pathname === "/value-tools.js") {
    try {
      return writeText(
        response,
        200,
        await getValuePublishClientBundle(),
        "application/javascript; charset=utf-8"
      );
    } catch (error) {
      return writeJson(response, 500, {
        error: "value_tools_unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate the destination publishing client bundle."
      });
    }
  }

  if (pathname === "/api/config") {
    return writeJson(response, 200, {
      product: PRODUCT_NAME,
      protocol: PROTOCOL_NAME,
      resolverUrl,
      resolverCandidates: resolverCandidateUrls,
      resolverFanoutAvailable: resolverCandidateUrls.length > 1,
      basePath,
      networkLabel,
      showPrivateAuctionSmoke,
      showAuctionLab: true,
      privateDemoBasePath,
      privateFunding: {
        enabled: privateSignetFundingEnabled,
        amountSats: privateSignetFundingAmountSats.toString(),
        amountBtc: privateSignetFundingAmountBtc,
        maxAmountSats: privateSignetFundingMaxSats.toString(),
        maxAmountBtc: privateSignetFundingMaxBtc,
        electrumEndpoint: privateSignetElectrumEndpoint
      }
    });
  }

  if (pathname === "/api/health") {
    return proxyJson(response, `${resolverUrl}/health`);
  }

  if (pathname === "/api/private-auction-smoke-status") {
    return writeJson(response, 200, await readPrivateAuctionSmokeStatus());
  }

  if (pathname === "/api/auctions") {
    try {
      return writeJson(response, 200, await loadLaunchAuctionLab());
    } catch (error) {
      return writeJson(response, 400, {
        error: "invalid_auction_policy_override",
        message: error instanceof Error ? error.message : "Unable to apply the auction policy override."
      });
    }
  }

  if (pathname === "/api/experimental-auctions") {
    return proxyExperimentalAuctionsJson(response, `${resolverUrl}/experimental-auctions`);
  }

  if (pathname === "/api/names") {
    return proxyJson(response, `${resolverUrl}/names`);
  }

  if (pathname === "/api/activity") {
    const query = url.searchParams.toString();
    return proxyJson(response, `${resolverUrl}/activity${query === "" ? "" : `?${query}`}`);
  }

  if (pathname.startsWith("/api/tx/")) {
    const txid = pathname.slice("/api/tx/".length);
    return proxyJson(response, `${resolverUrl}/tx/${txid}`);
  }

  if (pathname.startsWith("/api/utxo/")) {
    const suffix = pathname.slice("/api/utxo/".length);
    return proxyJson(response, `${resolverUrl}/utxo/${suffix}`);
  }

  if (pathname.startsWith("/api/name/")) {
    const activityPathMatch = pathname.match(/^\/api\/name\/(.+)\/activity$/);

    if (activityPathMatch) {
      const name = activityPathMatch[1] ?? "";
      const query = url.searchParams.toString();
      return proxyJson(response, `${resolverUrl}/name/${name}/activity${query === "" ? "" : `?${query}`}`);
    }

    const valueComparePathMatch = pathname.match(/^\/api\/name\/(.+)\/value\/compare$/);

    if (valueComparePathMatch) {
      const name = decodeURIComponent(valueComparePathMatch[1] ?? "");

      try {
        return writeJson(
          response,
          200,
          await fetchNameValueHistoryFromResolvers({
            name,
            resolverUrls: resolverCandidateUrls
          })
        );
      } catch (error) {
        return writeJson(response, 502, {
          error: "resolver_compare_failed",
          message: error instanceof Error ? error.message : "Unable to compare value history across the configured resolvers."
        });
      }
    }

    const valueHistoryPathMatch = pathname.match(/^\/api\/name\/(.+)\/value\/history$/);

    if (valueHistoryPathMatch) {
      const name = valueHistoryPathMatch[1] ?? "";
      return proxyJson(response, `${resolverUrl}/name/${name}/value/history`);
    }

    const valuePathMatch = pathname.match(/^\/api\/name\/(.+)\/value$/);

    if (valuePathMatch) {
      const name = valuePathMatch[1] ?? "";
      return proxyJson(response, `${resolverUrl}/name/${name}/value`);
    }

    const name = pathname.slice("/api/name/".length);
    return proxyJson(response, `${resolverUrl}/name/${name}`);
  }

  return writeJson(response, 404, {
    error: "not_found",
    message:
      "Supported paths: /, /explore, /advanced, /auctions, /values, /transfer, /setup, /explainer, /app.js, /auction-tools.js, /key-tools.js, /value-tools.js, /api/config, /api/health, /api/names, /api/activity, /api/tx/{txid}, /api/utxo/{txid}/{vout}, /api/private-signet-fund, /api/name/{name}, /api/name/{name}/activity, /api/name/{name}/value, /api/name/{name}/value/history, /api/name/{name}/value/compare, /api/auctions"
      + ", /api/private-auction-smoke-status, /api/experimental-auctions, /api/values, /api/values/fanout, /api/recovery-descriptors, /api/recovery-proofs"
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      [
        `${PRODUCT_NAME} web could not start because port ${port} is already in use.`,
        `Try: ONT_WEB_PORT=3001 npm run dev:web`,
        `Or run both together with: ONT_WEB_PORT=3001 ONT_RESOLVER_PORT=${resolverPort} npm run dev:all`
      ].join("\n")
    );
    process.exit(1);
  }

  throw error;
});

server.listen(port, () => {
  console.log(
    `${PRODUCT_NAME} web listening on http://127.0.0.1:${port}${basePath || ""} (basePath=${basePath || "/"})`
  );
});

function isNameDetailPath(pathname: string): boolean {
  return /^\/names\/[^/]+\/?$/.test(pathname);
}

function isExplorePath(pathname: string): boolean {
  return pathname === "/explore" || pathname === "/explore/";
}

function isAdvancedPath(pathname: string): boolean {
  return pathname === "/advanced" || pathname === "/advanced/";
}

function isAuctionsPath(pathname: string): boolean {
  return pathname === "/auctions" || pathname === "/auctions/";
}

function isClaimPath(pathname: string): boolean {
  return pathname === "/claim" || pathname === "/claim/";
}

function isValuesPath(pathname: string): boolean {
  return pathname === "/values" || pathname === "/values/";
}

function isTransferPath(pathname: string): boolean {
  return pathname === "/transfer" || pathname === "/transfer/";
}

function isSetupPath(pathname: string): boolean {
  return pathname === "/setup" || pathname === "/setup/";
}

function isExplainerPath(pathname: string): boolean {
  return pathname === "/explainer" || pathname === "/explainer/";
}

async function proxyJson(
  response: import("node:http").ServerResponse,
  targetUrl: string,
  init?: RequestInit
): Promise<void> {
  try {
    const upstream = await fetch(targetUrl, init);
    const body = await upstream.text();

    response.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
    });
    response.end(body);
  } catch (error) {
    writeJson(response, 502, {
      error: "resolver_unavailable",
      message: error instanceof Error ? error.message : "Resolver request failed"
    });
  }
}

async function proxyExperimentalAuctionsJson(
  response: import("node:http").ServerResponse,
  targetUrl: string
): Promise<void> {
  try {
    const upstream = await fetch(targetUrl);
    const payload = await upstream.json() as unknown;

    if (payload && typeof payload === "object" && Array.isArray((payload as { auctions?: unknown }).auctions)) {
      const record = payload as { auctions: unknown[] };
      writeJson(response, upstream.status, {
        ...record,
        auctions: record.auctions.filter((entry) => !shouldHidePublicAuctionEntry(entry))
      });
      return;
    }

    writeJson(response, upstream.status, payload);
  } catch (error) {
    writeJson(response, 502, {
      error: "resolver_unavailable",
      message: error instanceof Error ? error.message : "Resolver request failed"
    });
  }
}

function shouldHidePublicAuctionEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const record = entry as {
    auctionId?: unknown;
    title?: unknown;
    description?: unknown;
    phase?: unknown;
  };

  const text = [record.auctionId, record.title, record.description]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (text.includes("private-phase-")) {
    return false;
  }

  if (record.phase === "pending_unlock") {
    return true;
  }

  return text.includes("06-released")
    || text.includes("private-smoke-release")
    || text.includes("pending")
    || text.includes("legacy compatibility")
    || text.includes("no-winner");
}

async function readPrivateAuctionSmokeStatus(): Promise<unknown> {
  try {
    return sanitizePrivateAuctionSmokeStatus(
      JSON.parse(await readFile(privateAuctionSmokeStatusPath, "utf8")) as unknown
    );
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {
        status: "unavailable",
        message: "No private signet auction smoke summary has been published yet."
      };
    }

    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unable to read private signet auction smoke summary."
    };
  }
}

function sanitizePrivateAuctionSmokeStatus(payload: unknown): unknown {
  const sanitized = sanitizePrivateAuctionSmokeStatusValue(payload);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return sanitized;
  }

  return {
    ...(sanitized as Record<string, unknown>),
    message:
      "Private signet auction smoke covers opening bid, higher bid, settlement, value publication, transfer, and losing-bond violation checks."
  };
}

function sanitizePrivateAuctionSmokeStatusValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePrivateAuctionSmokeStatusValue(entry));
  }

  if (!value || typeof value !== "object") {
    return sanitizePrivateAuctionSmokeStatusText(value);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "releaseCheck") {
      continue;
    }
    sanitized[key] = sanitizePrivateAuctionSmokeStatusValue(entry);
  }
  return sanitized;
}

function sanitizePrivateAuctionSmokeStatusText(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return value;
}

function writeHtml(response: import("node:http").ServerResponse, html: string): void {
  writeText(response, 200, html, "text/html; charset=utf-8");
}

function writeRedirect(response: import("node:http").ServerResponse, location: string): void {
  response.writeHead(302, {
    location
  });
  response.end();
}

function writeText(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
  headers: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    ...headers
  });
  response.end(body);
}

function writeJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

function parsePort(value: string, envName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid ${envName} value: ${value}`);
  }

  return parsed;
}

function parseNonNegativeInteger(value: string, envName: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`invalid ${envName} value: ${value}`);
  }

  return parsed;
}

function parseSatsValue(value: string, envName: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error("must be positive");
    }
    return parsed;
  } catch {
    throw new Error(`invalid ${envName} value: ${value}`);
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  throw new Error(`invalid boolean value: ${value}`);
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > 64 * 1024) {
      throw new HttpRequestError(413, "payload_too_large", "Request body is too large.");
    }

    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (body === "") {
    throw new HttpRequestError(400, "invalid_request_body", "Request body is required.");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpRequestError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function fundPrivateSignetAddress(
  address: string,
  amountSats: bigint = privateSignetFundingAmountSats
): Promise<{
  readonly status: "funded";
  readonly address: string;
  readonly fundedSats: string;
  readonly fundedBtc: string;
  readonly txid: string;
  readonly fundingInputDescriptor?: string;
  readonly minedBlocks: number;
  readonly cooldownMs: number;
}> {
  const now = Date.now();
  const lastRequestAt = privateSignetFundingRequestTimes.get(address);

  if (
    lastRequestAt !== undefined &&
    privateSignetFundingCooldownMs > 0 &&
    now - lastRequestAt < privateSignetFundingCooldownMs
  ) {
    const retryAfterMs = privateSignetFundingCooldownMs - (now - lastRequestAt);
    throw new HttpRequestError(
      429,
      "rate_limited",
      `Please wait ${Math.ceil(retryAfterMs / 1000)}s before requesting more private signet coins.`
    );
  }

  try {
    const amountBtc = satsToBitcoinString(amountSats);
    const { stdout, stderr } = await execFile(privateSignetFundingCommand, [address, amountBtc], {
      timeout: 60_000
    });
    const commandOutput = `${stdout}\n${stderr}`;
    const descriptorMatches = commandOutput.match(/[a-f0-9]{64}:\d+:\d+:[^\s]+/gi) ?? [];
    const fundingInputDescriptor = descriptorMatches[descriptorMatches.length - 1]?.trim();
    const txidMatches = commandOutput.match(/[a-f0-9]{64}/gi) ?? [];
    const txid = txidMatches[txidMatches.length - 1]?.trim() ?? "";

    if (!/^[a-f0-9]{64}$/i.test(txid)) {
      throw new Error("Funding command did not return a transaction id.");
    }

    privateSignetFundingRequestTimes.set(address, now);

    return {
      status: "funded",
      address,
      fundedSats: amountSats.toString(),
      fundedBtc: amountBtc,
      txid,
      ...(fundingInputDescriptor ? { fundingInputDescriptor } : {}),
      minedBlocks: 1,
      cooldownMs: privateSignetFundingCooldownMs
    };
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string" && error.stderr.trim() !== ""
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : "Unable to fund the requested address.";

    throw new HttpRequestError(400, "private_signet_funding_failed", message);
  }
}

function parseFundingRequestAmountSats(body: unknown): bigint {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return privateSignetFundingAmountSats;
  }

  const record = body as Record<string, unknown>;
  const rawBtc = record.amountBtc;
  const rawSats = record.amountSats;
  const amountSats =
    typeof rawBtc === "string" && rawBtc.trim() !== ""
      ? parseBitcoinAmountToSats(rawBtc, "amountBtc")
      : rawSats === undefined || rawSats === null || rawSats === ""
        ? privateSignetFundingAmountSats
        : parsePositiveSats(rawSats, "amountSats");

  if (amountSats > privateSignetFundingMaxSats) {
    throw new HttpRequestError(
      400,
      "funding_amount_too_large",
      `Request ${privateSignetFundingMaxBtc} BTC or less for this hosted demo.`
    );
  }

  return amountSats;
}

function parsePositiveSats(value: unknown, label: string): bigint {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new HttpRequestError(400, "invalid_funding_amount", `${label} must be a positive amount.`);
  }

  try {
    const parsed = BigInt(String(value).trim());
    if (parsed <= 0n) {
      throw new Error("must be positive");
    }
    return parsed;
  } catch {
    throw new HttpRequestError(400, "invalid_funding_amount", `${label} must be a positive whole number.`);
  }
}

function parseBitcoinAmountToSats(value: string, label: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,8})?$/u.test(normalized)) {
    throw new HttpRequestError(400, "invalid_funding_amount", `${label} must be a positive BTC amount with up to 8 decimal places.`);
  }

  const [wholePart = "0", fractionalPart = ""] = normalized.split(".");
  const wholeSats = BigInt(wholePart) * 100_000_000n;
  const fractionalSats = BigInt(fractionalPart.padEnd(8, "0"));
  const sats = wholeSats + fractionalSats;
  if (sats <= 0n) {
    throw new HttpRequestError(400, "invalid_funding_amount", `${label} must be greater than zero.`);
  }

  return sats;
}

function satsToBitcoinString(sats: bigint): string {
  const whole = sats / 100_000_000n;
  const fractional = (sats % 100_000_000n).toString().padStart(8, "0").replace(/0+$/g, "");
  return fractional === "" ? `${whole}.0` : `${whole}.${fractional}`;
}

class HttpRequestError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function stripBasePath(pathname: string, configuredBasePath: string): string | null {
  if (configuredBasePath === "") {
    return pathname;
  }

  if (pathname === configuredBasePath) {
    return "/";
  }

  if (pathname.startsWith(`${configuredBasePath}/`)) {
    return pathname.slice(configuredBasePath.length);
  }

  return null;
}

function withBasePath(pathname: string, configuredBasePath: string): string {
  if (configuredBasePath === "") {
    return pathname;
  }

  if (pathname === "/") {
    return configuredBasePath;
  }

  return `${configuredBasePath}${pathname}`;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
