// @ont/header-store — shared durable Bitcoin header range store for indexer→resolver transport.
export type { HeaderRecord, HeaderRangeStore } from "./record.js";
export {
  encodeHeaderRecord,
  decodeHeaderRecord,
  isHeaderHeight,
  isHeaderHex,
  type EncodedHeaderRecord,
} from "./header-record-codec.js";
export { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";
export { createFileHeaderRangeStore } from "./file-header-range-store.js";
export { createInMemoryHeaderRangeStore } from "./memory-header-range-store.js";
