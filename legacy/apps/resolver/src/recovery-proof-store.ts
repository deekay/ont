import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  loadDatabaseDocument,
  saveDatabaseDocument,
  type DatabaseConfig
} from "@ont/db";
import {
  computeRecoveryWalletProofHash,
  parseRecoveryWalletProof,
  type RecoveryWalletProof
} from "@ont/protocol";

export interface RecoveryWalletProofStoreSnapshot {
  readonly proofs: readonly RecoveryWalletProof[];
}

export type RecoveryWalletProofStore = Map<string, RecoveryWalletProof>;

export function parseRecoveryWalletProofStoreSnapshot(input: unknown): RecoveryWalletProofStore {
  if (!isRecord(input) || !Array.isArray(input.proofs)) {
    throw new Error("recovery wallet proof store must contain a proofs array");
  }

  const store: RecoveryWalletProofStore = new Map();

  for (const proof of input.proofs) {
    const parsedProof = parseRecoveryWalletProof(proof);
    store.set(computeRecoveryWalletProofHash(parsedProof), parsedProof);
  }

  return store;
}

export async function loadRecoveryWalletProofStoreFile(
  path: string
): Promise<RecoveryWalletProofStore> {
  try {
    const raw = await readFile(resolve(process.cwd(), path), "utf8");
    const parsed = JSON.parse(raw) as RecoveryWalletProofStoreSnapshot;
    return parseRecoveryWalletProofStoreSnapshot(parsed);
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

export async function loadRecoveryWalletProofStoreDatabase(
  config: DatabaseConfig,
  documentKey: string
): Promise<RecoveryWalletProofStore> {
  const payload = await loadDatabaseDocument(config, "recovery_wallet_proof_store", documentKey);
  return payload === null ? new Map() : parseRecoveryWalletProofStoreSnapshot(payload);
}

export async function saveRecoveryWalletProofStoreFile(
  path: string,
  store: ReadonlyMap<string, RecoveryWalletProof>
): Promise<void> {
  const resolvedPath = resolve(process.cwd(), path);
  await mkdir(dirname(resolvedPath), { recursive: true });

  await writeFile(
    resolvedPath,
    JSON.stringify(createRecoveryWalletProofStoreSnapshot(store), null, 2) + "\n",
    "utf8"
  );
}

export async function saveRecoveryWalletProofStoreDatabase(
  config: DatabaseConfig,
  documentKey: string,
  store: ReadonlyMap<string, RecoveryWalletProof>
): Promise<void> {
  await saveDatabaseDocument(
    config,
    "recovery_wallet_proof_store",
    documentKey,
    createRecoveryWalletProofStoreSnapshot(store)
  );
}

export function appendRecoveryWalletProof(
  store: Map<string, RecoveryWalletProof>,
  proof: RecoveryWalletProof
): string {
  const proofHash = computeRecoveryWalletProofHash(proof);
  store.set(proofHash, proof);
  return proofHash;
}

export function getRecoveryWalletProof(
  store: ReadonlyMap<string, RecoveryWalletProof>,
  proofHash: string
): RecoveryWalletProof | null {
  return store.get(proofHash.trim().toLowerCase()) ?? null;
}

export function countRecoveryWalletProofs(store: ReadonlyMap<string, RecoveryWalletProof>): number {
  return store.size;
}

export function listRecoveryWalletProofs(
  store: ReadonlyMap<string, RecoveryWalletProof>
): RecoveryWalletProof[] {
  return [...store.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, proof]) => proof);
}

function createRecoveryWalletProofStoreSnapshot(
  store: ReadonlyMap<string, RecoveryWalletProof>
): RecoveryWalletProofStoreSnapshot {
  return {
    proofs: listRecoveryWalletProofs(store)
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
