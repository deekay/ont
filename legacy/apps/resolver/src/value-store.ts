import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  loadDatabaseDocument,
  saveDatabaseDocument,
  type DatabaseConfig
} from "@ont/db";
import {
  computeValueRecordHash,
  normalizeName,
  parseSignedValueRecord,
  type SignedValueRecord,
  verifyValueRecord
} from "@ont/protocol";

export interface ValueRecordChain {
  readonly name: string;
  readonly ownershipRef: string;
  readonly records: readonly SignedValueRecord[];
}

export interface ValueRecordStoreSnapshot {
  readonly chains: readonly ValueRecordChain[];
}

export type ValueRecordStore = Map<string, ValueRecordChain>;

export function parseValueRecordStoreSnapshot(input: unknown): ValueRecordStore {
  if (!isRecord(input) || !Array.isArray(input.chains)) {
    throw new Error("value record store must contain a chains array");
  }

  const store: ValueRecordStore = new Map();

  for (const chain of input.chains) {
    if (!isRecord(chain) || !Array.isArray(chain.records)) {
      throw new Error("value record store chain must contain a records array");
    }

    const records = chain.records.map((record) => {
      const parsed = parseAndVerifyStoredRecord(record);
      return parsed;
    });

    if (records.length === 0) {
      continue;
    }

    const name = normalizeName(records[0]?.name ?? "");
    const ownershipRef = records[0]?.ownershipRef ?? "";

    for (const [index, record] of records.entries()) {
      if (record.name !== name || record.ownershipRef !== ownershipRef) {
        throw new Error(`stored value record chain for ${name} mixes names or ownership refs`);
      }

      const expectedSequence = index + 1;
      if (record.sequence !== expectedSequence) {
        throw new Error(`stored value record chain for ${name} has non-contiguous sequence`);
      }

      const expectedPreviousHash =
        index === 0 ? null : computeValueRecordHash(records[index - 1] as SignedValueRecord);
      if (record.previousRecordHash !== expectedPreviousHash) {
        throw new Error(`stored value record chain for ${name} has invalid predecessor hash`);
      }
    }

    store.set(valueRecordChainKey(name, ownershipRef), {
      name,
      ownershipRef,
      records
    });
  }

  return store;
}

export async function loadValueRecordStoreFile(
  path: string
): Promise<ValueRecordStore> {
  try {
    const raw = await readFile(resolve(process.cwd(), path), "utf8");
    const parsed = JSON.parse(raw) as ValueRecordStoreSnapshot;
    return parseValueRecordStoreSnapshot(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("ENOENT") ||
      message.includes("no such file")
    ) {
      return new Map();
    }

    throw error;
  }
}

export async function loadValueRecordStoreDatabase(
  config: DatabaseConfig,
  documentKey: string
): Promise<ValueRecordStore> {
  const payload = await loadDatabaseDocument(config, "value_record_store", documentKey);
  return payload === null ? new Map() : parseValueRecordStoreSnapshot(payload);
}

export async function saveValueRecordStoreFile(
  path: string,
  store: ReadonlyMap<string, ValueRecordChain>
): Promise<void> {
  const resolvedPath = resolve(process.cwd(), path);
  await mkdir(dirname(resolvedPath), { recursive: true });

  const snapshot: ValueRecordStoreSnapshot = {
    chains: listValueRecordChains(store)
  };

  await writeFile(resolvedPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

export async function saveValueRecordStoreDatabase(
  config: DatabaseConfig,
  documentKey: string,
  store: ReadonlyMap<string, ValueRecordChain>
): Promise<void> {
  const snapshot: ValueRecordStoreSnapshot = {
    chains: listValueRecordChains(store)
  };

  await saveDatabaseDocument(config, "value_record_store", documentKey, snapshot);
}

export function getValueRecordChain(
  store: ReadonlyMap<string, ValueRecordChain>,
  name: string,
  ownershipRef: string
): ValueRecordChain | null {
  return store.get(valueRecordChainKey(normalizeName(name), ownershipRef)) ?? null;
}

export function appendValueRecord(
  store: Map<string, ValueRecordChain>,
  record: SignedValueRecord
): void {
  const key = valueRecordChainKey(record.name, record.ownershipRef);
  const existing = store.get(key);

  store.set(key, {
    name: record.name,
    ownershipRef: record.ownershipRef,
    records: [...(existing?.records ?? []), record]
  });
}

export function countValueRecords(store: ReadonlyMap<string, ValueRecordChain>): number {
  return [...store.values()].reduce((sum, chain) => sum + chain.records.length, 0);
}

export function listValueRecordChains(
  store: ReadonlyMap<string, ValueRecordChain>
): ValueRecordChain[] {
  return [...store.values()]
    .map((chain) => ({
      name: chain.name,
      ownershipRef: chain.ownershipRef,
      records: [...chain.records].sort((left, right) => left.sequence - right.sequence)
    }))
    .sort((left, right) => {
      const nameOrder = left.name.localeCompare(right.name);
      return nameOrder === 0 ? left.ownershipRef.localeCompare(right.ownershipRef) : nameOrder;
    });
}

export function valueRecordChainKey(name: string, ownershipRef: string): string {
  return `${normalizeName(name)}:${ownershipRef.trim().toLowerCase()}`;
}

function parseAndVerifyStoredRecord(input: unknown): SignedValueRecord {
  const parsedRecord = parseSignedValueRecord(input);

  if (!verifyValueRecord(parsedRecord)) {
    throw new Error(`stored value record for ${parsedRecord.name} failed signature verification`);
  }

  return parsedRecord;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
