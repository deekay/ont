import { dirname } from "node:path";
import type { HeaderRangeStore, HeaderRecord } from "./record.js";
import { decodeHeaderRecord, encodeHeaderRecord, isHeaderHeight } from "./header-record-codec.js";
import { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";

export { type FileStoreFs, nodeFileStoreFs };

interface StoreState {
  byHeight: Map<number, HeaderRecord>;
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

function failStore(reason: string): never {
  throw new Error(`invalid header-range store file: ${reason}`);
}

function isRange(startHeight: number, count: number): boolean {
  return Number.isInteger(startHeight) && startHeight >= 0 && Number.isInteger(count) && count >= 1;
}

export function createFileHeaderRangeStore(
  filePath: string,
  fs: FileStoreFs = nodeFileStoreFs,
): HeaderRangeStore {
  const tempPath = `${filePath}.tmp`;
  let hydrated: Promise<StoreState> | null = null;

  async function loadFromDisk(): Promise<StoreState> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath);
    } catch (error) {
      if (isFileNotFound(error)) return { byHeight: new Map() };
      failStore("could not read store file");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      failStore("not valid JSON");
    }
    if (!Array.isArray(parsed)) failStore("expected a JSON array of records");

    const byHeight = new Map<number, HeaderRecord>();
    for (const entry of parsed) {
      let record: HeaderRecord;
      try {
        record = decodeHeaderRecord(entry);
      } catch (error) {
        failStore(error instanceof Error ? error.message : "undecodable record");
      }
      if (byHeight.has(record.height)) failStore(`duplicate height ${record.height}`);
      byHeight.set(record.height, record);
    }
    return { byHeight };
  }

  function ensureHydrated(): Promise<StoreState> {
    hydrated ??= loadFromDisk();
    return hydrated;
  }

  async function writeBatch(records: readonly HeaderRecord[]): Promise<void> {
    if (records.length === 0) return;
    const state = await ensureHydrated();
    const nextByHeight = new Map(state.byHeight);
    const seen = new Set<number>();

    for (const record of records) {
      const encoded = encodeHeaderRecord(record);
      if (seen.has(encoded.height)) throw new Error(`header-range store: duplicate height ${encoded.height} in batch`);
      seen.add(encoded.height);
      const existing = nextByHeight.get(encoded.height);
      if (existing !== undefined && existing.headerHex !== encoded.headerHex) {
        throw new Error(`header-range store: height ${encoded.height} is already mapped to a different header`);
      }
      nextByHeight.set(encoded.height, encoded);
    }

    const ordered = [...nextByHeight.values()].sort((left, right) => left.height - right.height);
    const data = JSON.stringify(ordered.map(encodeHeaderRecord));
    await fs.mkdir(dirname(filePath));
    await fs.writeFile(tempPath, data);
    await fs.rename(tempPath, filePath);

    state.byHeight = nextByHeight;
  }

  return {
    async has(height: number): Promise<boolean> {
      if (!isHeaderHeight(height)) return false;
      const state = await ensureHydrated();
      return state.byHeight.has(height);
    },
    put: (record) => writeBatch([record]),
    putMany: (records) => writeBatch(records),
    async getRange(startHeight: number, count: number): Promise<readonly string[] | null> {
      if (!isRange(startHeight, count)) return null;
      const state = await ensureHydrated();
      const headers: string[] = [];
      for (let offset = 0; offset < count; offset += 1) {
        const height = startHeight + offset;
        if (!isHeaderHeight(height)) return null;
        const record = state.byHeight.get(height);
        if (record === undefined) return null;
        headers.push(record.headerHex);
      }
      return headers;
    },
  };
}
