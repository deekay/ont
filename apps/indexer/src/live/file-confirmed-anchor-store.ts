// @ont/indexer live — G2 slice 2b: a durable FILE-backed ConfirmedAnchorStore.
//
// The in-memory ConfirmedAnchorStore (runner.ts) loses every confirmed anchor on restart. This persists the
// record set to a JSON array (via the slice-2a codec) so a restarted indexer/resolver re-serves already-
// confirmed RootAnchor txs. The store keys by anchoredRoot (`has`) and anchorTxid (`getByTxid`), mirroring the
// in-memory store; both indexes rehydrate from disk.
//
// Durability rules (CL watches, event f9aa7f6d):
//  - missing file (ENOENT) ⇒ empty store; any other read error fails closed.
//  - a corrupt file (non-JSON / non-array / undecodable record / duplicate root / duplicate txid) fails closed —
//    never a silent winner.
//  - put is replace-by-root; a new record whose txid is already mapped to a DIFFERENT root fails closed.
//  - writes are atomic (same-dir temp file + rename) and durability-before-visibility: the in-memory maps are
//    published ONLY after the durable rewrite succeeds, so a write failure keeps serving the last durable state.
//
// fs is an injectable seam so the write-failure path is testable; production uses nodeFileStoreFs.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConfirmedAnchorRecord, ConfirmedAnchorStore } from "../ingest-anchors.js";
import { encodeConfirmedAnchorRecord, decodeConfirmedAnchorRecord } from "./confirmed-anchor-codec.js";

/** The filesystem operations the store needs — injectable so write failures are testable. */
export interface FileStoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

/** The production fs seam over node:fs/promises (utf8 text, recursive mkdir). */
export const nodeFileStoreFs: FileStoreFs = {
  readFile: (p) => readFile(p, "utf8"),
  writeFile: (p, d) => writeFile(p, d, "utf8"),
  rename: (a, b) => rename(a, b),
  mkdir: (p) => mkdir(p, { recursive: true }).then(() => undefined),
};

export function createFileConfirmedAnchorStore(
  filePath: string,
  fs: FileStoreFs = nodeFileStoreFs,
): ConfirmedAnchorStore {
  void filePath;
  void fs;
  void dirname;
  void encodeConfirmedAnchorRecord;
  void decodeConfirmedAnchorRecord;
  const notImplemented = (): Promise<never> =>
    Promise.reject(new Error("file confirmed-anchor store not implemented"));
  return {
    has: notImplemented,
    put: notImplemented,
    getByTxid: notImplemented,
  };
}

export type { ConfirmedAnchorRecord };
