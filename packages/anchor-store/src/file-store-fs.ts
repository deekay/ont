// @ont/indexer live — G2: the injectable filesystem seam shared by the durable file stores (cursor + confirmed
// anchors). Both stores use the same atomic temp+rename write discipline, so they share one fs contract. The
// seam exists so the write-failure / durability paths are unit-testable; production uses nodeFileStoreFs.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";

/** The filesystem operations a durable file store needs — injectable so write failures are testable. */
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
