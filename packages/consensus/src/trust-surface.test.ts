import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

// The sovereignty trust-surface MANIFEST of @ont/consensus.
// See docs/design/ONT_SOVEREIGNTY_MAP.md ("the whole trust surface: ~7 files").
// Today these modules hold owner-key authority and replay validation: a name
// moves only if its current owner key signed it, and that is provable to
// anyone. They do NOT yet decide all ownership — auction settlement and
// cheap-rail finalization live outside and are migrating inside per Decisions
// #42/#44 (see docs/core/STATUS.md for the honest scoped claim). They must
// depend ONLY on the protocol/bitcoin primitives and on each other — never on
// allocation policy, convenience (indexer/resolver), or research/simulation
// code.
//
// Per Decision #44 (docs/core/DECISIONS.md), this list is a boundary manifest,
// not a dev-time freeze: during development it MAY change, but only together
// with a numbered DECISIONS.md entry and conformance coverage — this test
// exists so *silent* drift fails the build. The boundary freezes permanently
// at public/mainnet launch (a launch-gate checklist item). If you are editing
// this list, write the decision entry first.
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
          `${file} must not import "${specifier}". The audited sovereignty core may depend only on ` +
            `@ont/protocol, @ont/bitcoin, node builtins, and the other core files ` +
            `(${SOVEREIGNTY_CORE.join(", ")}). Importing allocation (auctions), indexer/resolver ` +
            `convenience, or research/simulation code here would silently expand the trust surface a ` +
            `newcomer must audit. See docs/design/ONT_SOVEREIGNTY_MAP.md.`
        ).toBe(true);
      }
    });
  }

  it("every source file in the package is part of the documented core manifest", () => {
    // @ont/consensus exists to BE the trust surface, so its production modules
    // should be exactly the documented core files — nothing else slips in here.
    const production = readdirSync(srcDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "index.ts")
      .sort();
    expect(production).toEqual([...SOVEREIGNTY_CORE].sort());
  });
});
