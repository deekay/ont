import { createRequire } from "node:module";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const require = createRequire(import.meta.url);
const { ONT_PACKAGE_ROOTS, REPO_ROOT } = require("../mobile/ont-package-roots.cjs");

const ENTRY = path.join(REPO_ROOT, "mobile/checks/verify-graph-entry.mts");
const ONT_PACKAGE_NAMES = Object.keys(ONT_PACKAGE_ROOTS).sort((left, right) => right.length - left.length);
const EXTENSIONS = ["", ".mjs", ".js", ".cjs", ".mts", ".ts", ".tsx", ".jsx", ".json"];
const visited = new Set();
const queue = [ENTRY];
const blocked = [];

while (queue.length > 0) {
  const file = realPath(queue.shift());
  if (visited.has(file) || !isParseable(file)) {
    continue;
  }
  visited.add(file);

  const source = readFileSync(file, "utf8");
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  for (const specifier of staticSpecifiers(parsed)) {
    if (specifier.startsWith("node:")) {
      blocked.push(`${relative(file)} -> ${specifier}`);
      continue;
    }
    if (specifier === "@ont/bitcoin/node" || specifier.startsWith("@ont/bitcoin/node/")) {
      blocked.push(`${relative(file)} -> ${specifier}`);
      continue;
    }

    const resolved = resolveSpecifier(specifier, file);
    if (resolved !== null && isParseable(resolved)) {
      queue.push(resolved);
    }
  }
}

if (blocked.length > 0) {
  console.error("mobile verify graph includes forbidden Node-only edges:");
  for (const edge of blocked) {
    console.error(`- ${edge}`);
  }
  process.exit(1);
}

console.log(`mobile verify graph ok: ${visited.size} reachable files, no node:* or @ont/bitcoin/node edges`);

function staticSpecifiers(sourceFile) {
  const specifiers = [];
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

function resolveSpecifier(specifier, importer) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return resolveFile(specifier.startsWith(".") ? path.resolve(path.dirname(importer), specifier) : specifier);
  }

  const ontResolved = resolveOntPackage(specifier);
  if (ontResolved !== null) {
    return ontResolved;
  }

  try {
    const parentRequire = createRequire(pathToFileURL(importer));
    return realPath(parentRequire.resolve(specifier));
  } catch {
    return null;
  }
}

function resolveOntPackage(specifier) {
  for (const packageName of ONT_PACKAGE_NAMES) {
    if (specifier !== packageName && !specifier.startsWith(`${packageName}/`)) {
      continue;
    }

    const packageRoot = ONT_PACKAGE_ROOTS[packageName];
    const subpath = specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`;
    const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const target = resolvePackageExport(packageJson.exports, subpath);
    if (target === null) {
      throw new Error(`${specifier} is not exported by ${packageName}`);
    }
    return resolveFile(path.join(packageRoot, target));
  }
  return null;
}

function resolvePackageExport(exportsField, subpath) {
  const entry =
    subpath === "." && typeof exportsField === "string"
      ? exportsField
      : exportsField?.[subpath];
  return resolveConditionalExport(entry);
}

function resolveConditionalExport(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry === null || typeof entry !== "object") {
    return null;
  }
  for (const condition of ["react-native", "browser", "import", "default"]) {
    const resolved = resolveConditionalExport(entry[condition]);
    if (resolved !== null) {
      return resolved;
    }
  }
  return null;
}

function resolveFile(candidate) {
  for (const extension of EXTENSIONS) {
    const file = candidate.endsWith(extension) ? candidate : `${candidate}${extension}`;
    if (existsSync(file)) {
      return realPath(file);
    }
  }
  for (const extension of EXTENSIONS.slice(1)) {
    const file = path.join(candidate, `index${extension}`);
    if (existsSync(file)) {
      return realPath(file);
    }
  }
  throw new Error(`could not resolve ${candidate}`);
}

function isParseable(file) {
  return /\.(?:mjs|js|cjs|mts|ts|tsx|jsx)$/.test(file);
}

function realPath(file) {
  return realpathSync(file);
}

function relative(file) {
  return path.relative(REPO_ROOT, file);
}
