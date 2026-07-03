import { decodeEncodedMaterialJson, isHex64Lower, type EncodedBatchMaterial } from "./material-codec.js";

export interface HttpDaRecordSource {
  fetchRecord(anchoredRoot: string): Promise<EncodedBatchMaterial | null>;
}

export interface HttpDaFetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

export interface HttpDaFetchInit {
  readonly signal?: AbortSignal;
}

export type HttpDaFetch = (url: string, init?: HttpDaFetchInit) => Promise<HttpDaFetchResponse>;

export interface CreateHttpDaRecordSourceOptions {
  readonly endpoint: string;
  readonly fetch?: HttpDaFetch | undefined;
  readonly timeoutMs?: number | undefined;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const defaultFetch: HttpDaFetch = (url, init) => {
  if (typeof globalThis.fetch !== "function") return Promise.reject(new Error("fetch unavailable"));
  return globalThis.fetch(url, init);
};

export function createHttpDaRecordSource(options: CreateHttpDaRecordSourceOptions): HttpDaRecordSource {
  const fetchRecord = options.fetch ?? defaultFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async fetchRecord(anchoredRoot: string): Promise<EncodedBatchMaterial | null> {
      try {
        if (!isHex64Lower(anchoredRoot)) return null;
        const url = recordUrl(options.endpoint, anchoredRoot);
        const controller = timeoutMs > 0 ? new AbortController() : undefined;
        const init = controller === undefined ? undefined : { signal: controller.signal };
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const fetched = fetchRecord(url, init);
          const response = controller === undefined
            ? await fetched
            : await Promise.race([
              fetched,
              new Promise<null>((resolve) => {
                timer = setTimeout(() => {
                  controller.abort();
                  resolve(null);
                }, timeoutMs);
              }),
            ]);
          if (response === null) return null;
          if (response.status !== 200) return null;
          return decodeEncodedMaterialJson(await response.text());
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      } catch {
        return null;
      }
    },
  };
}

function recordUrl(endpoint: string, anchoredRoot: string): string {
  const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  return new URL(`da/${anchoredRoot}`, base).toString();
}
