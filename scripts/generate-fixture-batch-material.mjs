#!/usr/bin/env node
// A' ENFORCE-FIXTURE - generate fixture-file batch material plus the matching RootAnchor input.
//
// This is an operator helper for the first signet checkpoint. It writes the exact JSON shape consumed by
// apps/indexer/src/live/select-enforcement.ts and a publisher RootAnchor input whose prevRoot/newRoot/batchSize
// match that material. It introduces no app/indexer runtime surface; the indexer still re-verifies everything.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  accumulatorRootOf,
  deriveOwnerPubkey,
  normalizeName,
  sha256Hex,
  utf8ToBytes,
} from "@ont/protocol";

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const HEX_64_LOWER = /^[0-9a-f]{64}$/;

function usage(exitCode = 1) {
  const out = exitCode === 0 ? console.log : console.error;
  out(`usage:
  node scripts/generate-fixture-batch-material.mjs \\
    --entry <name>:<ownerPubkey> [--entry <name>:<ownerPubkey> ...] \\
    --material-out <path> --anchor-out <path> [--force]

  node scripts/generate-fixture-batch-material.mjs \\
    --entry-secret <name>:<ownerPrivateKeyHex> \\
    --material-out <path> --anchor-out <path>

  node scripts/generate-fixture-batch-material.mjs \\
    --input <entries.json> --material-out <path> --anchor-out <path>

entries.json may be either an array or { "entries": [...] } with entries shaped as
{ "name": "...", "ownerPubkey": "..." } or { "name": "...", "devSecret": "..." }.`);
  process.exit(exitCode);
}

function fail(message) {
  console.error(`generate-fixture-batch-material: ${message}`);
  process.exit(1);
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) fail(`${flag} requires a value`);
  return value;
}

function parsePair(raw, flag) {
  const sep = raw.indexOf(":");
  if (sep <= 0 || sep === raw.length - 1) fail(`${flag} must be shaped <name>:<hex>`);
  return { name: raw.slice(0, sep), value: raw.slice(sep + 1) };
}

