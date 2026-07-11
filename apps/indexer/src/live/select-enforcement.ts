// @ont/indexer live — LE-INDEX env-selected enforcement deps.
//
// ONT_ENFORCEMENT unset/off keeps the daemon on the RootAnchor read path. ONT_ENFORCEMENT=fixture-file wires
// live enforcement with a file-backed batch-material fixture. ONT_ENFORCEMENT=http-da prefetches declared
// roots at boot into a sync cache. Declared-but-unresolved http-da roots throw from the sync material seam
// so the indexer tick holds its cursor instead of silently skipping past a pending batch. Both modes select a
// memory/file name-state store that mirrors ONT_STORE and launch policy params from env/defaults. Unknown modes
// and missing required env fail closed at boot.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCommittedBatchForRoot, createAvailabilitySource } from "@ont/adapter-indexer";
import {
  createHttpDaRecordSource,
  decodeEncodedMaterialFile,
  isHex64Lower,
  type EncodedBatchMaterial,
  type HttpDaFetch,
  type HttpDaRecordSource,
} from "@ont/adapter-da";
import { createFileNameStateStore, type NameStateRecord, type NameStateStore } from "@ont/name-state-store";
import type { BatchedClaimPolicy } from "@ont/claim-path";
import type { BatchMaterial, EnforceBatchedClaimsDeps } from "../enforce-batched-claims.js";

const DEFAULT_POLICY: BatchedClaimPolicy = {
  window: { K: 6, W: 2, C: 3 },
  gateFeeSchedule: { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n },
};

export interface SelectIndexerEnforcementOptions {
  readonly daFetch?: HttpDaFetch | undefined;
  readonly daTimeoutMs?: number | undefined;
}

export async function selectIndexerEnforcement(
  env: Record<string, string | undefined>,
  options: SelectIndexerEnforcementOptions = {},
): Promise<EnforceBatchedClaimsDeps | undefined> {
  const mode = env.ONT_ENFORCEMENT ?? "off";
  if (mode === "off") return undefined;
  if (mode === "fixture-file") {
    return selectFixtureFileEnforcement(env);
  }
  if (mode === "http-da") {
    return selectHttpDaEnforcement(env, options);
  }
  throw new Error(`ONT_ENFORCEMENT must be off|fixture-file|http-da (got ${JSON.stringify(mode)})`);
}

function selectFixtureFileEnforcement(env: Record<string, string | undefined>): EnforceBatchedClaimsDeps {
  const materialFile = env.ONT_BATCH_MATERIAL_FILE;
  if (!materialFile) throw new Error("ONT_ENFORCEMENT=fixture-file requires ONT_BATCH_MATERIAL_FILE");

  const materials = loadBatchMaterialFile(materialFile);
  return {
    batchMaterial: (anchoredRoot, prevRoot) => {
      const material = materials.get(materialKey(anchoredRoot, prevRoot));
      if (material === undefined) {
        throw new Error(`batch material missing for anchoredRoot ${anchoredRoot} prevRoot ${prevRoot}`);
      }
      return material;
    },
    nameStateStore: selectNameStateStore(env),
    policy: selectBatchedClaimPolicy(env),
  };
}

async function selectHttpDaEnforcement(
  env: Record<string, string | undefined>,
  options: SelectIndexerEnforcementOptions,
): Promise<EnforceBatchedClaimsDeps> {
  const endpoint = env.ONT_DA_ENDPOINT;
  if (!endpoint) throw new Error("ONT_ENFORCEMENT=http-da requires ONT_DA_ENDPOINT");
  const roots = readDeclaredDaRoots(env.ONT_DA_ROOTS);
  const declaredRoots = new Set(roots);
  const source = createHttpDaRecordSource({ endpoint, fetch: options.daFetch, timeoutMs: options.daTimeoutMs });
  const materials = await loadHttpDaMaterials(source, roots);
  return {
    batchMaterial: (anchoredRoot, prevRoot) => {
      const material = materials.get(materialKey(anchoredRoot, prevRoot));
      if (material !== undefined) return material;
      if (declaredRoots.has(anchoredRoot)) {
        throw new Error(`declared DA root unresolved: ${anchoredRoot}`);
      }
      return null;
    },
    nameStateStore: selectNameStateStore(env),
    policy: selectBatchedClaimPolicy(env),
  };
}

function selectNameStateStore(env: Record<string, string | undefined>): NameStateStore {
  const store = env.ONT_STORE ?? "memory";
  if (store === "memory") return createInMemoryNameStateStore();
  if (store === "file") {
    const dir = env.ONT_STORE_DIR;
    if (!dir) throw new Error("ONT_STORE=file requires ONT_STORE_DIR");
    return createFileNameStateStore(join(dir, "name-state.json"));
  }
  throw new Error(`ONT_STORE must be memory|file (got ${JSON.stringify(store)})`);
}

