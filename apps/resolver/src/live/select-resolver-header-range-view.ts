import { join } from "node:path";
import { createFileHeaderRangeStore } from "@ont/header-store";
import type { HeaderRangeViewSource } from "../server.js";

export function selectResolverHeaderRangeView(env: Record<string, string | undefined>): HeaderRangeViewSource | undefined {
  const source = env.ONT_STORE ?? "memory";
  if (source === "memory") return undefined;
  if (source === "file") {
    const dir = env.ONT_STORE_DIR;
    if (!dir) throw new Error("ONT_STORE=file requires ONT_STORE_DIR");
    const path = join(dir, "headers.json");
    return (startHeight, count) => createFileHeaderRangeStore(path).getRange(startHeight, count);
  }
  throw new Error(`ONT_STORE must be memory|file (got ${JSON.stringify(source)})`);
}
