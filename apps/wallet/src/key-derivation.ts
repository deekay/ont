// B5-WALLET (B5_WALLET_CLASSIFICATION.md, first slice) — owner-key derivation from the 12-word secret, per
// WIRE_FORMAT §5: masterSeed = first 32 bytes of the BIP-39 seed; owner key i at m/696969'/0'/i' (x-only).
// This is the wallet's KEY-MATERIAL domain — the wallet is the one boundary-lint crypto-exempt surface. The
// derived private key never crosses the WalletSigner boundary (see wallet-signer.ts). Locked byte-identical by
// packages/wire/vectors/keys.json. Total + fail-closed; never throws.
import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { deriveOwnerPubkey } from "@ont/protocol";

const OWNER_PURPOSE = 696969; // hardened "ONT owner" branch (WIRE §5)
const ownerPath = (index: number): string => `m/${OWNER_PURPOSE}'/0'/${index}'`;
const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export interface DerivedOwnerKey {
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
}
export type DeriveOwnerKeyResult =
  | { readonly ok: true; readonly key: DerivedOwnerKey }
  | { readonly ok: false; readonly reason: "malformed-mnemonic" | "malformed-index" };

/**
 * Derive the owner key for `index` from the 12-word secret (WIRE §5). validateMnemonic else malformed-mnemonic;
 * index a non-negative safe integer else malformed-index; masterSeed = mnemonicToSeedSync(mnemonic.trim())
 * .slice(0,32); HDKey.fromMasterSeed(masterSeed).derive(`m/696969'/0'/${index}'`).privateKey → ownerPrivateKeyHex;
 * ownerPubkey = deriveOwnerPubkey(ownerPrivateKeyHex). Byte-identical to packages/wire/vectors/keys.json.
 */
export function deriveOwnerKey(mnemonic: string, index = 0): DeriveOwnerKeyResult {
  if (typeof mnemonic !== "string") return { ok: false, reason: "malformed-mnemonic" };
  const phrase = mnemonic.trim();
  if (!validateMnemonic(phrase, wordlist)) return { ok: false, reason: "malformed-mnemonic" };
  if (!Number.isSafeInteger(index) || index < 0) return { ok: false, reason: "malformed-index" };
  try {
    const masterSeed = mnemonicToSeedSync(phrase).slice(0, 32);
    const node = HDKey.fromMasterSeed(masterSeed).derive(ownerPath(index));
    if (node.privateKey === null) return { ok: false, reason: "malformed-mnemonic" };
    const ownerPrivateKeyHex = toHex(node.privateKey);
    const ownerPubkey = deriveOwnerPubkey(ownerPrivateKeyHex);
    return { ok: true, key: { ownerPrivateKeyHex, ownerPubkey } };
  } catch {
    return { ok: false, reason: "malformed-mnemonic" };
  }
}
