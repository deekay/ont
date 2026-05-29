// Wallet state for the app: loads the keystore on launch and exposes
// create / import / remove operations. Secrets never leave this layer except
// when the user explicitly reveals them for backup.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { NETWORK } from "../config";
import {
  fundingKeyFromWif,
  generateWallet,
  ownerPubkeyForPrivateKey,
  type OntNetwork,
  type WalletKeys,
} from "./keys";
import { clearWallet, loadWallet, saveWallet, type StoredWallet } from "./store";

const NETWORK_NAME = NETWORK as OntNetwork;

export interface ImportInput {
  readonly ownerPrivateKeyHex: string;
  readonly fundingWif: string;
}

interface WalletContextValue {
  readonly status: "loading" | "ready";
  readonly wallet: StoredWallet | null;
  readonly busy: boolean;
  createWallet: () => Promise<void>;
  importWallet: (input: ImportInput) => Promise<void>;
  removeWallet: () => Promise<void>;
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
        if (active) {
          setWallet(w);
        }
      })
      .catch(() => {
        if (active) {
          setWallet(null);
        }
      })
      .finally(() => {
        if (active) {
          setStatus("ready");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const createWallet = useCallback(async () => {
    setBusy(true);
    try {
      const keys = generateWallet(NETWORK_NAME);
      const stored = await saveWallet(keys, NETWORK_NAME);
      setWallet(stored);
    } finally {
      setBusy(false);
    }
  }, []);

  const importWallet = useCallback(async (input: ImportInput) => {
    setBusy(true);
    try {
      const ownerPrivateKeyHex = input.ownerPrivateKeyHex.trim().toLowerCase();
      const fundingWif = input.fundingWif.trim();
      const ownerPubkey = ownerPubkeyForPrivateKey(ownerPrivateKeyHex);
      if (!ownerPubkey) {
        throw new Error("Owner private key must be 32 bytes of hex (64 characters).");
      }
      let funding;
      try {
        funding = fundingKeyFromWif(fundingWif, NETWORK_NAME);
      } catch {
        throw new Error("Funding WIF is not valid for this network.");
      }
      const keys: WalletKeys = { owner: { ownerPrivateKeyHex, ownerPubkey }, funding };
      const stored = await saveWallet(keys, NETWORK_NAME);
      setWallet(stored);
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

  const value = useMemo<WalletContextValue>(
    () => ({ status, wallet, busy, createWallet, importWallet, removeWallet }),
    [status, wallet, busy, createWallet, importWallet, removeWallet],
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
