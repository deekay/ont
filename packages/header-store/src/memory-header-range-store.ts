import type { HeaderRangeStore, HeaderRecord } from "./record.js";
import { encodeHeaderRecord, isHeaderHeight } from "./header-record-codec.js";

function isRange(startHeight: number, count: number): boolean {
  return Number.isInteger(startHeight) && startHeight >= 0 && Number.isInteger(count) && count >= 1;
}

export function createInMemoryHeaderRangeStore(records: readonly HeaderRecord[] = []): HeaderRangeStore {
  const byHeight = new Map<number, HeaderRecord>();
  const store: HeaderRangeStore = {
    has: (height) => Promise.resolve(isHeaderHeight(height) && byHeight.has(height)),
    put: (record) => store.putMany([record]),
    putMany: (batch) => {
      const seen = new Set<number>();
      for (const record of batch) {
        const encoded = encodeHeaderRecord(record);
        if (seen.has(encoded.height)) throw new Error(`header-range store: duplicate height ${encoded.height} in batch`);
        seen.add(encoded.height);
        const existing = byHeight.get(encoded.height);
        if (existing !== undefined && existing.headerHex !== encoded.headerHex) {
          throw new Error(`header-range store: height ${encoded.height} is already mapped to a different header`);
        }
      }
      for (const record of batch) byHeight.set(record.height, record);
      return Promise.resolve();
    },
    getRange: (startHeight, count) => {
      if (!isRange(startHeight, count)) return Promise.resolve(null);
      const headers: string[] = [];
      for (let offset = 0; offset < count; offset += 1) {
        const height = startHeight + offset;
        if (!isHeaderHeight(height)) return Promise.resolve(null);
        const record = byHeight.get(height);
        if (record === undefined) return Promise.resolve(null);
        headers.push(record.headerHex);
      }
      return Promise.resolve(headers);
    },
  };
  void store.putMany(records);
  return store;
}
