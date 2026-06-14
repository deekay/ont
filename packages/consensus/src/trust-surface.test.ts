import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = dirname(fileURLToPath(import.meta.url));

// The sovereignty trust-surface MANIFEST of @ont/consensus.
// See docs/DESIGN.md (trust surface / sovereignty map) ("the whole trust surface: ~7 files").
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
//
// The audited B2 package splits into four tiers (DECISIONS b2-scanner-boundary
// (#57), b2-consensus-params-boundary (#58), b2-consensus-verdicts-boundary
// (#59)). "Consensus-deciding" is NOT synonymous with "state-mutating":
//   - CORE_DECIDERS: the state/replay deciders. They MUTATE name state — a
//     name's owner moves only if these say so — via owner-key authority and
//     deterministic Bitcoin replay.
//   - CONSENSUS_SUPPORT: non-mutating but consensus-bearing input normalization
//     (the scanner: skip-bad, future-version gating, same-block-order, and the
//     >1-RootAnchor whole-tx reject decide which bytes ever reach the deciders,
//     so two implementations that scan differently fork before the core sees
//     anything — it must be audited, but it has zero authority to mutate name
//     state, so it is not a decider).
//   - CONSENSUS_PARAMS: the pure consensus-parameter surface (the validated
//     (K, W, C) DA-window triple per canon Item 5). It mutates nothing and
//     decides nothing on its own — it is the parametric input the audited rules
//     are evaluated against, so the deciders depend on it, not the reverse. It
//     takes values as caller inputs and depends on nothing outside the audited
//     modules (no external package, no host I/O).
//   - CONSENSUS_VERDICTS: pure verdict deciders (the DA-verdict predicate). They
//     ARE consensus-deciding — a claim counts only if the DA verdict says so
//     (D10) — but they compute a verdict the state deciders consume rather than
//     mutating state themselves, so they are listed separately from
//     CORE_DECIDERS. Pure: they consume only witnessed facts plus the audited
//     parameter surface, no external package and no host I/O.
const CORE_DECIDERS = ["engine.ts", "state.ts", "proof-bundle.ts"] as const;
const CONSENSUS_SUPPORT = ["scanner.ts"] as const;
const CONSENSUS_PARAMS = ["params.ts"] as const;
const CONSENSUS_VERDICTS = ["da-verdict.ts"] as const;

// Deciders ride the legacy protocol/bitcoin primitives; consensus-support rides
// the B1 normative wire grammar (@ont/wire) — B1 → B2 means @ont/consensus
// consumes @ont/wire for what the active codec understands; the parameter
// surface and the verdict predicates ride nothing external (witnessed facts and
// parameters enter as inputs).
const DECIDER_ALLOWED_PACKAGES = new Set(["@ont/protocol", "@ont/bitcoin"]);
const SUPPORT_ALLOWED_PACKAGES = new Set(["@ont/wire", "@ont/bitcoin"]);
const PARAMS_ALLOWED_PACKAGES = new Set<string>([]);
const VERDICTS_ALLOWED_PACKAGES = new Set<string>([]);
const ALL_MANIFEST = [...CORE_DECIDERS, ...CONSENSUS_SUPPORT, ...CONSENSUS_PARAMS, ...CONSENSUS_VERDICTS];
const ALLOWED_RELATIVE = new Set(ALL_MANIFEST.map((file) => `./${file.replace(/\.ts$/, ".js")}`));

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

function assertImportsAllowed(file: string, allowedPackages: ReadonlySet<string>, tier: string): void {
  for (const specifier of importSpecifiers(file)) {
    if (specifier.startsWith("node:")) {
      continue;
    }
    const allowed = allowedPackages.has(specifier) || ALLOWED_RELATIVE.has(specifier);
    expect(
      allowed,
      `${file} (${tier}) must not import "${specifier}". It may depend only on ` +
        `${[...allowedPackages].join(", ")}, node builtins, and the other audited B2 modules ` +
        `(${ALL_MANIFEST.join(", ")}). Importing allocation (auctions), indexer/resolver ` +
        `convenience, or research/simulation code here would silently expand the trust surface a ` +
        `newcomer must audit. See docs/DESIGN.md (trust surface / sovereignty map) and ` +
        `DECISIONS b2-scanner-boundary (#57).`
    ).toBe(true);
  }
}

describe("sovereignty trust surface (docs/DESIGN.md (trust surface / sovereignty map))", () => {
  for (const file of CORE_DECIDERS) {
    it(`${file} (core decider) depends only on protocol/bitcoin primitives and audited modules`, () => {
      assertImportsAllowed(file, DECIDER_ALLOWED_PACKAGES, "core decider");
    });
  }

  for (const file of CONSENSUS_SUPPORT) {
    it(`${file} (consensus support) depends only on @ont/wire grammar, @ont/bitcoin, and audited modules`, () => {
      assertImportsAllowed(file, SUPPORT_ALLOWED_PACKAGES, "consensus support");
    });
  }

  for (const file of CONSENSUS_PARAMS) {
    it(`${file} (consensus params) depends on no external package — only audited modules`, () => {
      assertImportsAllowed(file, PARAMS_ALLOWED_PACKAGES, "consensus params");
    });
  }

  for (const file of CONSENSUS_VERDICTS) {
    it(`${file} (consensus verdict) depends on no external package — only audited modules`, () => {
      assertImportsAllowed(file, VERDICTS_ALLOWED_PACKAGES, "consensus verdict");
    });
  }

  it("every source file in the package is part of the documented audited manifest", () => {
    // @ont/consensus exists to BE the trust surface, so its production modules
    // should be exactly the documented decider + support files — nothing else
    // slips in here.
    const production = readdirSync(srcDir)
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "index.ts")
      .sort();
    expect(production).toEqual([...ALL_MANIFEST].sort());
  });
});
