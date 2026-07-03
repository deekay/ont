import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeEncodedMaterialJson,
  type EncodedBatchMaterial,
  type HttpDaFetch,
  type HttpDaFetchResponse,
} from "@ont/adapter-da";
import { deriveOwnerPubkey } from "@ont/protocol";
import { describe, expect, it } from "vitest";
import { selectIndexerEnforcement } from "./select-enforcement.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const GENERATOR = join(ROOT, "scripts/generate-fixture-batch-material.mjs");
const OWNER_SECRET = "11".repeat(32);
const OWNER_PUBKEY = deriveOwnerPubkey(OWNER_SECRET);
const HTTP_ROOT = "0c".repeat(32);
const HTTP_PREV_ROOT = "00".repeat(32);
const HTTP_OWNER = "22".repeat(32);
const HTTP_KEY = "33".repeat(32);
const HTTP_VALUE = "44".repeat(32);
const HTTP_MATERIAL: EncodedBatchMaterial = {
  anchoredRoot: HTTP_ROOT,
  prevRoot: HTTP_PREV_ROOT,
  committedEntries: [{ name: "bravo", ownerPubkey: HTTP_OWNER }],
  baseLeaves: [],
  servedLeaves: [{ keyHex: HTTP_KEY, valueHex: HTTP_VALUE }],
};

describe("selectIndexerEnforcement fixture material reader", () => {
  it("loads material emitted by the A' generator under the same material key the anchor input uses", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ont-fixture-material-"));
    try {
      const materialPath = join(dir, "batch-material.json");
      const anchorPath = join(dir, "root-anchor-input.json");
      execFileSync(process.execPath, [
        GENERATOR,
        "--entry-secret",
        `Alice:${OWNER_SECRET}`,
        "--material-out",
        materialPath,
        "--anchor-out",
        anchorPath,
      ], { cwd: ROOT, stdio: "pipe" });

      const materialFile = JSON.parse(readFileSync(materialPath, "utf8")) as {
        materials: [{
          anchoredRoot: string;
          prevRoot: string;
          committedEntries: readonly { name: string; ownerPubkey: string }[];
          baseLeaves: readonly { keyHex: string; valueHex: string }[];
          servedLeaves: readonly { keyHex: string; valueHex: string }[];
        }];
      };
      const anchorInput = JSON.parse(readFileSync(anchorPath, "utf8")) as {
        prevRoot: string;
        newRoot: string;
        batchSize: number;
      };
      const encoded = materialFile.materials[0]!;

      expect(anchorInput.prevRoot).toBe(encoded.prevRoot);
      expect(anchorInput.newRoot).toBe(encoded.anchoredRoot);
      expect(anchorInput.batchSize).toBe(1);
      expect(`${anchorInput.prevRoot}:${anchorInput.newRoot}`).toBe(`${encoded.prevRoot}:${encoded.anchoredRoot}`);

      const enforcement = await selectIndexerEnforcement({
        ONT_ENFORCEMENT: "fixture-file",
        ONT_BATCH_MATERIAL_FILE: materialPath,
      });
      expect(enforcement).not.toBeUndefined();
      const decoded = enforcement!.batchMaterial(anchorInput.newRoot, anchorInput.prevRoot);

      expect(decoded).not.toBeNull();
      expect(decoded?.committedEntries).toEqual([{ name: "alice", ownerPubkey: OWNER_PUBKEY }]);
      expect([...decoded!.baseLeaves.entries()]).toEqual([]);
      expect(decoded?.servedLeaves).toEqual(encoded.servedLeaves);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("selectIndexerEnforcement http-da material reader", () => {
  it("prefetches declared roots at boot into a synchronous cache", async () => {
    const calls: string[] = [];
    const enforcement = await selectIndexerEnforcement(
      {
        ONT_ENFORCEMENT: "http-da",
        ONT_DA_ENDPOINT: "https://publisher.example/base",
        ONT_DA_ROOTS: HTTP_ROOT,
      },
      { daFetch: fetchReturning(calls, response(200, encodeEncodedMaterialJson(HTTP_MATERIAL))) },
    );

    expect(calls).toEqual([`https://publisher.example/base/da/${HTTP_ROOT}`]);
    expect(enforcement).not.toBeUndefined();
    const decoded = enforcement!.batchMaterial(HTTP_ROOT, HTTP_PREV_ROOT);
    const decodedAgain = enforcement!.batchMaterial(HTTP_ROOT, HTTP_PREV_ROOT);
    expect(calls).toHaveLength(1);
    expect(decodedAgain).toEqual(decoded);
    expect(decoded?.committedEntries).toEqual(HTTP_MATERIAL.committedEntries);
    expect([...decoded!.baseLeaves.entries()]).toEqual([]);
    expect(decoded?.servedLeaves).toEqual(HTTP_MATERIAL.servedLeaves);
  });

  it("caches fetched material under the requested root, then lets enforcement firewall mismatched body roots", async () => {
    const served = { ...HTTP_MATERIAL, anchoredRoot: "0d".repeat(32) };
    const enforcement = await selectIndexerEnforcement(
      {
        ONT_ENFORCEMENT: "http-da",
        ONT_DA_ENDPOINT: "https://publisher.example",
        ONT_DA_ROOTS: HTTP_ROOT,
      },
      { daFetch: fetchReturning([], response(200, encodeEncodedMaterialJson(served))) },
    );

    expect(enforcement!.batchMaterial(HTTP_ROOT, HTTP_PREV_ROOT)).not.toBeNull();
    expect(enforcement!.batchMaterial(served.anchoredRoot, HTTP_PREV_ROOT)).toBeNull();
  });

  it("endpoint-down, 404, and malformed body prefetches fail closed to null material", async () => {
    for (const daFetch of [
      fetchReturning([], response(404, "")),
      fetchReturning([], response(200, "{")),
      (() => Promise.reject(new Error("down"))) as HttpDaFetch,
    ]) {
      const enforcement = await selectIndexerEnforcement(
        {
          ONT_ENFORCEMENT: "http-da",
          ONT_DA_ENDPOINT: "https://publisher.example",
          ONT_DA_ROOTS: HTTP_ROOT,
        },
        { daFetch },
      );
      expect(enforcement!.batchMaterial(HTTP_ROOT, HTTP_PREV_ROOT)).toBeNull();
    }
  });

  it("fails closed at boot when http-da required env is missing or malformed", async () => {
    await expect(selectIndexerEnforcement({ ONT_ENFORCEMENT: "http-da", ONT_DA_ROOTS: HTTP_ROOT })).rejects.toThrow(
      /ONT_DA_ENDPOINT/,
    );
    await expect(
      selectIndexerEnforcement({ ONT_ENFORCEMENT: "http-da", ONT_DA_ENDPOINT: "https://publisher.example" }),
    ).rejects.toThrow(/ONT_DA_ROOTS/);
    await expect(
      selectIndexerEnforcement({
        ONT_ENFORCEMENT: "http-da",
        ONT_DA_ENDPOINT: "https://publisher.example",
        ONT_DA_ROOTS: "not-a-root",
      }),
    ).rejects.toThrow(/malformed root/);
  });
});

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
