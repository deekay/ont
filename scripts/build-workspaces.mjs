#!/usr/bin/env node
// Dependency-ordered workspace build.
//
// `npm run build --workspaces` iterates the `workspaces` array order (apps/* before packages/*),
// so a CLEAN build compiles consumers before their @ont/* deps are built -> tsc emits
// `TS2307: Cannot find module '@ont/wire'` because `@ont/wire/dist/*.d.ts` does not exist yet.
// Local/CI masked this whenever a stale `dist/` was already on disk; a fresh tree (Docker image
// build, clean clone) has none. This helper topologically sorts the workspaces by their @ont/*
// dependency graph and builds each in order, so a fresh tree builds correctly everywhere.
//
// Idempotent (tsc is incremental). Skips workspaces with no `build` script. Fails closed on a
// dependency cycle or any workspace build error.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// Resolve workspace dirs from the root `workspaces` globs (supports the `<prefix>/*` form).
const root = readJson("package.json");
const dirs = [];
for (const glob of root.workspaces ?? []) {
  if (glob.endsWith("/*")) {
    const base = glob.slice(0, -2);
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(base, entry.name, "package.json"))) {
        dirs.push(join(base, entry.name));
      }
    }
  } else if (existsSync(join(glob, "package.json"))) {
    dirs.push(glob);
  }
}

// name -> { name, deps: Set<@ont workspace deps>, hasBuild }
const pkgs = new Map();
for (const dir of dirs) {
  const pj = readJson(join(dir, "package.json"));
  const deps = new Set(Object.keys(pj.dependencies ?? {}).filter((d) => d.startsWith("@ont/")));
  pkgs.set(pj.name, { name: pj.name, deps, hasBuild: Boolean(pj.scripts?.build) });
}

// Topological order over @ont/* deps that are themselves workspaces (DFS, cycle-detecting).
const ordered = [];
const state = new Map(); // name -> "visiting" | "done"
const visit = (name, stack) => {
  if (state.get(name) === "done") return;
  if (state.get(name) === "visiting") {
    throw new Error(`Dependency cycle: ${[...stack, name].join(" -> ")}`);
  }
  const pkg = pkgs.get(name);
  if (!pkg) return;
  state.set(name, "visiting");
  for (const dep of pkg.deps) if (pkgs.has(dep)) visit(dep, [...stack, name]);
  state.set(name, "done");
  ordered.push(pkg);
};
for (const name of pkgs.keys()) visit(name, []);

// Build each in dependency order.
let built = 0;
for (const pkg of ordered) {
  if (!pkg.hasBuild) continue;
  process.stdout.write(`\n[build] ${pkg.name}\n`);
  execFileSync("npm", ["run", "build", "-w", pkg.name], { stdio: "inherit" });
  built += 1;
}
process.stdout.write(`\n[build] done — ${built} workspaces built in dependency order\n`);
