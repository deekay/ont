// 12-word BIP-39 owner keys for the browser tools — the SAME derivation as the
// claim site (apps/claim/src/keys.ts) and the mobile app: master seed = first
// 32 bytes of the BIP-39 seed, owner key per name at m/696969'/0'/i'. One phrase
// is the user's only secret across every ONT surface; a key generated here
// restores in the app and on claim.opennametags.org from the same 12 words.
// Locked by the shared conformance vectors (packages/protocol/testdata).
import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { schnorr } from "@noble/curves/secp256k1.js";

const OWNER_PURPOSE = 696969; // hardened "ONT owner" branch (matches app + claim site)
const ownerPath = (index: number): string => `m/${OWNER_PURPOSE}'/0'/${index}'`;

export interface DerivedOwnerKey {
  readonly ownerPubkey: string;
  readonly ownerPrivateKeyHex: string;
}

/** A fresh 12-word (128-bit) BIP-39 mnemonic — the one secret that restores everything. */
export function generateMnemonic12(): string {
  return bip39Generate(wordlist, 128);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

/** Loose detector: does this input look like a phrase rather than a hex key? */
export function looksLikeMnemonic(input: string): boolean {
  return normalizeMnemonic(input).split(" ").length >= 12;
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The app's 32-byte master seed = first 32 bytes of the BIP-39 seed. */
function masterSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(normalizeMnemonic(mnemonic)).slice(0, 32);
}

/** Derive the owner key at a name index, matching the app's path exactly. */
export function deriveOwnerKey(mnemonic: string, index = 0): DerivedOwnerKey {
  if (!Number.isInteger(index) || index < 0) throw new Error("owner index must be a non-negative integer");
  const node = HDKey.fromMasterSeed(masterSeed(mnemonic)).derive(ownerPath(index));
  if (!node.privateKey) throw new Error("derived owner node has no private key");
  return {
    ownerPrivateKeyHex: bytesToHex(node.privateKey),
    ownerPubkey: bytesToHex(schnorr.getPublicKey(node.privateKey))
  };
}

/**
 * Find which key index under a phrase controls `expectedOwnerPubkey`, scanning
 * indices 0..limit (names each use their own index, BIP44-style). Returns null
 * if none match within the scan window.
 */
export function findOwnerIndex(mnemonic: string, expectedOwnerPubkey: string, limit = 40): { index: number; key: DerivedOwnerKey } | null {
  const target = expectedOwnerPubkey.toLowerCase();
  for (let index = 0; index < limit; index += 1) {
    const key = deriveOwnerKey(mnemonic, index);
    if (key.ownerPubkey === target) return { index, key };
  }
  return null;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
