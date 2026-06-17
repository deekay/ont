// @ont/indexer live — G2 slice 2b: a durable FILE-backed ConfirmedAnchorStore.
//
// The in-memory ConfirmedAnchorStore (runner.ts) loses every confirmed anchor on restart. This persists the
// record set to a JSON array (via the slice-2a codec) so a restarted indexer/resolver re-serves already-
// confirmed RootAnchor txs. The store keys by anchoredRoot (`has`) and anchorTxid (`getByTxid`), mirroring the
// in-memory store; both indexes rehydrate from disk.
//
// Durability rules (CL watches, events f9aa7f6d / c75f21b4):
//  - missing file (ENOENT) ⇒ empty store; any other read error fails closed.
//  - a corrupt file (non-JSON / non-array / undecodable record / duplicate root / duplicate txid) fails closed —
//    never a silent winner. A failed hydrate stays failed (memoized) — fail-closed is the point.
//  - put is replace-by-root; a new record whose txid is already mapped to a DIFFERENT root fails closed.
//  - writes are atomic + durability-before-visibility: build the next maps/array, write the same-dir temp file,
//    rename it over the final file, and ONLY THEN publish the new in-memory maps. If writeFile/rename fails the
//    live maps remain the last durable state. The temp name differs from the final file, so a leftover temp from
//    a crashed rename is never read as store state on restart (hydrate reads only `filePath`).
//
// fs is an injectable seam so the write-failure path is testable; production uses nodeFileStoreFs.
import { dirname } from "node:path";
import type { ConfirmedAnchorRecord, ConfirmedAnchorStore } from "../ingest-anchors.js";
import { encodeConfirmedAnchorRecord, decodeConfirmedAnchorRecord } from "./confirmed-anchor-codec.js";
import { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";

// The fs seam is shared with the cursor store; re-export so existing consumers/tests keep importing it here.
export { type FileStoreFs, nodeFileStoreFs };

interface StoreState {
  byRoot: Map<string, ConfirmedAnchorRecord>;
  byTxid: Map<string, ConfirmedAnchorRecord>;
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

function failStore(reason: string): never {
  throw new Error(`invalid confirmed-anchor store file: ${reason}`);
}

export function createFileConfirmedAnchorStore(
  filePath: string,
  fs: FileStoreFs = nodeFileStoreFs,
): ConfirmedAnchorStore {
  const tempPath = `${filePath}.tmp`;
  let hydrated: Promise<StoreState> | null = null;

  async function loadFromDisk(): Promise<StoreState> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath);
    } catch (error) {
      if (isFileNotFound(error)) return { byRoot: new Map(), byTxid: new Map() }; // clean start
      failStore("could not read store file");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      failStore("not valid JSON");
    }
    if (!Array.isArray(parsed)) failStore("expected a JSON array of records");

    const byRoot = new Map<string, ConfirmedAnchorRecord>();
    const byTxid = new Map<string, ConfirmedAnchorRecord>();
    for (const entry of parsed) {
      let record: ConfirmedAnchorRecord;
      try {
        record = decodeConfirmedAnchorRecord(entry);
      } catch (error) {
        failStore(error instanceof Error ? error.message : "undecodable record");
      }
      const root = record.confirmedAnchor.anchoredRoot;
      const txid = record.confirmedAnchor.anchorTxid;
      if (byRoot.has(root)) failStore(`duplicate root ${root}`);
      if (byTxid.has(txid)) failStore(`duplicate txid ${txid}`);
      byRoot.set(root, record);
      byTxid.set(txid, record);
    }
    return { byRoot, byTxid };
  }

  function ensureHydrated(): Promise<StoreState> {
    hydrated ??= loadFromDisk();
    return hydrated;
  }

  return {
    async has(anchoredRoot: string): Promise<boolean> {
      const state = await ensureHydrated();
      return state.byRoot.has(anchoredRoot);
    },
    async getByTxid(anchorTxid: string): Promise<ConfirmedAnchorRecord | null> {
      const state = await ensureHydrated();
      return state.byTxid.get(anchorTxid) ?? null;
    },
    async put(record: ConfirmedAnchorRecord): Promise<void> {
      const state = await ensureHydrated();
      const root = record.confirmedAnchor.anchoredRoot;
      const txid = record.confirmedAnchor.anchorTxid;

      // Cross-root txid collision → fail closed (storage corruption; mirrors the hydrate duplicate guard).
      const existingForTxid = state.byTxid.get(txid);
      if (existingForTxid && existingForTxid.confirmedAnchor.anchoredRoot !== root) {
        throw new Error(`confirmed-anchor store: txid ${txid} is already mapped to a different root`);
      }

      // Build the NEXT maps without mutating live state (durability-before-visibility).
      const nextByRoot = new Map(state.byRoot);
      const nextByTxid = new Map(state.byTxid);
      const prev = nextByRoot.get(root);
      if (prev && prev.confirmedAnchor.anchorTxid !== txid) nextByTxid.delete(prev.confirmedAnchor.anchorTxid);
      nextByRoot.set(root, record);
      nextByTxid.set(txid, record);

      // Encode the full array (re-validates every record incl. the new one) and write atomically.
      const data = JSON.stringify([...nextByRoot.values()].map(encodeConfirmedAnchorRecord));
      await fs.mkdir(dirname(filePath));
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, filePath);

      // Publish only after the durable rewrite succeeded.
      state.byRoot = nextByRoot;
      state.byTxid = nextByTxid;
    },
  };
}
