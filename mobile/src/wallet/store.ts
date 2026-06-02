// Keystore persistence for the on-device HD wallet.
//
// Secrets live in the iOS Keychain via expo-secure-store: encrypted at rest,
// device-only (never synced to iCloud), readable only while unlocked. The blob
// holds the master seed, the derived funding key, and the name -> owner-key-index
// map (which derived key controls which name). The seed is the single secret;
// everything else re-derives from it.
import * as SecureStore from "expo-secure-store";

import { NETWORK } from "../config";
import { deriveFundingKey, type FundingKey, type OntNetwork } from "./keys";

const STORE_KEY = "ont.wallet.v2";
const LEGACY_STORE_KEY = "ont.wallet.v1"; // pre-HD single-key wallet (cannot migrate to a seed)
const STORE_VERSION = 2;

export interface StoredWallet {
  readonly version: number;
  readonly network: OntNetwork;
  readonly createdAt: string;
  /** 32-byte master seed (hex). The single secret; all keys re-derive from it. */
  readonly seedHex: string;
  /** Single P2WPKH funding key, derived from the seed (cached for convenience). */
  readonly funding: FundingKey;
  /** name -> owner-key derivation index (which derived key controls each name). */
  readonly names: Record<string, number>;
  /** Next free owner-key index to allocate for a new claim/transfer. */
  readonly nextIndex: number;
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
    // A legacy single-key wallet can't be migrated to a seed; clear it so the
    // app starts clean rather than crashing on the old shape (signet-only).
    await SecureStore.deleteItemAsync(LEGACY_STORE_KEY, SECURE_OPTIONS).catch(() => undefined);
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredWallet>;
    if (
      typeof parsed.seedHex !== "string" ||
      !parsed.funding?.fundingWif ||
      typeof parsed.network !== "string"
    ) {
      return null;
    }
    return {
      version: typeof parsed.version === "number" ? parsed.version : STORE_VERSION,
      network: parsed.network as OntNetwork,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      seedHex: parsed.seedHex,
      funding: parsed.funding as FundingKey,
      names:
        parsed.names && typeof parsed.names === "object"
          ? (parsed.names as Record<string, number>)
          : {},
      nextIndex: typeof parsed.nextIndex === "number" ? parsed.nextIndex : 0,
    };
  } catch {
    return null;
  }
}

/** Build a fresh HD wallet from a master seed (pure; no IO). */
export function newHdWallet(seedHex: string, network: OntNetwork = NETWORK as OntNetwork): StoredWallet {
  return {
    version: STORE_VERSION,
    network,
    createdAt: new Date().toISOString(),
    seedHex,
    funding: deriveFundingKey(seedHex, network),
    names: {},
    nextIndex: 0,
  };
}

export async function saveWallet(wallet: StoredWallet): Promise<StoredWallet> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(wallet), SECURE_OPTIONS);
  return wallet;
}

export async function clearWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY, SECURE_OPTIONS);
  await SecureStore.deleteItemAsync(LEGACY_STORE_KEY, SECURE_OPTIONS).catch(() => undefined);
}
