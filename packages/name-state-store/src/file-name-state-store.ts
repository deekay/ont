// @ont/name-state-store — a durable FILE-backed NameStateStore (live-enforcement LE-INDEX).
//
// Persists the enforced per-name record set to a JSON array (via the codec) so a restarted indexer/resolver
// re-serves names accepted before the restart. Keyed by `canonicalName` (`has`/`getByName`); the index
// rehydrates from disk. Mirrors @ont/anchor-store's durability discipline:
//  - missing file (ENOENT) ⇒ empty store; any other read error fails closed.
//  - a corrupt file (non-JSON / non-array / undecodable record / duplicate canonicalName) fails closed —
//    never a silent winner. A failed hydrate stays failed (memoized).
//  - put is replace-by-canonicalName (the loop only puts accepted records; a re-accepted name replaces).
//  - writes are atomic + durability-before-visibility: build the next map, write the same-dir temp file,
//    rename it over the final file, and ONLY THEN publish the new in-memory map. The temp name differs from the
//    final file, so a leftover temp from a crashed rename is never read as store state on restart.
//
// fs is an injectable seam so the write-failure path is testable; production uses nodeFileStoreFs.
import { dirname } from "node:path";
import type { NameStateRecord, NameStateStore } from "./record.js";
import { encodeNameStateRecord, decodeNameStateRecord } from "./name-state-codec.js";
import { type FileStoreFs, nodeFileStoreFs } from "./file-store-fs.js";

// Re-export the fs seam so consumers/tests import it from here, matching @ont/anchor-store's surface.
export { type FileStoreFs, nodeFileStoreFs };

interface StoreState {
  byName: Map<string, NameStateRecord>;
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";
}

function failStore(reason: string): never {
  throw new Error(`invalid name-state store file: ${reason}`);
}

export function createFileNameStateStore(filePath: string, fs: FileStoreFs = nodeFileStoreFs): NameStateStore {
  const tempPath = `${filePath}.tmp`;
  let hydrated: Promise<StoreState> | null = null;

  async function loadFromDisk(): Promise<StoreState> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath);
    } catch (error) {
      if (isFileNotFound(error)) return { byName: new Map() }; // clean start
      failStore("could not read store file");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      failStore("not valid JSON");
    }
    if (!Array.isArray(parsed)) failStore("expected a JSON array of records");

    const byName = new Map<string, NameStateRecord>();
    for (const entry of parsed) {
      let record: NameStateRecord;
      try {
        record = decodeNameStateRecord(entry);
      } catch (error) {
        failStore(error instanceof Error ? error.message : "undecodable record");
      }
      if (byName.has(record.canonicalName)) failStore(`duplicate canonicalName ${record.canonicalName}`);
      byName.set(record.canonicalName, record);
    }
    return { byName };
  }

  function ensureHydrated(): Promise<StoreState> {
    hydrated ??= loadFromDisk();
    return hydrated;
  }

  return {
    async has(canonicalName: string): Promise<boolean> {
      const state = await ensureHydrated();
      return state.byName.has(canonicalName);
    },
    async getByName(canonicalName: string): Promise<NameStateRecord | null> {
      const state = await ensureHydrated();
      return state.byName.get(canonicalName) ?? null;
    },
    async put(record: NameStateRecord): Promise<void> {
      const state = await ensureHydrated();

      // Build the NEXT map without mutating live state (durability-before-visibility).
      const nextByName = new Map(state.byName);
      nextByName.set(record.canonicalName, record);

      // Encode the full array (re-validates every record incl. the new one) and write atomically.
      const data = JSON.stringify([...nextByName.values()].map(encodeNameStateRecord));
      await fs.mkdir(dirname(filePath));
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, filePath);

      // Publish only after the durable rewrite succeeded.
      state.byName = nextByName;
    },
  };
}
