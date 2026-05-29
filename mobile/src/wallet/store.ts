// Keystore persistence for the on-device wallet.
//
// Secrets live in the iOS Keychain via expo-secure-store: encrypted at rest,
// device-only (never synced to iCloud), and readable only while the device is
// unlocked. The blob is tiny (owner privkey hex + funding WIF + derived
// metadata), well under SecureStore's ~2KB value limit.
import * as SecureStore from "expo-secure-store";

import { NETWORK } from "../config";
import type { OntNetwork, WalletKeys } from "./keys";

const STORE_KEY = "ont.wallet.v1";
const STORE_VERSION = 1;

export interface StoredWallet extends WalletKeys {
  readonly version: number;
  readonly network: OntNetwork;
  readonly createdAt: string;
}

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function hasWallet(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(STORE_KEY, SECURE_OPTIONS);
  return raw != null;
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY, SECURE_OPTIONS);
  if (raw == null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredWallet;
    if (!parsed?.owner?.ownerPrivateKeyHex || !parsed?.funding?.fundingWif) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveWallet(keys: WalletKeys, network: OntNetwork = NETWORK as OntNetwork): Promise<StoredWallet> {
  const stored: StoredWallet = {
    version: STORE_VERSION,
    network,
    createdAt: new Date().toISOString(),
    owner: keys.owner,
    funding: keys.funding,
  };
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(stored), SECURE_OPTIONS);
  return stored;
}

export async function clearWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY, SECURE_OPTIONS);
}
