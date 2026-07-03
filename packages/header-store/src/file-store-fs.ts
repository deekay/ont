import { readFile, writeFile, rename, mkdir } from "node:fs/promises";

export interface FileStoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  mkdir(path: string): Promise<void>;
}

export const nodeFileStoreFs: FileStoreFs = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile: (path, data) => writeFile(path, data, "utf8"),
  rename: (from, to) => rename(from, to),
  mkdir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
};
