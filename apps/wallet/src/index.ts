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
export { type WalletTransactionBuilder } from "./wallet-transaction-builder.js";
export {
  type TransferArtifactInput,
  type TransferFundingInput,
  type TransferNetwork,
  type SignedTransferArtifact,
  type SignedTransferArtifactOutput,
  type BuildTransferResult,
  type TransferBuildReason,
} from "./transfer-artifacts.js";
export {
  type ImmatureSaleTransferInput,
  type SaleFundingInput,
  type SaleOutput,
  type SalePsbtArtifact,
  type BuildSaleResult,
  type SaleBuildReason,
  type CoSignedSaleArtifact,
  type CoSignSaleResult,
  type CoSignSaleReason,
} from "./sale-transfer-artifacts.js";
