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
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const msg =
        (parsed && typeof parsed === "object" && "message" in parsed && (parsed as any).message) ||
        (parsed && typeof parsed === "object" && "error" in parsed && (parsed as any).error) ||
        `Request failed (${res.status})`;
      throw new ApiError(String(msg), res.status, parsed);
    }
    return parsed as T;
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
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const msg =
        (parsed && typeof parsed === "object" && "message" in parsed && (parsed as any).message) ||
        (parsed && typeof parsed === "object" && "error" in parsed && (parsed as any).error) ||
        `Request failed (${res.status})`;
      throw new ApiError(String(msg), res.status, parsed);
    }
    return parsed as T;
  }, timeoutMs);
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
  return JSON.parse(text) as T;
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
