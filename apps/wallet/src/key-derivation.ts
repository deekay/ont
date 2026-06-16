// B5-WALLET (B5_WALLET_CLASSIFICATION.md, first slice) — owner-key derivation from the 12-word secret, per
// WIRE_FORMAT §5: masterSeed = first 32 bytes of the BIP-39 seed; owner key i at m/696969'/0'/i' (x-only).
// This is the wallet's KEY-MATERIAL domain — the wallet is the one boundary-lint crypto-exempt surface. The
// derived private key never crosses the WalletSigner boundary (see wallet-signer.ts). Locked byte-identical by
// packages/wire/vectors/keys.json. Total + fail-closed; never throws.

const OWNER_PURPOSE = 696969; // hardened "ONT owner" branch (WIRE §5)
const ownerPath = (index: number): string => `m/${OWNER_PURPOSE}'/0'/${index}'`;

export interface DerivedOwnerKey {
  readonly ownerPrivateKeyHex: string;
  readonly ownerPubkey: string;
}
export type DeriveOwnerKeyResult =
  | { readonly ok: true; readonly key: DerivedOwnerKey }
  | { readonly ok: false; readonly reason: "malformed-mnemonic" | "malformed-index" };

/**
 * RED stub. Green: validateMnemonic(mnemonic) else malformed-mnemonic; index a non-negative safe integer else
 * malformed-index; masterSeed = mnemonicToSeedSync(mnemonic.trim()).slice(0,32);
 * HDKey.fromMasterSeed(masterSeed).derive(`m/696969'/0'/${index}'`).privateKey → ownerPrivateKeyHex;
 * ownerPubkey = deriveOwnerPubkey(ownerPrivateKeyHex). Must match packages/wire/vectors/keys.json byte-for-byte.
 */
export function deriveOwnerKey(mnemonic: string, index = 0): DeriveOwnerKeyResult {
  void mnemonic;
  void index;
  return { ok: false, reason: "malformed-mnemonic" };
}
