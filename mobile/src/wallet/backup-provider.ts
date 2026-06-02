// Storage providers for encrypted wallet backups. Kept separate from backup.ts
// (the pure crypto) because these import native modules — so the crypto stays
// unit-testable off-device, and the storage target is the only swappable part.
//
// Today: a local stub that stands in for cloud storage. Later: Google Drive
// (drive.appdata) and iCloud, implementing the same BackupProvider interface.
// Every provider only ever sees ciphertext.
import * as SecureStore from "expo-secure-store";

import type { BackupProvider, EncryptedBackup } from "./backup";

const STUB_KEY = "ont.backup.stub.v1";

/** Demo provider: keeps the (already-encrypted) blob on this device, standing in
 *  for cloud storage so the full backup/restore flow is walkable now. */
export class LocalStubBackupProvider implements BackupProvider {
  readonly label = "On this device (demo)";
  readonly isStub = true;

  async save(blob: EncryptedBackup): Promise<void> {
    await SecureStore.setItemAsync(STUB_KEY, JSON.stringify(blob));
  }
  async load(): Promise<EncryptedBackup | null> {
    const raw = await SecureStore.getItemAsync(STUB_KEY);
    return raw ? (JSON.parse(raw) as EncryptedBackup) : null;
  }
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(STUB_KEY);
  }
}
