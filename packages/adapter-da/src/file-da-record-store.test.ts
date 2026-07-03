import { describe, expect, it } from "vitest";
import {
  BATCH_MATERIAL_FILE,
  createFileDaRecordStore,
  decodeEncodedMaterialJson,
  type EncodedBatchMaterial,
  type FileStoreFs,
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

describe("file DA record store", () => {
  it("indexes a generator-shaped batch-material file by anchoredRoot and returns canonical record JSON", async () => {
    const fs = fsReturning({ materials: [MATERIAL] });
    const store = createFileDaRecordStore("/da", fs);

    const raw = await store.getRecord(ROOT_A);

    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(MATERIAL);
    expect(decodeEncodedMaterialJson(raw!)).toEqual(MATERIAL);
    expect(fs.reads).toEqual([`/da/${BATCH_MATERIAL_FILE}`]);
  });

  it("validates anchoredRoot before any file lookup", async () => {
    const fs = fsReturning({ materials: [MATERIAL] });
    const store = createFileDaRecordStore("/da", fs);

    await expect(store.getRecord(ROOT_A.toUpperCase())).resolves.toBeNull();
    await expect(store.getRecord("xyz")).resolves.toBeNull();
    await expect(store.getRecord("ab".repeat(16))).resolves.toBeNull();
    expect(fs.reads).toEqual([]);
  });

  it("unknown, missing, malformed, and duplicate material files fail closed to null", async () => {
    await expect(createFileDaRecordStore("/da", fsReturning({ materials: [MATERIAL] })).getRecord(ROOT_B)).resolves.toBeNull();
    await expect(createFileDaRecordStore("/da", fsThrowing("ENOENT")).getRecord(ROOT_A)).resolves.toBeNull();
    await expect(createFileDaRecordStore("/da", fsRaw("{")).getRecord(ROOT_A)).resolves.toBeNull();
    await expect(
      createFileDaRecordStore("/da", fsReturning({ materials: [MATERIAL, { ...MATERIAL }] })).getRecord(ROOT_A),
    ).resolves.toBeNull();
  });
});

function fsReturning(value: unknown): FileStoreFs & { readonly reads: string[] } {
  return fsRaw(JSON.stringify(value));
}

function fsRaw(raw: string): FileStoreFs & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async readFile(path: string): Promise<string> {
      reads.push(path);
      return raw;
    },
  };
}

function fsThrowing(code: string): FileStoreFs & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    async readFile(path: string): Promise<string> {
      reads.push(path);
      const error = new Error(code) as Error & { code: string };
      error.code = code;
      throw error;
    },
  };
}
