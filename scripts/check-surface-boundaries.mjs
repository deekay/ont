#!/usr/bin/env node
// B5 boundary lint (B5_SURFACES_PLAN §7.4) — a ratchet for clean-build surfaces.
//
// Clean-build B5 surfaces consume PUBLISHED @ont/* entrypoints and reimplement no rules. This lint enforces
// the import boundary over an EXPLICIT, checked-in allowlist of rebuilt surfaces (NOT an auto-discover of
// apps/*, which still holds un-rewritten mining-reference apps). Each surface joins the gate when its B5 slice
// quarantines + rebuilds it.
//
// Per surface in the allowlist, scan source + tests (.ts/.tsx/.mts/.cts/.js/.mjs/.cjs) for static
// imports/re-exports and dynamic import()/require() string targets, and DENY:
//   - reaches into `legacy/` (quarantined old code),
//   - relative reaches into `packages/*` (use the published @ont/* entrypoint, not a deep relative path),
//   - `@ont/*/src` or `@ont/*/dist` deep imports (use the package entrypoint),
//   - external crypto/signing libraries (@noble/*, @scure/*, bitcoinjs-lib, ecpair, tiny-secp256k1, secp256k1)
//     — signing lives ONLY in B5-WALLET; other surfaces hand off. (@ont/bitcoin as a published entrypoint is
//     fine for unsigned-tx/txid fixture plumbing — it exposes no private signing/key API.)
// Published bare @ont/* entrypoints, node builtins, vitest, and relative paths WITHIN the surface are allowed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// EXPLICIT allowlist of clean-build surfaces under the boundary gate. Extend as each B5 surface is rebuilt.
const ALLOWLIST = ["apps/claim", "apps/cli", "apps/wallet"];
// apps/wallet is the ONE surface that owns key material + signing (B5_WALLET_CLASSIFICATION.md) — it alone is
// exempt from CRYPTO_DENY. Every other surface stays denied (signing is delegated to the wallet's WalletSigner).
const CRYPTO_EXEMPT = new Set(["apps/wallet"]);

const SCAN_EXT = ["ts", "tsx", "mts", "cts", "js", "mjs", "cjs"];
const CRYPTO_DENY = [/^@noble\//, /^@scure\//, /^bitcoinjs-lib$/, /^ecpair$/, /^tiny-secp256k1$/, /^secp256k1$/];

/** Extract every module specifier referenced by a file (static import/export-from, bare import, dynamic import(), require()). */
function specifiersOf(source) {
  const specs = [];
  const patterns = [
    /(?:^|[^.\w])(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g, // import ... from 'x' / export ... from 'x'
    /(?:^|[^.\w])import\s*['"]([^'"]+)['"]/g, // bare side-effect import 'x'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('x')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('x')
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

/** Return a deny-reason for a specifier in `surface`, or null if allowed. */
function violationFor(spec, surface) {
  if (/(^|\/)legacy\//.test(spec) || spec.includes("legacy/")) return "reaches into legacy/ (quarantined old code)";
  if (spec.includes("packages/")) return "relative reach into packages/* (use the published @ont/* entrypoint)";
  if (/^@ont\/[^/]+\/(src|dist)(\/|$)/.test(spec)) return "@ont/*/src|dist deep import (use the package entrypoint)";
  if (!CRYPTO_EXEMPT.has(surface)) {
    for (const re of CRYPTO_DENY) {
      if (re.test(spec)) return `external crypto/signing lib '${spec}' (signing is B5-WALLET only)`;
    }
  }
  return null;
}

function gitLsFiles(globs) {
  try {
    const out = execFileSync("git", ["ls-files", ...globs], { encoding: "utf8" });
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

let violations = 0;
for (const surface of ALLOWLIST) {
  if (!existsSync(surface)) {
    console.error(`BOUNDARY: allowlisted surface '${surface}' is missing`);
    violations += 1;
    continue;
  }
  if (!existsSync(`${surface}/package.json`)) {
    console.error(`BOUNDARY: allowlisted surface '${surface}' has no package.json`);
    violations += 1;
    continue;
  }
  const files = gitLsFiles(SCAN_EXT.map((ext) => `${surface}/**/*.${ext}`));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const spec of specifiersOf(source)) {
      const reason = violationFor(spec, surface);
      if (reason) {
        console.error(`BOUNDARY: ${file}: '${spec}' — ${reason}`);
        violations += 1;
      }
    }
  }
}

if (violations > 0) {
  console.error(`\ncheck-surface-boundaries: ${violations} violation(s)`);
  process.exit(1);
}
console.log(`check-surface-boundaries: clean (${ALLOWLIST.join(", ")})`);
