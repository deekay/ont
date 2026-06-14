#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLASSIFIED_PATH = join(ROOT, "docs/core/B2_STEP4_CLASSIFIED.json");
const OUT_PATH = join(ROOT, "docs/core/B2_VECTOR_NOW_DRAFT.json");

const areaByPrefix = {
  A: "Anchor acceptance",
  D: "DA verdict",
  F: "Gate-fee validation",
  T: "Transcript completeness",
  B: "Batched-path transitions",
  V: "Value-record authority",
  Z: "Reorg re-derivation and replay determinism",
  S: "Settlement consequences (bond release)",
  R: "Recovery authority (arming + cross-object)",
  X: "Transfer authority",
  Q: "Winner selection and bid acceptance",
  G: "Kernel-wide glue (ordering, evidence deadlines, parameter surface)",
};

const allowedRootKeys = new Set([
  "id",
  "ruleId",
  "area",
  "authorityTier",
  "sources",
  "kind",
  "inputs",
  "expected",
  "status",
  "attackFlagRef",
  "flipMarker",
  "decisionDeps",
  "params",
]);

const authorityTiers = new Set(["normative", "candidate", "ratified", "provisional"]);

function classifiedRows() {
  return JSON.parse(readFileSync(CLASSIFIED_PATH, "utf8"));
}

function inferKind(row) {
  const sketch = row.vectorSketch ?? "";
  if (/^\s*(positive|\(\+\)|\+)/i.test(sketch)) return "positive";
  if (/^\s*(negative|\(\u2212\)|\(-\)|-)/i.test(sketch)) return "negative";
  throw new Error(`${row.attackFlagId}: cannot infer vector kind from vectorSketch`);
}

function stripKindPrefix(sketch) {
  return sketch
    .replace(/^\s*negative\s*[\u2014-]\s*/i, "")
    .replace(/^\s*positive\s*[\u2014-]\s*/i, "")
    .replace(/^\s*\(\u2212\)\s*/i, "")
    .replace(/^\s*\(\+\)\s*/i, "")
    .trim();
}

function inferAuthorityTier(row) {
  const sources = (row.sources ?? []).join(" | ");
  const explicit = sources.match(/authorityTier\s+([a-z]+)(?:\u2192|->)vector-now/i);
  if (explicit) return explicit[1];
  if (/\[candidate\]|candidate|candidate-stays/i.test(sources)) return "candidate";
  if (/normative/i.test(sources)) return "normative";
  if (/ratified|DECISIONS\.md|Decision Log/i.test(sources)) return "ratified";
  return "candidate";
}

function reasonCode(row, kind) {
  return `${row.attackFlagId.toLowerCase()}-${kind === "negative" ? "reject" : "accept"}`;
}

function buildVectors(rows) {
  const ordinals = new Map();
  return rows
    .filter((row) => row.category === "vector-now")
    .map((row) => {
      const kind = inferKind(row);
      const countKey = `${row.ruleId}:${kind}`;
      const next = (ordinals.get(countKey) ?? 0) + 1;
      ordinals.set(countKey, next);
      const id = `${row.ruleId}-${kind === "negative" ? "neg" : "pos"}-${String(next).padStart(2, "0")}`;
      return {
        id,
        ruleId: row.ruleId,
        area: areaByPrefix[row.area],
        authorityTier: inferAuthorityTier(row),
        sources: row.sources,
        kind,
        inputs: {
          sourceCategory: row.category,
          attackFlagText: row.attackFlagText,
          scenario: stripKindPrefix(row.vectorSketch ?? ""),
          authoringStatus: "draft: executable fixtures and predicate-specific input shape must be completed before locking",
        },
        expected: {
          verdict: kind === "negative" ? "reject" : "accept",
          reason: reasonCode(row, kind),
          rationale: row.rationale,
        },
        status: "proposed",
        attackFlagRef: row.attackFlagId,
        flipMarker: null,
      };
    });
}

