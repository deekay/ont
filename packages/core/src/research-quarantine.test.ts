import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

// Research / simulation code (src/research/*) proves scaling-design properties;
// none of it can take or change a name. It must stay a leaf that the rest of
// @ont/core (allocation, indexer) never depends on, just as the frozen core in
// @ont/consensus never does. See docs/design/ONT_SOVEREIGNTY_MAP.md.
//
// NOTE: the accumulator + anchored root chain GRADUATED out of src/research/ once
// the live indexer began observing the root chain (accumulator.ts, root-anchor.ts
// now live in src/). They are cheap-rail production, not simulation — so the
// indexer depending on them is correct and does not violate this boundary. What
// remains under src/research/ is genuinely non-load-bearing (batch-rail and the
// DA / merge / recovery / issuance simulations).
function importSpecifiers(file: string): readonly string[] {
  const text = readFileSync(join(srcDir, file), "utf8");
  const specifiers: string[] = [];
  const fromRe = /\bfrom\s*["']([^"']+)["']/g;
  const bareRe = /\bimport\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(text)) !== null) {
    specifiers.push(match[1] as string);
  }
  while ((match = bareRe.exec(text)) !== null) {
    specifiers.push(match[1] as string);
  }
  return specifiers;
}

describe("research quarantine (docs/design/ONT_SOVEREIGNTY_MAP.md)", () => {
  it("no production module outside src/research/ imports research/simulation code", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(srcDir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) {
        continue;
      }
      // The package barrel intentionally re-exports research for convenience;
      // consumers opt in, the allocation/indexer modules never do.
      if (file === "index.ts") {
        continue;
      }
      for (const specifier of importSpecifiers(file)) {
        if (/(^|\/)research\//.test(specifier)) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }

    expect(
      offenders,
      `These production modules import research/simulation code, which must stay a leaf the ` +
        `allocation and indexer surfaces never depend on:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
