#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const SCRIPT_REL = "scripts/gen-audit-map.mjs";
const SOURCE_REL = "packages/consensus/src/trust-surface.test.ts";
const OUTPUT_REL = "docs/core/AUDIT_SURFACE_MAP.md";
const REGENERATE = `node ${SCRIPT_REL} --write`;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const sourcePath = resolve(repoRoot, SOURCE_REL);
const outputPath = resolve(repoRoot, OUTPUT_REL);

const TIER_DESCRIPTIONS = {
  CORE_DECIDERS:
    "State/replay deciders that mutate name state through owner-key authority and deterministic Bitcoin replay.",
  CONSENSUS_SUPPORT:
    "Consensus-bearing input normalization: the scanner decides which bytes reach the deciders.",
  CONSENSUS_PARAMS:
    "Pure consensus-parameter surface: validated DA-window inputs consumed by audited rules.",
  CONSENSUS_VERDICTS:
    "Pure verdict deciders consumed by state deciders; they decide consensus predicates without mutating state.",
};

const DECLARATIONS = [
  "CORE_DECIDERS",
  "CONSENSUS_SUPPORT",
  "CONSENSUS_PARAMS",
  "CONSENSUS_VERDICTS",
  "CORE_DECIDERS_ALLOWED_BY_FILE",
  "SUPPORT_ALLOWED_PACKAGES",
  "PARAMS_ALLOWED_PACKAGES",
  "VERDICTS_ALLOWED_BY_FILE",
];

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  process.stdout.write(`Usage: ${SCRIPT_REL} [--write|--check]\n`);
  process.exit(0);
}
const mode = args.has("--check") ? "check" : "write";
for (const arg of args) {
  if (arg !== "--check" && arg !== "--write") {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

const rendered = renderAuditSurfaceMap(readManifest());

if (mode === "check") {
  const actual = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;
  if (actual !== rendered) {
    printDrift(actual, rendered);
    process.exit(1);
  }
  process.stdout.write(`audit-map OK: ${OUTPUT_REL} matches ${SOURCE_REL}\n`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, rendered);
  process.stdout.write(`wrote ${OUTPUT_REL}\n`);
}

function readManifest() {
  const sourceText = readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    SOURCE_REL,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = collectDeclarations(sourceFile);
  for (const name of DECLARATIONS) {
    if (!declarations.has(name)) {
      throw new Error(`manifest declaration ${name} not found in ${SOURCE_REL}`);
    }
  }

  const coreFiles = parseStringArray(declarations.get("CORE_DECIDERS"), "CORE_DECIDERS");
  const supportFiles = parseStringArray(declarations.get("CONSENSUS_SUPPORT"), "CONSENSUS_SUPPORT");
  const paramFiles = parseStringArray(declarations.get("CONSENSUS_PARAMS"), "CONSENSUS_PARAMS");
  const verdictFiles = parseStringArray(declarations.get("CONSENSUS_VERDICTS"), "CONSENSUS_VERDICTS");
  const coreAllowlist = parseAllowlistMap(
    declarations.get("CORE_DECIDERS_ALLOWED_BY_FILE"),
    "CORE_DECIDERS_ALLOWED_BY_FILE",
  );
  const verdictAllowlist = parseAllowlistMap(
    declarations.get("VERDICTS_ALLOWED_BY_FILE"),
    "VERDICTS_ALLOWED_BY_FILE",
  );
  const supportAllowlist = parseSet(
    declarations.get("SUPPORT_ALLOWED_PACKAGES"),
    "SUPPORT_ALLOWED_PACKAGES",
  );
  const paramAllowlist = parseSet(
    declarations.get("PARAMS_ALLOWED_PACKAGES"),
    "PARAMS_ALLOWED_PACKAGES",
  );

  assertMapMatchesTier("CORE_DECIDERS_ALLOWED_BY_FILE", coreAllowlist, coreFiles);
  assertMapMatchesTier("VERDICTS_ALLOWED_BY_FILE", verdictAllowlist, verdictFiles);

  const tiers = [
    {
      name: "CORE_DECIDERS",
      files: coreFiles,
      allowlistFor: (file) => coreAllowlist.get(file),
    },
    {
      name: "CONSENSUS_SUPPORT",
      files: supportFiles,
      allowlistFor: () => supportAllowlist,
    },
    {
      name: "CONSENSUS_PARAMS",
      files: paramFiles,
      allowlistFor: () => paramAllowlist,
    },
    {
      name: "CONSENSUS_VERDICTS",
      files: verdictFiles,
      allowlistFor: (file) => verdictAllowlist.get(file),
    },
  ];

  const allFiles = tiers.flatMap((tier) => tier.files);
  const duplicate = firstDuplicate(allFiles);
  if (duplicate) {
    throw new Error(`manifest file ${duplicate} appears in more than one tier in ${SOURCE_REL}`);
  }

  return { tiers, totalFiles: allFiles.length };
}

function collectDeclarations(sourceFile) {
  const declarations = new Map();
  sourceFile.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declarations.set(declaration.name.text, declaration);
      }
    }
  });
  return declarations;
}

