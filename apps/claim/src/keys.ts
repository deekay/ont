// 12-word BIP-39 wallet keys for the claim site.
//
// Interop with the mobile app: the mnemonic is turned into the app's master seed
// (first 32 bytes of the BIP-39 seed) and run through the SAME BIP-32 derivation
// the app uses (owner key per name at m/696969'/0'/i', funding at m/84'/1'/0'/0/0).
// So a name claimed on the web restores in the app from the same 12 words.
import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { schnorr } from "@noble/curves/secp256k1.js";

const OWNER_PURPOSE = 696969; // hardened "ONT owner" branch (matches the app)
const ownerPath = (index: number): string => `m/${OWNER_PURPOSE}'/0'/${index}'`;

export interface OwnerKey {
  readonly ownerPubkey: string;
  readonly ownerPrivateKeyHex: string;
}

/** A fresh 12-word (128-bit) BIP-39 mnemonic — the one secret that restores everything. */
export function generateMnemonic12(): string {
  return bip39Generate(wordlist, 128);
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim(), wordlist);
}

/** The app's 32-byte master seed = first 32 bytes of the BIP-39 seed. */
function masterSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(mnemonic.trim()).slice(0, 32);
}

/** Derive the owner key for a name index (default 0), matching the app's path. */
export function deriveOwnerKey(mnemonic: string, index = 0): OwnerKey {
  if (!Number.isInteger(index) || index < 0) throw new Error("owner index must be a non-negative integer");
  const node = HDKey.fromMasterSeed(masterSeed(mnemonic)).derive(ownerPath(index));
  if (!node.privateKey) throw new Error("derived owner node has no private key");
  return {
    ownerPrivateKeyHex: bytesToHex(node.privateKey),
    ownerPubkey: bytesToHex(schnorr.getPublicKey(node.privateKey)),
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
