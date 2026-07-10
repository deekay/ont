import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function* productionTypeScriptFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "legacy") {
      continue;
    }

    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* productionTypeScriptFiles(path);
      continue;
    }

    if (entry.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.endsWith(".d.ts")) {
      yield path;
    }
  }
}

function repoRelative(path: string): string {
  return relative(repoRoot, path).split(sep).join("/");
}

describe("reduceBlock authority scaffold (§7.1, additive mode)", () => {
  it("enumerates the exact name-state sink set, with the direct writer loud as cutover-gated", () => {
    const sinks = new Set<string>();

    for (const root of ["packages", "apps"]) {
      for (const path of productionTypeScriptFiles(resolve(repoRoot, root))) {
        const rel = repoRelative(path);
        const source = readFileSync(path, "utf8");

        if (source.includes(".names.set(")) {
          sinks.add(
            rel === "packages/consensus/src/engine.ts"
              ? "OntState reducer: packages/consensus/src/engine.ts"
              : `UNEXPECTED OntState write: ${rel}`
          );
        }

        if (/nameStateStore\.put(?:Many)?\(/.test(source)) {
          sinks.add(
            rel === "apps/indexer/src/enforce-batched-claims.ts"
              ? "KNOWN second authority, cutover-gated: apps/indexer/src/enforce-batched-claims.ts -> NameStateStore"
              : `UNEXPECTED NameStateStore write: ${rel}`
          );
        }
      }
    }

    expect([...sinks].sort()).toEqual([
      "KNOWN second authority, cutover-gated: apps/indexer/src/enforce-batched-claims.ts -> NameStateStore",
      "OntState reducer: packages/consensus/src/engine.ts",
    ]);
  });
});
