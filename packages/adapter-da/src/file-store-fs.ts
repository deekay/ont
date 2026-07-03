import { readFile } from "node:fs/promises";

export interface FileStoreFs {
  readFile(path: string): Promise<string>;
}

export const nodeFileStoreFs: FileStoreFs = {
  readFile: (path) => readFile(path, "utf8"),
};
