import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

// The minimal, frozen sovereignty trust surface inside @ont/core.
// See docs/design/ONT_SOVEREIGNTY_MAP.md ("the whole trust surface: ~7 files").
// These modules decide whether a name can be taken: a name moves only if its
// current owner key signed it, uniqueness/finality come from deterministic
// Bitcoin replay, and ownership is provable to anyone. They must depend ONLY on
// the protocol/bitcoin primitives and on each other — never on allocation
// (auctions), convenience (indexer/resolver), or research/simulation code.
// This test freezes that boundary so the surface a newcomer must audit cannot
// silently grow.
const SOVEREIGNTY_CORE = ["engine.ts", "state.ts", "proof-bundle.ts"] as const;

const CORE_ALLOWED_PACKAGES = new Set(["@ont/protocol", "@ont/bitcoin"]);
const CORE_ALLOWED_RELATIVE = new Set(
  SOVEREIGNTY_CORE.map((file) => `./${file.replace(/\.ts$/, ".js")}`)
);

function importSpecifiers(file: string): readonly string[] {
  const text = readFileSync(join(srcDir, file), "utf8");
  const specifiers: string[] = [];
  // `import ... from "x"`, `import type ... from "x"`, `export ... from "x"`.
  const fromRe = /\bfrom\s*["']([^"']+)["']/g;
  // Bare side-effect imports: `import "x"`.
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

describe("sovereignty trust surface (docs/design/ONT_SOVEREIGNTY_MAP.md)", () => {
  for (const file of SOVEREIGNTY_CORE) {
    it(`${file} depends only on protocol/bitcoin primitives and other core files`, () => {
      for (const specifier of importSpecifiers(file)) {
        if (specifier.startsWith("node:")) {
          continue;
        }

        const allowed =
          CORE_ALLOWED_PACKAGES.has(specifier) || CORE_ALLOWED_RELATIVE.has(specifier);

        expect(
          allowed,
          `${file} must not import "${specifier}". The frozen sovereignty core may depend only on ` +
            `@ont/protocol, @ont/bitcoin, node builtins, and the other core files ` +
            `(${SOVEREIGNTY_CORE.join(", ")}). Importing allocation (auctions), indexer/resolver ` +
            `convenience, or research/simulation code here would silently expand the trust surface a ` +
            `newcomer must audit. See docs/design/ONT_SOVEREIGNTY_MAP.md.`
        ).toBe(true);
      }
    });
  }

  it("every source file in the package is part of the documented frozen core", () => {
    // @ont/consensus exists to BE the trust surface, so its production modules
    // should be exactly the documented core files — nothing else slips in here.
    const production = readdirSync(srcDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "index.ts")
      .sort();
    expect(production).toEqual([...SOVEREIGNTY_CORE].sort());
  });
});