function parseStringArray(declaration, name) {
  const expression = unwrapExpression(requireInitializer(declaration, name));
  if (!ts.isArrayLiteralExpression(expression)) {
    throw new Error(`manifest declaration ${name} must be a string array literal`);
  }
  return expression.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(`manifest declaration ${name} must contain only string literals`);
    }
    return element.text;
  });
}

function parseAllowlistMap(declaration, name) {
  const expression = unwrapExpression(requireInitializer(declaration, name));
  if (!ts.isObjectLiteralExpression(expression)) {
    throw new Error(`manifest declaration ${name} must be an object literal`);
  }

  const map = new Map();
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      throw new Error(`manifest declaration ${name} must contain only property assignments`);
    }
    const key = propertyNameText(property.name, name);
    if (map.has(key)) {
      throw new Error(`manifest declaration ${name} contains duplicate key ${key}`);
    }
    map.set(key, parseSetExpression(property.initializer, `${name}.${key}`));
  }
  return map;
}

function parseSet(declaration, name) {
  return parseSetExpression(requireInitializer(declaration, name), name);
}

function parseSetExpression(rawExpression, name) {
  const expression = unwrapExpression(rawExpression);
  if (
    !ts.isNewExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    expression.expression.text !== "Set"
  ) {
    throw new Error(`manifest declaration ${name} must be a new Set([...]) expression`);
  }
  const args = expression.arguments ? [...expression.arguments] : [];
  if (args.length !== 1) {
    throw new Error(`manifest declaration ${name} must pass exactly one array literal to Set`);
  }
  const setItems = unwrapExpression(args[0]);
  if (!ts.isArrayLiteralExpression(setItems)) {
    throw new Error(`manifest declaration ${name} must pass an array literal to Set`);
  }
  return setItems.elements.map((element) => {
    if (!ts.isStringLiteral(element)) {
      throw new Error(`manifest declaration ${name} must contain only string literals`);
    }
    return element.text;
  });
}

function requireInitializer(declaration, name) {
  if (!declaration.initializer) {
    throw new Error(`manifest declaration ${name} has no initializer in ${SOURCE_REL}`);
  }
  return declaration.initializer;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(name, declarationName) {
  if (ts.isStringLiteral(name) || ts.isIdentifier(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new Error(`manifest declaration ${declarationName} has an unsupported property key`);
}

function assertMapMatchesTier(name, allowlistMap, files) {
  const fileSet = new Set(files);
  for (const file of files) {
    if (!allowlistMap.has(file)) {
      throw new Error(`manifest declaration ${name} has no allowlist entry for ${file}`);
    }
  }
  for (const file of allowlistMap.keys()) {
    if (!fileSet.has(file)) {
      throw new Error(`manifest declaration ${name} has extra allowlist entry for ${file}`);
    }
  }
}

function firstDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function renderAuditSurfaceMap(manifest) {
  const lines = [
    "<!--",
    "GENERATED FILE - DO NOT EDIT.",
    `Generator: ${SCRIPT_REL}`,
    `Source: ${SOURCE_REL}`,
    `Regenerate: ${REGENERATE}`,
    "-->",
    "",
    "# @ont/consensus Audit Surface Map",
    "",
    `Audited files: ${manifest.totalFiles} across ${manifest.tiers.length} tiers.`,
    "",
  ];

  for (const tier of manifest.tiers) {
    lines.push(
      `## ${tier.name}`,
      "",
      TIER_DESCRIPTIONS[tier.name],
      "",
      "| file | external-import allowlist |",
      "| --- | --- |",
    );
    for (const file of tier.files) {
      lines.push(`| \`${file}\` | ${formatAllowlist(tier.allowlistFor(file))} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function formatAllowlist(allowlist) {
  if (!allowlist || allowlist.length === 0) return "(none)";
  return allowlist.map((specifier) => `\`${specifier}\``).join(", ");
}

function printDrift(actual, expected) {
  console.error(`audit-map drift: ${OUTPUT_REL} is out of date.`);
  console.error(`Run: ${REGENERATE}`);
  if (actual === null) {
    console.error(`Missing file: ${OUTPUT_REL}`);
    return;
  }

  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const max = Math.max(actualLines.length, expectedLines.length);
  for (let i = 0; i < max; i += 1) {
    if (actualLines[i] !== expectedLines[i]) {
      console.error(`First difference at line ${i + 1}:`);
      console.error(`  expected: ${expectedLines[i] ?? "<EOF>"}`);
      console.error(`  actual:   ${actualLines[i] ?? "<EOF>"}`);
      break;
    }
  }
  console.error(
    `Expected ${Buffer.byteLength(expected)} bytes; found ${Buffer.byteLength(actual)} bytes.`,
  );
}
