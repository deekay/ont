// Runs the offline crypto cross-checks for the mobile app against the engine.
// Each check imports the real app modules + the engine source and asserts
// byte-exact agreement / correct verification. Usage: npm run check:crypto
//
// The *.live.mts checks are NOT run here — they hit a live resolver and need the
// local signet test accounts. Run those individually with the repo's tsx.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");

const checks = ["accumulator", "claim", "value-record", "recovery-descriptor", "demo-claim", "backup"];

let failed = 0;
for (const name of checks) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(tsx, [resolve(here, `${name}.mts`)], { stdio: "inherit", cwd: repoRoot });
  if (r.status !== 0) failed += 1;
}

console.log("");
if (failed === 0) {
  console.log("✓ all offline crypto checks passed — mobile matches the engine.");
} else {
  console.error(`✗ ${failed} check group(s) failed.`);
  process.exit(1);
}
