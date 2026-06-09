import { schnorr } from "@noble/curves/secp256k1.js";

import { deriveOwnerKey, findOwnerIndex, generateMnemonic12, isValidMnemonic, looksLikeMnemonic } from "./browser-keys.js";

export interface BrowserGeneratedOwnerKey {
  /** The 12-word phrase — the user's ONE secret, shared with the app + claim site. */
  readonly mnemonic: string;
  readonly ownerPubkey: string;
  readonly privateKeyHex: string;
}

/**
 * Generate an owner key the unified way: a fresh 12-word phrase, owner key at
 * index 0. (Previously this minted a raw random key recoverable from nothing —
 * a third key universe alongside the claim site's phrases and the app's seed.)
 */
export function generateBrowserOwnerKey(): BrowserGeneratedOwnerKey {
  const mnemonic = generateMnemonic12();
  const key = deriveOwnerKey(mnemonic, 0);
  return { mnemonic, ownerPubkey: key.ownerPubkey, privateKeyHex: key.ownerPrivateKeyHex };
}

export interface ResolvedOwnerSecret {
  readonly privateKeyHex: string;
  readonly ownerPubkey: string;
  /** Set when the input was a phrase: which key index matched. */
  readonly mnemonicIndex?: number;
}

/**
 * Accept the owner secret as EITHER a raw 64-hex private key or a 12-word
 * phrase. For a phrase, scan key indices 0..40 for the one controlling
 * `expectedOwnerPubkey` (each name uses its own index under one phrase).
 */
export function resolveOwnerSecret(input: string, expectedOwnerPubkey: string | null): ResolvedOwnerSecret {
  const raw = input.trim();
  if (looksLikeMnemonic(raw)) {
    if (!isValidMnemonic(raw)) {
      throw new Error("That looks like a recovery phrase, but it is not a valid 12-word phrase.");
    }
    if (expectedOwnerPubkey === null) {
      const key = deriveOwnerKey(raw, 0);
      return { privateKeyHex: key.ownerPrivateKeyHex, ownerPubkey: key.ownerPubkey, mnemonicIndex: 0 };
    }
    const match = findOwnerIndex(raw, expectedOwnerPubkey);
    if (match === null) {
      throw new Error("No key in this phrase's first 40 indexes controls the loaded name — is this the right phrase?");
    }
    return { privateKeyHex: match.key.ownerPrivateKeyHex, ownerPubkey: match.key.ownerPubkey, mnemonicIndex: match.index };
  }
  const normalized = raw.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Paste the owner private key (64 hex chars) or the 12-word recovery phrase.");
  }
  return { privateKeyHex: normalized, ownerPubkey: bytesToHex(schnorr.getPublicKey(normalized)) };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
