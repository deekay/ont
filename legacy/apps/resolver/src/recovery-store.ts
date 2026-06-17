import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  loadDatabaseDocument,
  saveDatabaseDocument,
  type DatabaseConfig
} from "@ont/db";
import {
  computeRecoveryDescriptorHash,
  normalizeName,
  parseSignedRecoveryDescriptor,
  type SignedRecoveryDescriptor,
  verifyRecoveryDescriptor
} from "@ont/protocol";

export interface RecoveryDescriptorChain {
  readonly name: string;
  readonly ownershipRef: string;
  readonly descriptors: readonly SignedRecoveryDescriptor[];
}

export interface RecoveryDescriptorStoreSnapshot {
  readonly chains: readonly RecoveryDescriptorChain[];
}

export type RecoveryDescriptorStore = Map<string, RecoveryDescriptorChain>;

export function parseRecoveryDescriptorStoreSnapshot(input: unknown): RecoveryDescriptorStore {
  if (!isRecord(input) || !Array.isArray(input.chains)) {
    throw new Error("recovery descriptor store must contain a chains array");
  }

  const store: RecoveryDescriptorStore = new Map();

  for (const chain of input.chains) {
    if (!isRecord(chain) || !Array.isArray(chain.descriptors)) {
      throw new Error("recovery descriptor store chain must contain a descriptors array");
    }

    const descriptors = chain.descriptors.map((descriptor) => {
      const parsed = parseAndVerifyStoredDescriptor(descriptor);
      return parsed;
    });

    if (descriptors.length === 0) {
      continue;
    }

    const name = normalizeName(descriptors[0]?.name ?? "");
    const ownershipRef = descriptors[0]?.ownershipRef ?? "";

    for (const [index, descriptor] of descriptors.entries()) {
      if (descriptor.name !== name || descriptor.ownershipRef !== ownershipRef) {
        throw new Error(`stored recovery descriptor chain for ${name} mixes names or ownership refs`);
      }

      const expectedSequence = index + 1;
      if (descriptor.sequence !== expectedSequence) {
        throw new Error(`stored recovery descriptor chain for ${name} has non-contiguous sequence`);
      }

      const expectedPreviousHash =
        index === 0 ? null : computeRecoveryDescriptorHash(descriptors[index - 1] as SignedRecoveryDescriptor);
      if (descriptor.previousDescriptorHash !== expectedPreviousHash) {
        throw new Error(`stored recovery descriptor chain for ${name} has invalid predecessor hash`);
      }
    }

    store.set(recoveryDescriptorChainKey(name, ownershipRef), {
      name,
      ownershipRef,
      descriptors
    });
  }

  return store;
}

export async function loadRecoveryDescriptorStoreFile(
  path: string
): Promise<RecoveryDescriptorStore> {
  try {
    const raw = await readFile(resolve(process.cwd(), path), "utf8");
    const parsed = JSON.parse(raw) as RecoveryDescriptorStoreSnapshot;
    return parseRecoveryDescriptorStoreSnapshot(parsed);
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

export async function loadRecoveryDescriptorStoreDatabase(
  config: DatabaseConfig,
  documentKey: string
): Promise<RecoveryDescriptorStore> {
  const payload = await loadDatabaseDocument(config, "recovery_descriptor_store", documentKey);
  return payload === null ? new Map() : parseRecoveryDescriptorStoreSnapshot(payload);
}

export async function saveRecoveryDescriptorStoreFile(
  path: string,
  store: ReadonlyMap<string, RecoveryDescriptorChain>
): Promise<void> {
  const resolvedPath = resolve(process.cwd(), path);
  await mkdir(dirname(resolvedPath), { recursive: true });

  const snapshot: RecoveryDescriptorStoreSnapshot = {
    chains: listRecoveryDescriptorChains(store)
  };

  await writeFile(resolvedPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

export async function saveRecoveryDescriptorStoreDatabase(
  config: DatabaseConfig,
  documentKey: string,
  store: ReadonlyMap<string, RecoveryDescriptorChain>
): Promise<void> {
  const snapshot: RecoveryDescriptorStoreSnapshot = {
    chains: listRecoveryDescriptorChains(store)
  };

  await saveDatabaseDocument(config, "recovery_descriptor_store", documentKey, snapshot);
}

export function getRecoveryDescriptorChain(
  store: ReadonlyMap<string, RecoveryDescriptorChain>,
  name: string,
  ownershipRef: string
): RecoveryDescriptorChain | null {
  return store.get(recoveryDescriptorChainKey(normalizeName(name), ownershipRef)) ?? null;
}

export function appendRecoveryDescriptor(
  store: Map<string, RecoveryDescriptorChain>,
  descriptor: SignedRecoveryDescriptor
): void {
  const key = recoveryDescriptorChainKey(descriptor.name, descriptor.ownershipRef);
  const existing = store.get(key);

  store.set(key, {
    name: descriptor.name,
    ownershipRef: descriptor.ownershipRef,
    descriptors: [...(existing?.descriptors ?? []), descriptor]
  });
}

export function countRecoveryDescriptors(store: ReadonlyMap<string, RecoveryDescriptorChain>): number {
  return [...store.values()].reduce((sum, chain) => sum + chain.descriptors.length, 0);
}

export function listRecoveryDescriptorChains(
  store: ReadonlyMap<string, RecoveryDescriptorChain>
): RecoveryDescriptorChain[] {
  return [...store.values()]
    .map((chain) => ({
      name: chain.name,
      ownershipRef: chain.ownershipRef,
      descriptors: [...chain.descriptors].sort((left, right) => left.sequence - right.sequence)
    }))
    .sort((left, right) => {
      const nameOrder = left.name.localeCompare(right.name);
      return nameOrder === 0 ? left.ownershipRef.localeCompare(right.ownershipRef) : nameOrder;
    });
}

export function recoveryDescriptorChainKey(name: string, ownershipRef: string): string {
  return `${normalizeName(name)}:${ownershipRef.trim().toLowerCase()}`;
}

function parseAndVerifyStoredDescriptor(input: unknown): SignedRecoveryDescriptor {
  const parsedDescriptor = parseSignedRecoveryDescriptor(input);

  if (!verifyRecoveryDescriptor(parsedDescriptor)) {
    throw new Error(`stored recovery descriptor for ${parsedDescriptor.name} failed signature verification`);
  }

  return parsedDescriptor;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
