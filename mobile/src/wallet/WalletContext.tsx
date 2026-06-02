// Wallet state for the app: loads the HD keystore on launch and exposes
// create / restore / remove plus the per-name key accessors. Secrets never leave
// this layer except when the user explicitly reveals the seed for backup.
//
// Key model: ONE master seed derives a fresh owner key per name. The name ->
// index map records which derived key controls which name; ownerKeyForName looks
// it up, allocateOwnerKeyForName mints the next one for a new claim/transfer.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { resolver } from "../api/resolver";
import { NETWORK } from "../config";
import { normalizeName } from "./accumulator";
import { deriveOwnerKey, generateSeedHex, normalizeSeedHex, type OntNetwork, type OwnerKey } from "./keys";
import { clearWallet, loadWallet, newHdWallet, saveWallet, type StoredWallet } from "./store";

const NETWORK_NAME = NETWORK as OntNetwork;

/** Best-effort: discover which names a seed already controls by matching derived
 *  owner keys against the resolver. Used on raw-seed restore (backup restore
 *  carries the map directly and doesn't need this). */
async function discoverNamesForWallet(wallet: StoredWallet, gap = 50): Promise<StoredWallet> {
  const res = await resolver.names();
  const pubkeyToIndex = new Map<string, number>();
  for (let i = 0; i < gap; i += 1) {
    pubkeyToIndex.set(deriveOwnerKey(wallet.seedHex, i, wallet.network).ownerPubkey.toLowerCase(), i);
  }
  const names: Record<string, number> = { ...wallet.names };
  let maxIndex = wallet.nextIndex - 1;
  for (const rec of res.names) {
    const owner = (rec.currentOwnerPubkey ?? "").toLowerCase();
    const idx = pubkeyToIndex.get(owner);
    if (idx !== undefined) {
      names[rec.name] = idx;
      if (idx > maxIndex) maxIndex = idx;
    }
  }
  return { ...wallet, names, nextIndex: maxIndex + 1 };
}

export interface ImportHdInput {
  readonly seedHex: string;
  readonly names?: Record<string, number>;
  readonly nextIndex?: number;
}

interface WalletContextValue {
  readonly status: "loading" | "ready";
  readonly wallet: StoredWallet | null;
  readonly busy: boolean;
  createWallet: () => Promise<void>;
  /** Restore from a raw master seed (best-effort name discovery against the resolver). */
  restoreWallet: (seedHex: string) => Promise<void>;
  /** Restore from a decrypted backup payload (carries the name->index map). */
  importHdWallet: (input: ImportHdInput) => Promise<void>;
  removeWallet: () => Promise<void>;
  /** Re-scan the resolver to repopulate the name->index map for this seed. */
  rescanNames: () => Promise<void>;
  /** The owner key controlling a name this wallet manages, or null. */
  ownerKeyForName: (name: string) => OwnerKey | null;
  /** Assign (or reuse) the owner key for a name and persist the mapping. */
  allocateOwnerKeyForName: (name: string) => Promise<OwnerKey>;
  /** Every owner pubkey this wallet controls (one per managed name). */
  allOwnerPubkeys: () => string[];
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [wallet, setWallet] = useState<StoredWallet | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadWallet()
      .then((w) => {
        if (active) setWallet(w);
      })
      .catch(() => {
        if (active) setWallet(null);
      })
      .finally(() => {
        if (active) setStatus("ready");
      });
    return () => {
      active = false;
    };
  }, []);

  const createWallet = useCallback(async () => {
    setBusy(true);
    try {
      const seedHex = generateSeedHex();
      const w = await saveWallet(newHdWallet(seedHex, NETWORK_NAME));
      setWallet(w);
    } finally {
      setBusy(false);
    }
  }, []);

  const restoreWallet = useCallback(async (seedHexInput: string) => {
    setBusy(true);
    try {
      const seedHex = normalizeSeedHex(seedHexInput);
      if (!seedHex) {
        throw new Error("Master seed must be 64 hex characters (32 bytes).");
      }
      let w = newHdWallet(seedHex, NETWORK_NAME);
      try {
        w = await discoverNamesForWallet(w);
      } catch {
        /* offline / resolver down — wallet still usable, names re-scan later */
      }
      await saveWallet(w);
      setWallet(w);
    } finally {
      setBusy(false);
    }
  }, []);

  const importHdWallet = useCallback(async (input: ImportHdInput) => {
    setBusy(true);
    try {
      const seedHex = normalizeSeedHex(input.seedHex);
      if (!seedHex) {
        throw new Error("Backup seed is not valid (need 32 bytes of hex).");
      }
      const base = newHdWallet(seedHex, NETWORK_NAME);
      const names = input.names ?? {};
      const nextIndex =
        input.nextIndex ?? Object.values(names).reduce((max, i) => (i > max ? i : max), -1) + 1;
      const w = await saveWallet({ ...base, names, nextIndex });
      setWallet(w);
    } finally {
      setBusy(false);
    }
  }, []);

  const removeWallet = useCallback(async () => {
    setBusy(true);
    try {
      await clearWallet();
      setWallet(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const rescanNames = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    try {
      const w = await discoverNamesForWallet(wallet);
      await saveWallet(w);
      setWallet(w);
    } finally {
      setBusy(false);
    }
  }, [wallet]);

  const ownerKeyForName = useCallback(
    (name: string): OwnerKey | null => {
      if (!wallet) return null;
      const idx = wallet.names[normalizeName(name)];
      if (idx === undefined) return null;
      return deriveOwnerKey(wallet.seedHex, idx, wallet.network);
    },
    [wallet],
  );

  const allocateOwnerKeyForName = useCallback(
    async (name: string): Promise<OwnerKey> => {
      if (!wallet) {
        throw new Error("No wallet on this device.");
      }
      const n = normalizeName(name);
      const existing = wallet.names[n];
      if (existing !== undefined) {
        return deriveOwnerKey(wallet.seedHex, existing, wallet.network);
      }
      const index = wallet.nextIndex;
      const updated: StoredWallet = {
        ...wallet,
        names: { ...wallet.names, [n]: index },
        nextIndex: index + 1,
      };
      await saveWallet(updated);
      setWallet(updated);
      return deriveOwnerKey(updated.seedHex, index, updated.network);
    },
    [wallet],
  );

  const allOwnerPubkeys = useCallback((): string[] => {
    if (!wallet) return [];
    const seen = new Set<number>();
    const pubkeys: string[] = [];
    for (const idx of Object.values(wallet.names)) {
      if (seen.has(idx)) continue;
      seen.add(idx);
      pubkeys.push(deriveOwnerKey(wallet.seedHex, idx, wallet.network).ownerPubkey);
    }
    return pubkeys;
  }, [wallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      wallet,
      busy,
      createWallet,
      restoreWallet,
      importHdWallet,
      removeWallet,
      rescanNames,
      ownerKeyForName,
      allocateOwnerKeyForName,
      allOwnerPubkeys,
    }),
    [
      status,
      wallet,
      busy,
      createWallet,
      restoreWallet,
      importHdWallet,
      removeWallet,
      rescanNames,
      ownerKeyForName,
      allocateOwnerKeyForName,
      allOwnerPubkeys,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used inside a WalletProvider");
  }
  return ctx;
}
