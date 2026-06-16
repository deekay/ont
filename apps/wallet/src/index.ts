// @ont/wallet — B5 surface (the wallet, clean-build). See docs/core/B5_WALLET_CLASSIFICATION.md. The one
// surface that owns key material + signing (boundary-lint crypto-exempt). Exposes the narrow WalletSigner
// contract the CLI/claim DELEGATE to; consumes the B4/B5 adapters for all rules. Key derivation per WIRE §5.
export {
  deriveOwnerKey,
  type DerivedOwnerKey,
  type DeriveOwnerKeyResult,
} from "./key-derivation.js";
export {
  createWalletSigner,
  type WalletSigner,
  type ValueRecordSignFields,
  type RecoveryDescriptorSignFields,
  type CreateWalletSignerResult,
} from "./wallet-signer.js";
