// B5-WALLET (B5_WALLET_CLASSIFICATION.md, first slice) — owner-key derivation from the 12-word secret, per
// WIRE_FORMAT §5 (masterSeed = first 32 bytes of the BIP-39 seed; owner key i at m/696969'/0'/i', x-only). The
// wallet is the one boundary-lint crypto-exempt surface; the derived private key never crosses the WalletSigner
// boundary (see wallet-signer.ts). This is the wallet's hardened, fail-closed/result-typed contract over the
// single low-level §5 primitive in @ont/wire (deriveOwnerKey) — one derivation implementation, validated here
// (the wire primitive throws and does not checksum the mnemonic; the wallet validates + closes failures). Pinned
// byte-identical by packages/wire/vectors/keys.json. Total + fail-closed; never throws.
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { deriveOwnerKey as deriveOwnerKeyWire } from "@ont/wire";

export interface DerivedOwnerKey {
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
}
export type DeriveOwnerKeyResult =
  | { readonly ok: true; readonly key: DerivedOwnerKey }
  | { readonly ok: false; readonly reason: "malformed-mnemonic" | "malformed-index" };

/**
 * Derive the owner key for `index` from the 12-word secret (WIRE §5). validateMnemonic else malformed-mnemonic;
 * index a non-negative safe integer else malformed-index; otherwise delegate the actual §5 derivation to
 * @ont/wire's deriveOwnerKey (masterSeed = first 32B of the BIP-39 seed → m/696969'/0'/index' → x-only key).
 * Byte-identical to packages/wire/vectors/keys.json.
 */
export function deriveOwnerKey(mnemonic: string, index = 0): DeriveOwnerKeyResult {
  if (typeof mnemonic !== "string") return { ok: false, reason: "malformed-mnemonic" };
  const phrase = mnemonic.trim();
  if (!validateMnemonic(phrase, wordlist)) return { ok: false, reason: "malformed-mnemonic" };
  if (!Number.isSafeInteger(index) || index < 0) return { ok: false, reason: "malformed-index" };
  try {
    const { privateKey, xOnlyPubkey } = deriveOwnerKeyWire(phrase, index);
    return { ok: true, key: { ownerPrivateKeyHex: privateKey, ownerPubkey: xOnlyPubkey } };
  } catch {
    return { ok: false, reason: "malformed-mnemonic" };
  }
}