function createInMemoryNameStateStore(): NameStateStore {
  const byName = new Map<string, NameStateRecord>();
  return {
    has: (canonicalName) => Promise.resolve(byName.has(canonicalName)),
    getByName: (canonicalName) => Promise.resolve(byName.get(canonicalName) ?? null),
    put: (record) => {
      byName.set(record.canonicalName, record);
      return Promise.resolve();
    },
    putMany: (records) => {
      for (const record of records) byName.set(record.canonicalName, record);
      return Promise.resolve();
    },
  };
}

function selectBatchedClaimPolicy(env: Record<string, string | undefined>): BatchedClaimPolicy {
  return {
    window: {
      K: readInt(env, "ONT_DA_K", DEFAULT_POLICY.window.K),
      W: readInt(env, "ONT_DA_W", DEFAULT_POLICY.window.W),
      C: readInt(env, "ONT_DA_C", DEFAULT_POLICY.window.C),
    },
    gateFeeSchedule: {
      gateOneByteSats: readBigInt(env, "ONT_GATE_ONE_BYTE_SATS", DEFAULT_POLICY.gateFeeSchedule.gateOneByteSats),
      gateLongNameFloorSats: readBigInt(env, "ONT_GATE_LONG_NAME_FLOOR_SATS", DEFAULT_POLICY.gateFeeSchedule.gateLongNameFloorSats),
    },
  };
}

function readInt(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${key} must be a non-negative integer`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${key} must be a safe integer`);
  return parsed;
}

function readBigInt(env: Record<string, string | undefined>, key: string, fallback: bigint): bigint {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${key} must be a non-negative integer`);
  return BigInt(raw);
}

function loadBatchMaterialFile(path: string): Map<string, BatchMaterial> {
  const raw = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("batch material file is not valid JSON");
  }
  const materialFile = decodeEncodedMaterialFile(parsed);

  const out = new Map<string, BatchMaterial>();
  for (const encoded of materialFile.materials) {
    const key = materialKey(encoded.anchoredRoot, encoded.prevRoot);
    if (out.has(key)) throw new Error(`duplicate batch material for ${encoded.anchoredRoot}/${encoded.prevRoot}`);
    out.set(key, materialFromEncoded(encoded));
  }
  return out;
}

async function loadHttpDaMaterials(
  source: HttpDaRecordSource,
  roots: readonly string[],
): Promise<Map<string, BatchMaterial>> {
  const out = new Map<string, BatchMaterial>();
  for (const root of roots) {
    const encoded = await source.fetchRecord(root);
    if (encoded === null) continue;
    const material = materialFromEncoded(encoded);
    if (!materialBindsToRoot(root, encoded, material)) continue;
    out.set(materialKey(root, encoded.prevRoot), material);
  }
  return out;
}

function materialFromEncoded(encoded: EncodedBatchMaterial): BatchMaterial {
  return {
    committedEntries: encoded.committedEntries,
    baseLeaves: new Map(encoded.baseLeaves.map((leaf) => [leaf.keyHex, leaf.valueHex])),
    servedLeaves: encoded.servedLeaves,
  };
}

function materialBindsToRoot(root: string, encoded: EncodedBatchMaterial, material: BatchMaterial): boolean {
  if (encoded.anchoredRoot !== root) return false;
  const availability = createAvailabilitySource([{
    prevRoot: encoded.prevRoot,
    anchoredRoot: root,
    baseLeaves: material.baseLeaves,
    presentedServed: material.servedLeaves,
  }]);
  const committedBatch = buildCommittedBatchForRoot({
    anchoredRoot: root,
    batchSize: encoded.committedEntries.length,
    baseLeaves: material.baseLeaves,
    prevRoot: encoded.prevRoot,
    batchEntries: material.committedEntries,
  });
  return committedBatch !== null &&
    availability.baseLeavesForPrevRoot(encoded.prevRoot) !== null &&
    availability.servedLeavesForRoot(root) !== null;
}

function readDeclaredDaRoots(raw: string | undefined): readonly string[] {
  if (!raw) throw new Error("ONT_ENFORCEMENT=http-da requires ONT_DA_ROOTS");
  const roots = raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (roots.length === 0) throw new Error("ONT_ENFORCEMENT=http-da requires ONT_DA_ROOTS");
  const seen = new Set<string>();
  for (const root of roots) {
    if (!isHex64Lower(root)) throw new Error(`ONT_DA_ROOTS contains malformed root ${JSON.stringify(root)}`);
    seen.add(root);
  }
  return [...seen];
}

function materialKey(anchoredRoot: string, prevRoot: string): string {
  return `${prevRoot}:${anchoredRoot}`;
}
