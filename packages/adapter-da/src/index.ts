// @ont/adapter-da — B4 served-bytes DA transport (/da/{root}). See docs/core/B4_ADAPTERS_PLAN.md §10.
export {
  parseServedTransport,
  fetchServedLeaves,
  type DaSource,
  type FetchServedLeavesInput,
} from "./served-transport.js";
export {
  decodeEncodedMaterial,
  decodeEncodedMaterialFile,
  decodeEncodedMaterialJson,
  decodeEncodedBatchMaterial,
  decodeEncodedBatchMaterialFile,
  decodeEncodedBatchMaterialJson,
  encodeEncodedMaterial,
  encodeEncodedMaterialJson,
  encodeEncodedBatchMaterial,
  encodeEncodedBatchMaterialJson,
  isHex64Lower,
  type EncodedBatchMaterial,
  type EncodedBatchMaterialFile,
} from "./material-codec.js";
export { createFileDaRecordStore, BATCH_MATERIAL_FILE, type DaRecordStore } from "./file-da-record-store.js";
export { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";
