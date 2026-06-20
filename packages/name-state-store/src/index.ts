// @ont/name-state-store — durable enforced name-state store (live-enforcement LE-INDEX). node-targeted: the
// NameStateRecord/store types + the strict codec + the file store, so the indexer (writer, on an accepted
// batched claim) and the resolver (reader, per name) share ONE durable surface — no app->app edge, no codec
// duplication. Persistence only; the audited core (claim-path enforceBatchedClaim) decides before a record is
// written. See docs/core/LIVE_ENFORCEMENT_PLAN.md §2a.
export type {
  NameStateRecord,
  NameStateStore,
  NameStateOwner,
  NameStateAnchorCoords,
  NameStateTraceStep,
} from "./record.js";
export {
  encodeNameStateRecord,
  decodeNameStateRecord,
  type EncodedNameStateRecord,
} from "./name-state-codec.js";
export { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";
export { createFileNameStateStore } from "./file-name-state-store.js";