function validate(vectors, rows) {
  const problems = [];
  const byFlag = new Map(rows.map((row) => [row.attackFlagId, row]));
  const vectorNow = new Set(rows.filter((row) => row.category === "vector-now").map((row) => row.attackFlagId));
  const seenRefs = new Set();
  const seenIds = new Set();

  for (const vector of vectors) {
    for (const key of Object.keys(vector)) {
      if (!allowedRootKeys.has(key)) problems.push(`${vector.id ?? "<missing id>"}: unknown root key ${key}`);
    }
    if (!/^[A-Z]+[0-9]+[a-z]?-(neg|pos)-[0-9]{2}$/.test(vector.id ?? "")) problems.push(`${vector.id}: bad id`);
    if (seenIds.has(vector.id)) problems.push(`${vector.id}: duplicate id`);
    seenIds.add(vector.id);

    const row = byFlag.get(vector.attackFlagRef);
    if (!row) {
      problems.push(`${vector.id}: attackFlagRef ${vector.attackFlagRef} is not in the classified worklist`);
      continue;
    }
    if (row.category !== "vector-now") problems.push(`${vector.id}: references ${row.category} row ${row.attackFlagRef}`);
    if (vector.ruleId !== row.ruleId) problems.push(`${vector.id}: ruleId ${vector.ruleId} != ${row.ruleId}`);
    if (vector.area !== areaByPrefix[row.area]) problems.push(`${vector.id}: area ${vector.area} != ${areaByPrefix[row.area]}`);
    if (vector.kind !== inferKind(row)) problems.push(`${vector.id}: kind ${vector.kind} != inferred ${inferKind(row)}`);
    if (vector.expected?.verdict !== (vector.kind === "negative" ? "reject" : "accept")) {
      problems.push(`${vector.id}: expected verdict does not match kind`);
    }
    if (!Array.isArray(vector.sources) || vector.sources.length === 0) problems.push(`${vector.id}: missing sources`);
    if (!authorityTiers.has(vector.authorityTier)) problems.push(`${vector.id}: bad authorityTier ${vector.authorityTier}`);
    if (vector.authorityTier !== "provisional" && vector.flipMarker !== null) problems.push(`${vector.id}: non-provisional flipMarker must be null`);
    if (vector.authorityTier !== "provisional" && "decisionDeps" in vector) problems.push(`${vector.id}: non-provisional vector carries decisionDeps`);
    if (vector.kind === "negative" && (!vector.attackFlagRef || typeof vector.attackFlagRef !== "string")) {
      problems.push(`${vector.id}: negative vector requires attackFlagRef`);
    }
    if (seenRefs.has(vector.attackFlagRef)) problems.push(`${vector.id}: duplicate attackFlagRef ${vector.attackFlagRef}`);
    seenRefs.add(vector.attackFlagRef);
  }

  for (const ref of vectorNow) {
    if (!seenRefs.has(ref)) problems.push(`missing vector-now flag ${ref}`);
  }
  for (const ref of seenRefs) {
    if (!vectorNow.has(ref)) problems.push(`non-vector-now flag included ${ref}`);
  }
  if (vectors.length !== vectorNow.size) problems.push(`vector count ${vectors.length} != vector-now count ${vectorNow.size}`);

  return problems;
}

const mode = process.argv[2] ?? "--check";
const rows = classifiedRows();

if (mode === "--write") {
  const vectors = buildVectors(rows);
  writeFileSync(OUT_PATH, `${JSON.stringify(vectors, null, 2)}\n`);
  console.log(`wrote ${vectors.length} vector-now draft vectors to ${OUT_PATH}`);
} else if (mode === "--check") {
  const vectors = JSON.parse(readFileSync(OUT_PATH, "utf8"));
  const problems = validate(vectors, rows);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`B2 vector-now draft OK: ${vectors.length}/${rows.filter((row) => row.category === "vector-now").length} vector-now flags covered exactly once`);
} else {
  console.error("usage: node scripts/b2-vector-now-draft.mjs [--write|--check]");
  process.exit(1);
}
