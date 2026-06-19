// @ont/anchor-store — shared durable confirmed-anchor store (G2 slice 6a). node-targeted: the slice-2a codec +
// slice-2b file store + the record/store types, extracted from @ont/indexer so the indexer (writer) and the
// resolver (reader) share ONE durable surface — no app->app edge, no codec duplication. The indexer's cursor
// store stays indexer-owned (it is not part of the resolver read path).
export type { ConfirmedAnchorRecord, ConfirmedAnchorStore } from "./record.js";
export {
  encodeConfirmedAnchorRecord,
  decodeConfirmedAnchorRecord,
  type EncodedConfirmedAnchorRecord,
} from "./confirmed-anchor-codec.js";
export { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";
export { createFileConfirmedAnchorStore } from "./file-confirmed-anchor-store.js";
