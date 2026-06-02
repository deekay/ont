// HTTP wiring around the Publisher core. Mirrors apps/resolver's plain
// node:http style — no framework dependency.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { Publisher, PublisherError } from "./publisher.js";
import type { ClaimSubmission, QuoteRequest } from "./types.js";

export interface PublisherServer {
  readonly publisher: Publisher;
  readonly url: string;
  close(): Promise<void>;
}

export interface StartServerOptions {
  readonly publisher: Publisher;
  readonly port?: number;
  readonly host?: string;
}

export async function startPublisherServer(options: StartServerOptions): Promise<PublisherServer> {
  const server = createServer((req, res) => {
    handle(options.publisher, req, res).catch((error) => {
      writeError(res, error);
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port ?? 0;
  const host = options.host ?? "127.0.0.1";
  const url = `http://${host}:${port}`;

  return {
    publisher: options.publisher,
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}

async function handle(publisher: Publisher, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/info") {
    return writeJson(res, 200, publisher.info());
  }
  if (method === "GET" && url.pathname === "/health") {
    return writeJson(res, 200, publisher.health());
  }
  if (method === "POST" && url.pathname === "/claim/quote") {
    const body = await readJsonBody<QuoteRequest>(req);
    return writeJson(res, 200, await publisher.quote(body));
  }
  if (method === "POST" && url.pathname === "/claim/submit") {
    const body = await readJsonBody<ClaimSubmission>(req);
    const receipt = await publisher.submit(body);
    return writeJson(res, 200, receipt);
  }
  const claimMatch = url.pathname.match(/^\/claim\/([0-9a-fA-F]+)$/);
  if (method === "GET" && claimMatch && claimMatch[1] !== undefined) {
    return writeJson(res, 200, publisher.status(claimMatch[1]));
  }
  const batchMatch = url.pathname.match(/^\/batch\/([0-9a-fA-F]+)$/);
  if (method === "GET" && batchMatch && batchMatch[1] !== undefined) {
    return writeJson(res, 200, publisher.batch(batchMatch[1]));
  }
  writeError(res, new PublisherError(`no route for ${method} ${url.pathname}`, 404));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") {
    throw new PublisherError("request body is empty", 400);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PublisherError("request body is not JSON", 400);
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function writeError(res: ServerResponse, error: unknown): void {
  const status = error instanceof PublisherError ? error.status : 500;
  const message = error instanceof Error ? error.message : "internal error";
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}
