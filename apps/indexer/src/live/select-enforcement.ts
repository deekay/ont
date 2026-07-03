// @ont/indexer live — LE-INDEX env-selected enforcement deps.
//
// ONT_ENFORCEMENT unset/off keeps the daemon on the RootAnchor read path. ONT_ENFORCEMENT=fixture-file wires
// live enforcement with a file-backed batch-material fixture, a memory/file name-state store that mirrors
// ONT_STORE, and launch policy params from env/defaults. Unknown modes and missing fixture material fail closed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeEncodedMaterialFile } from "@ont/adapter-da";
import { createFileNameStateStore, type NameStateRecord, type NameStateStore } from "@ont/name-state-store";
import type { BatchedClaimPolicy } from "@ont/claim-path";
import type { BatchMaterial, EnforceBatchedClaimsDeps } from "../enforce-batched-claims.js";

const DEFAULT_POLICY: BatchedClaimPolicy = {
  window: { K: 6, W: 2, C: 3 },
  gateFeeSchedule: { gateOneByteSats: 1_000_000n, gateLongNameFloorSats: 100_000n },
};

export function selectIndexerEnforcement(
  env: Record<string, string | undefined>,
): EnforceBatchedClaimsDeps | undefined {
  const mode = env.ONT_ENFORCEMENT ?? "off";
  if (mode === "off") return undefined;
  if (mode !== "fixture-file") {
    throw new Error(`ONT_ENFORCEMENT must be off|fixture-file (got ${JSON.stringify(mode)})`);
  }

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
    out.set(key, {
      committedEntries: encoded.committedEntries,
      baseLeaves: new Map(encoded.baseLeaves.map((leaf) => [leaf.keyHex, leaf.valueHex])),
      servedLeaves: encoded.servedLeaves,
    });
  }
  return out;
}

function materialKey(anchoredRoot: string, prevRoot: string): string {
  return `${prevRoot}:${anchoredRoot}`;
}
