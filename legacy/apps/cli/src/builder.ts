import { writeFile } from "node:fs/promises";

export * from "@ont/architect";

export async function maybeWriteJsonFile(path: string | undefined, value: unknown): Promise<void> {
  if (!path) {
    return;
  }

  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}