async function readInputEntries(path) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    fail(`could not read --input ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const entries = Array.isArray(parsed) ? parsed : parsed?.entries;
  if (!Array.isArray(entries)) fail("--input must be a JSON array or an object with an entries array");
  return entries;
}

async function parseArgs(argv) {
  const rawEntries = [];
  let inputPath;
  let materialOut;
  let anchorOut;
  let force = false;
  let singleName;
  let singleOwnerPubkey;
  let singleDevSecret;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        usage(0);
        break;
      case "--entry": {
        const { name, value } = parsePair(requireValue(argv, i, arg), arg);
        rawEntries.push({ name, ownerPubkey: value });
        i += 1;
        break;
      }
      case "--entry-secret": {
        const { name, value } = parsePair(requireValue(argv, i, arg), arg);
        rawEntries.push({ name, devSecret: value });
        i += 1;
        break;
      }
      case "--input":
        inputPath = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--name":
        singleName = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--owner-pubkey":
        singleOwnerPubkey = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--dev-secret":
      case "--owner-secret":
        singleDevSecret = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--material-out":
        materialOut = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--anchor-out":
        anchorOut = requireValue(argv, i, arg);
        i += 1;
        break;
      case "--force":
        force = true;
        break;
      default:
        fail(`unknown argument ${arg}`);
    }
  }

  if (inputPath !== undefined) rawEntries.push(...await readInputEntries(inputPath));
  if (singleName !== undefined || singleOwnerPubkey !== undefined || singleDevSecret !== undefined) {
    if (singleName === undefined) fail("--name is required with --owner-pubkey/--dev-secret");
    if ((singleOwnerPubkey === undefined) === (singleDevSecret === undefined)) {
      fail("provide exactly one of --owner-pubkey or --dev-secret with --name");
    }
    rawEntries.push(
      singleOwnerPubkey !== undefined
        ? { name: singleName, ownerPubkey: singleOwnerPubkey }
        : { name: singleName, devSecret: singleDevSecret },
    );
  }
  if (materialOut === undefined) fail("--material-out is required");
  if (anchorOut === undefined) fail("--anchor-out is required");
  if (rawEntries.length === 0) fail("provide at least one entry via --entry, --entry-secret, --name, or --input");

  return { rawEntries, materialOut, anchorOut, force };
}

function readHex64(value, label) {
  if (typeof value !== "string" || !HEX_64.test(value)) fail(`${label} must be 32-byte hex`);
  return value.toLowerCase();
}

function readOwnerPubkey(entry) {
  if (typeof entry !== "object" || entry === null) fail("entries must be objects");
  const ownerPubkey = entry.ownerPubkey;
  const devSecret = entry.devSecret ?? entry.ownerSecret ?? entry.ownerPrivateKeyHex;
  if ((ownerPubkey === undefined) === (devSecret === undefined)) {
    fail(`entry ${JSON.stringify(entry)} must provide exactly one of ownerPubkey or devSecret`);
  }
  if (ownerPubkey !== undefined) return readHex64(ownerPubkey, "ownerPubkey");
  return deriveOwnerPubkey(readHex64(devSecret, "devSecret"));
}

function buildArtifacts(rawEntries) {
  const committedEntries = [];
  const seenNames = new Set();
  for (const raw of rawEntries) {
    if (typeof raw !== "object" || raw === null || typeof raw.name !== "string") {
      fail("each entry must have a string name");
    }
    const name = normalizeName(raw.name);
    if (seenNames.has(name)) fail(`duplicate entry for name ${name}`);
    seenNames.add(name);
    committedEntries.push({ name, ownerPubkey: readOwnerPubkey(raw) });
  }

  const baseLeaves = new Map();
  const servedLeaves = committedEntries.map((entry) => ({
    keyHex: sha256Hex(utf8ToBytes(entry.name)),
    valueHex: entry.ownerPubkey,
  }));
  const fullLeaves = new Map(baseLeaves);
  for (const leaf of servedLeaves) {
    if (fullLeaves.has(leaf.keyHex)) fail(`duplicate leaf key for ${leaf.keyHex}`);
    fullLeaves.set(leaf.keyHex, leaf.valueHex);
  }

  const prevRoot = accumulatorRootOf(baseLeaves);
  const anchoredRoot = accumulatorRootOf(fullLeaves);
  if (!HEX_64_LOWER.test(prevRoot) || !HEX_64_LOWER.test(anchoredRoot)) {
    fail("internal error: accumulator root was not lowercase 32-byte hex");
  }

  return {
    materialFile: {
      materials: [{
        anchoredRoot,
        prevRoot,
        committedEntries,
        baseLeaves: [],
        servedLeaves,
      }],
    },
    anchorInput: {
      prevRoot,
      newRoot: anchoredRoot,
      batchSize: committedEntries.length,
    },
    materialKey: `${prevRoot}:${anchoredRoot}`,
  };
}

async function writeJson(path, value, force) {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  try {
    await writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, { flag: force ? "w" : "wx" });
  } catch (err) {
    if (err && typeof err === "object" && err.code === "EEXIST") {
      fail(`${abs} already exists; pass --force to overwrite`);
    }
    throw err;
  }
  return abs;
}

const { rawEntries, materialOut, anchorOut, force } = await parseArgs(process.argv.slice(2));
const artifacts = buildArtifacts(rawEntries);
const materialPath = await writeJson(materialOut, artifacts.materialFile, force);
const anchorPath = await writeJson(anchorOut, artifacts.anchorInput, force);

console.log(JSON.stringify({
  materialFile: materialPath,
  anchorInputFile: anchorPath,
  materialKey: artifacts.materialKey,
  prevRoot: artifacts.anchorInput.prevRoot,
  anchoredRoot: artifacts.anchorInput.newRoot,
  batchSize: artifacts.anchorInput.batchSize,
}, null, 2));
