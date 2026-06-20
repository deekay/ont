import { describe, expect, it } from "vitest";
// Import by PACKAGE NAME (not a relative path) so this smoke catches a broken public surface / mis-wired
// resolution — index.ts re-exports + the tsconfig paths entry. The build-output exports path is additionally
// exercised the moment a built consumer (apps/indexer, LE-INDEX 2/3) imports the package through the topo build.
import {
  createFileNameStateStore,
  encodeNameStateRecord,
  decodeNameStateRecord,
  nodeFileStoreFs,
  type NameStateRecord,
  type NameStateStore,
} from "@ont/name-state-store";

describe("@ont/name-state-store public import smoke", () => {
  it("resolves by name and exposes the public API", () => {
    expect(typeof createFileNameStateStore).toBe("function");
    expect(typeof encodeNameStateRecord).toBe("function");
    expect(typeof decodeNameStateRecord).toBe("function");
    expect(typeof nodeFileStoreFs.writeFile).toBe("function");
    // Type-only references so the public types are part of the surface this smoke pins.
    const _store: NameStateStore | null = null;
    const _record: NameStateRecord | null = null;
    expect(_store).toBeNull();
    expect(_record).toBeNull();
  });
});
