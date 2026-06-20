// @ont/name-state-store — the injectable filesystem seam for the durable name-state file store. Same atomic
// temp+rename discipline as @ont/anchor-store's store; kept local (a trivial generic seam) so this package has
// no runtime dependency. The seam exists so the write-failure / durability paths are unit-testable; production
// uses nodeFileStoreFs.
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
