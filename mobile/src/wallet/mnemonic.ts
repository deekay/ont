// 12-word BIP-39 phrase ↔ the app's 32-byte master seed.
//
// The unified user secret across every ONT surface: the claim site and the web
// tools generate 12 words and derive masterSeed = FIRST 32 BYTES of the BIP-39
// seed, then run the same BIP-32 paths this app uses (owner m/696969'/0'/i',
// funding m/84'/1'/0'/0/0). With this module the app accepts the same words, so
// a name claimed on the web restores here — locked by the shared conformance
// vectors (packages/protocol/testdata/conformance-vectors.json).
//
// Pure module: no RNG import, so the node-side crypto cross-checks can load it.
// Entropy for NEW phrases is injected by the caller (keys.ts uses expo-crypto).
import { entropyToMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
}

/** Loose detector: words rather than a 64-hex seed. */
export function looksLikeMnemonic(input: string): boolean {
  return normalizeMnemonic(input).split(" ").length >= 12;
}

/** Build a 12-word phrase from 16 bytes of caller-supplied entropy. */
export function mnemonicFromEntropy(entropy: Uint8Array): string {
  if (entropy.length !== 16) throw new Error("12-word mnemonic needs exactly 16 bytes of entropy");
  return entropyToMnemonic(entropy, wordlist);
}

/** The app's master seed for a phrase: first 32 bytes of the BIP-39 seed (hex). */
export function seedHexFromMnemonic(mnemonic: string): string {
  const normalized = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("That is not a valid 12-word recovery phrase.");
  }
  const seed = mnemonicToSeedSync(normalized).slice(0, 32);
  return Array.from(seed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
