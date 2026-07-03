import { describe, expect, it } from "vitest";
import {
  createHttpDaRecordSource,
  encodeEncodedMaterialJson,
  type EncodedBatchMaterial,
  type HttpDaFetch,
  type HttpDaFetchResponse,
} from "./index.js";

const ROOT_A = "0a".repeat(32);
const ROOT_B = "0b".repeat(32);
const PREV_ROOT = "00".repeat(32);
const OWNER = "11".repeat(32);
const KEY = "22".repeat(32);
const VALUE = "33".repeat(32);

const MATERIAL: EncodedBatchMaterial = {
  anchoredRoot: ROOT_A,
  prevRoot: PREV_ROOT,
  committedEntries: [{ name: "alice", ownerPubkey: OWNER }],
  baseLeaves: [],
  servedLeaves: [{ keyHex: KEY, valueHex: VALUE }],
};

describe("HTTP DA record source", () => {
  it("fetches /da/:root and decodes a full material record", async () => {
    const calls: string[] = [];
    const source = createHttpDaRecordSource({
      endpoint: "https://publisher.example/archive",
      fetch: fetchReturning(calls, response(200, encodeEncodedMaterialJson(MATERIAL))),
    });

    await expect(source.fetchRecord(ROOT_A)).resolves.toEqual(MATERIAL);
    expect(calls).toEqual([`https://publisher.example/archive/da/${ROOT_A}`]);
  });

  it("validates anchoredRoot before URL construction or fetch", async () => {
    const calls: string[] = [];
    const source = createHttpDaRecordSource({
      endpoint: "not a url",
      fetch: fetchReturning(calls, response(200, encodeEncodedMaterialJson(MATERIAL))),
    });

    await expect(source.fetchRecord(ROOT_A.toUpperCase())).resolves.toBeNull();
    await expect(source.fetchRecord("xyz")).resolves.toBeNull();
    await expect(source.fetchRecord("ab".repeat(16))).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it("404, non-200, network error, and malformed body fail closed to null", async () => {
    await expect(sourceWith(response(404, "")).fetchRecord(ROOT_A)).resolves.toBeNull();
    await expect(sourceWith(response(500, "down")).fetchRecord(ROOT_A)).resolves.toBeNull();
    await expect(
      createHttpDaRecordSource({ endpoint: "https://publisher.example", fetch: () => Promise.reject(new Error("down")) })
        .fetchRecord(ROOT_A),
    ).resolves.toBeNull();
    await expect(sourceWith(response(200, "{")).fetchRecord(ROOT_A)).resolves.toBeNull();
  });

  it("a timeout abort resolves null and never rejects", async () => {
    const honoringAbort: HttpDaFetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const ignoringAbort: HttpDaFetch = () => new Promise(() => undefined);

    await expect(
      createHttpDaRecordSource({ endpoint: "https://publisher.example", fetch: honoringAbort, timeoutMs: 1 })
        .fetchRecord(ROOT_A),
    ).resolves.toBeNull();
    await expect(
      createHttpDaRecordSource({ endpoint: "https://publisher.example", fetch: ignoringAbort, timeoutMs: 1 })
        .fetchRecord(ROOT_A),
    ).resolves.toBeNull();
  });

  it("does not trust the served anchoredRoot field as the requested root", async () => {
    const source = sourceWith(response(200, encodeEncodedMaterialJson({ ...MATERIAL, anchoredRoot: ROOT_B })));

    await expect(source.fetchRecord(ROOT_A)).resolves.toEqual({ ...MATERIAL, anchoredRoot: ROOT_B });
  });
});

function sourceWith(fetchResponse: HttpDaFetchResponse) {
  return createHttpDaRecordSource({ endpoint: "https://publisher.example", fetch: fetchReturning([], fetchResponse) });
}

function response(status: number, body: string): HttpDaFetchResponse {
  return {
    status,
    text: () => Promise.resolve(body),
  };
}

function fetchReturning(calls: string[], fetchResponse: HttpDaFetchResponse): HttpDaFetch {
  return async (url) => {
    calls.push(url);
    return fetchResponse;
  };
}
