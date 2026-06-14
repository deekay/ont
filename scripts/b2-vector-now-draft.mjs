#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLASSIFIED_PATH = join(ROOT, "docs/core/B2_STEP4_CLASSIFIED.json");
const OUT_PATH = join(ROOT, "docs/core/B2_VECTOR_NOW_DRAFT.json");
const AUTHORED_DIR = join(ROOT, "docs/core/vectors");

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
const statuses = new Set(["proposed", "locked", "flipped", "retired"]);
const kinds = new Set(["negative", "positive"]);
const areaNames = new Set(Object.values(areaByPrefix));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function classifiedRows() {
  return readJson(CLASSIFIED_PATH);
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

function validateSchemaVector(vector) {
  const problems = [];
  const prefix = vector?.id ?? "<missing id>";

  if (typeof vector !== "object" || vector === null || Array.isArray(vector)) return ["vector must be an object"];

  const required = ["id", "ruleId", "area", "authorityTier", "sources", "kind", "inputs", "expected", "status", "attackFlagRef"];
  for (const key of required) {
    if (!(key in vector)) problems.push(`${prefix}: missing ${key}`);
  }

  for (const key of Object.keys(vector)) {
    if (!allowedRootKeys.has(key)) problems.push(`${prefix}: unknown root key ${key}`);
  }

  if (!/^[A-Z]+[0-9]+[a-z]?-(neg|pos)-[0-9]{2}$/.test(vector.id ?? "")) problems.push(`${prefix}: bad id`);
  if (!/^(A|D|F|T|B|V|Z|S|R|X|Q|G)[0-9]+[a-z]?$/.test(vector.ruleId ?? "")) problems.push(`${prefix}: bad ruleId ${vector.ruleId}`);
  if (!areaNames.has(vector.area)) problems.push(`${prefix}: bad area ${vector.area}`);
  if (!authorityTiers.has(vector.authorityTier)) problems.push(`${prefix}: bad authorityTier ${vector.authorityTier}`);
  if (!Array.isArray(vector.sources) || vector.sources.length === 0 || vector.sources.some((s) => typeof s !== "string" || s.length === 0)) {
    problems.push(`${prefix}: sources must be a non-empty string array`);
  }
  if (!kinds.has(vector.kind)) problems.push(`${prefix}: bad kind ${vector.kind}`);
  if (typeof vector.inputs !== "object" || vector.inputs === null || Array.isArray(vector.inputs)) problems.push(`${prefix}: inputs must be an object`);
  if (!statuses.has(vector.status)) problems.push(`${prefix}: bad status ${vector.status}`);
  if (!(typeof vector.attackFlagRef === "string" || vector.attackFlagRef === null)) problems.push(`${prefix}: attackFlagRef must be string or null`);

  if (typeof vector.expected !== "object" || vector.expected === null || Array.isArray(vector.expected)) {
    problems.push(`${prefix}: expected must be an object`);
  } else {
    if (!["accept", "reject"].includes(vector.expected.verdict)) problems.push(`${prefix}: bad expected.verdict ${vector.expected.verdict}`);
    if (typeof vector.expected.reason !== "string" || vector.expected.reason.length === 0) problems.push(`${prefix}: expected.reason must be non-empty string`);
    if (vector.kind === "negative" && vector.expected.verdict !== "reject") problems.push(`${prefix}: negative vector must expect reject`);
    if (vector.kind === "positive" && vector.expected.verdict !== "accept") problems.push(`${prefix}: positive vector must expect accept`);
  }

  if (vector.authorityTier === "provisional") {
    if (!Array.isArray(vector.decisionDeps) || vector.decisionDeps.length === 0 || vector.decisionDeps.some((d) => typeof d !== "string" || d.length === 0)) {
      problems.push(`${prefix}: provisional vector requires non-empty decisionDeps`);
    }
    if (typeof vector.flipMarker !== "object" || vector.flipMarker === null || Array.isArray(vector.flipMarker)) {
      problems.push(`${prefix}: provisional vector requires object flipMarker`);
    } else {
      const keys = Object.keys(vector.flipMarker);
      for (const key of keys) {
        if (!["decision", "flipsTo"].includes(key)) problems.push(`${prefix}: flipMarker has unknown key ${key}`);
      }
      if (typeof vector.flipMarker.decision !== "string" || vector.flipMarker.decision.length === 0) problems.push(`${prefix}: flipMarker.decision must be non-empty string`);
      if (typeof vector.flipMarker.flipsTo !== "string" || vector.flipMarker.flipsTo.length === 0) problems.push(`${prefix}: flipMarker.flipsTo must be non-empty string`);
    }
  } else {
    if (vector.flipMarker !== null) problems.push(`${prefix}: non-provisional flipMarker must be null`);
    if ("decisionDeps" in vector) problems.push(`${prefix}: non-provisional vector carries decisionDeps`);
  }

  if (vector.kind === "negative" && (typeof vector.attackFlagRef !== "string" || vector.attackFlagRef.length === 0)) {
    problems.push(`${prefix}: negative vector requires non-empty attackFlagRef`);
  }

  const expectedArea = areaByPrefix[(vector.ruleId ?? "")[0]];
  if (expectedArea && vector.area !== expectedArea) problems.push(`${prefix}: area ${vector.area} != ${expectedArea} for ruleId ${vector.ruleId}`);

  return problems;
}

function validate(vectors, rows) {
  const problems = [];
  const byFlag = new Map(rows.map((row) => [row.attackFlagId, row]));
  const vectorNow = new Set(rows.filter((row) => row.category === "vector-now").map((row) => row.attackFlagId));
  const seenRefs = new Set();
  const seenIds = new Set();

  for (const vector of vectors) {
    problems.push(...validateSchemaVector(vector));
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

function authoredFiles() {
  if (!existsSync(AUTHORED_DIR)) return [];
  return readdirSync(AUTHORED_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(AUTHORED_DIR, file))
    .filter((path) => statSync(path).isFile())
    .sort();
}

function checkAuthored({ requireComplete }) {
  const rows = classifiedRows();
  const seed = readJson(OUT_PATH);
  const seedById = new Map(seed.map((vector) => [vector.id, vector]));
  const seedIds = new Set(seedById.keys());
  const seedRefs = new Set(seed.map((vector) => vector.attackFlagRef));
  const byFlag = new Map(rows.map((row) => [row.attackFlagId, row]));
  const problems = [];
  const seenIds = new Set();
  const seenRefs = new Set();
  const files = authoredFiles();

  for (const file of files) {
    const vectors = readJson(file);
    if (!Array.isArray(vectors)) {
      problems.push(`${file}: must contain an array`);
      continue;
    }
    for (const vector of vectors) {
      problems.push(...validateSchemaVector(vector).map((problem) => `${file}: ${problem}`));
      const seedVector = seedById.get(vector.id);
      if (!seedVector) problems.push(`${file}: ${vector.id} is not in ${OUT_PATH}`);
      if (!seedIds.has(vector.id)) problems.push(`${file}: authored id ${vector.id} not in vector-now seed`);
      if (seenIds.has(vector.id)) problems.push(`${file}: duplicate authored id ${vector.id}`);
      seenIds.add(vector.id);

      if (!seedRefs.has(vector.attackFlagRef)) problems.push(`${file}: ${vector.id} attackFlagRef ${vector.attackFlagRef} not in vector-now seed`);
      if (seedVector && vector.attackFlagRef !== seedVector.attackFlagRef) {
        problems.push(`${file}: ${vector.id} attackFlagRef ${vector.attackFlagRef} != seed ${seedVector.attackFlagRef}`);
      }
      if (seenRefs.has(vector.attackFlagRef)) problems.push(`${file}: duplicate authored attackFlagRef ${vector.attackFlagRef}`);
      seenRefs.add(vector.attackFlagRef);

      const row = byFlag.get(vector.attackFlagRef);
      if (!row) {
        problems.push(`${file}: ${vector.id} references missing flag ${vector.attackFlagRef}`);
      } else if (row.category !== "vector-now") {
        problems.push(`${file}: ${vector.id} references ${row.category} flag ${vector.attackFlagRef}`);
      }
    }
  }

  if (requireComplete) {
    for (const id of seedIds) {
      if (!seenIds.has(id)) problems.push(`missing authored vector ${id}`);
    }
    for (const ref of seedRefs) {
      if (!seenRefs.has(ref)) problems.push(`missing authored attackFlagRef ${ref}`);
    }
  }

  return { problems, files, authoredCount: seenIds.size, seedCount: seedIds.size };
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
} else if (mode === "--check-authored" || mode === "--check-authored-complete") {
  const result = checkAuthored({ requireComplete: mode === "--check-authored-complete" });
  if (result.problems.length) {
    console.error(result.problems.join("\n"));
    process.exit(1);
  }
  const suffix = mode === "--check-authored-complete" ? "complete" : "partial";
  console.log(`B2 authored vectors OK (${suffix}): ${result.authoredCount}/${result.seedCount} seed ids covered across ${result.files.length} file(s)`);
} else {
  console.error("usage: node scripts/b2-vector-now-draft.mjs [--write|--check|--check-authored|--check-authored-complete]");
  process.exit(1);
}
