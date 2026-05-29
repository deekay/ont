import { API_BASE, ESPLORA_BASE } from "../config";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** GET JSON from the resolver/web API (paths are relative to /api). */
export async function apiGet<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = `${API_BASE}${path}`;
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    return parseJsonResponse<T>(path, res);
  }, timeoutMs);
}

/** POST JSON to the resolver/web API. */
export async function apiPost<T>(path: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = `${API_BASE}${path}`;
  return withTimeout(async (signal) => {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    return parseJsonResponse<T>(path, res);
  }, timeoutMs);
}

/**
 * Parse a JSON API response defensively: surface the resolver's {error,message}
 * on non-2xx, and — critically — throw rather than return a string when a 2xx
 * body isn't valid JSON (a misrouted request or an HTML error page must not be
 * cast to T and crash a screen downstream).
 */
async function parseJsonResponse<T>(path: string, res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parseFailed = true;
    parsed = text;
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && "message" in parsed && (parsed as any).message) ||
      (parsed && typeof parsed === "object" && "error" in parsed && (parsed as any).error) ||
      (typeof parsed === "string" && parsed.trim() ? parsed.trim().slice(0, 200) : "") ||
      `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status, parsed);
  }
  if (parseFailed) {
    throw new ApiError(`Expected JSON from ${path} but got a non-JSON response.`, res.status, text);
  }
  return parsed as T;
}

/** GET plain text from the esplora shim (paths relative to /esplora). */
export async function esploraGetText(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const url = `${ESPLORA_BASE}${path}`;
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal });
    const text = await res.text();
    if (!res.ok) throw new ApiError(text || `Request failed (${res.status})`, res.status, text);
    return text;
  }, timeoutMs);
}

/** GET JSON from the esplora shim. */
export async function esploraGetJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const text = await esploraGetText(path, timeoutMs);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(`Expected JSON from esplora ${path} but got a non-JSON response.`, 200, text);
  }
}

/** POST a raw transaction hex to the esplora shim broadcast endpoint; returns txid. */
export async function esploraBroadcast(rawTxHex: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const url = `${ESPLORA_BASE}/tx`;
  return withTimeout(async (signal) => {
    const res = await fetch(url, { method: "POST", signal, body: rawTxHex });
    const text = await res.text();
    if (!res.ok) throw new ApiError(text || `Broadcast failed (${res.status})`, res.status, text);
    return text.trim();
  }, timeoutMs);
}
