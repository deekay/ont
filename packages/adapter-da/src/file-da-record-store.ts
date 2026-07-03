import { join } from "node:path";
import {
  decodeEncodedMaterialFile,
  encodeEncodedMaterialJson,
  isHex64Lower,
  type EncodedBatchMaterial,
} from "./material-codec.js";
import { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";

export interface DaRecordStore {
  getRecord(anchoredRoot: string): Promise<string | null>;
}

export const BATCH_MATERIAL_FILE = "batch-material.json";

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

export function createFileDaRecordStore(dir: string, fs: FileStoreFs = nodeFileStoreFs): DaRecordStore {
  const filePath = join(dir, BATCH_MATERIAL_FILE);
  let hydrated: Promise<Map<string, EncodedBatchMaterial>> | null = null;

  async function loadFromDisk(): Promise<Map<string, EncodedBatchMaterial>> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath);
    } catch (error) {
      if (isFileNotFound(error)) return new Map();
      return new Map();
    }

    try {
      const parsed = decodeEncodedMaterialFile(JSON.parse(raw));
      const byRoot = new Map<string, EncodedBatchMaterial>();
      for (const material of parsed.materials) {
        if (byRoot.has(material.anchoredRoot)) return new Map();
        byRoot.set(material.anchoredRoot, material);
      }
      return byRoot;
    } catch {
      return new Map();
    }
  }

  function ensureHydrated(): Promise<Map<string, EncodedBatchMaterial>> {
    hydrated ??= loadFromDisk();
    return hydrated;
  }

  return {
    async getRecord(anchoredRoot: string): Promise<string | null> {
      if (!isHex64Lower(anchoredRoot)) return null;
      const byRoot = await ensureHydrated();
      const material = byRoot.get(anchoredRoot);
      return material === undefined ? null : encodeEncodedMaterialJson(material);
    },
  };
}
