import {
  signValueRecord,
  signRecoveryDescriptor,
  type SignedValueRecord,
  type SignedRecoveryDescriptor,
} from "@ont/protocol";
import { deriveOwnerKey } from "./key-derivation.js";
import {
  buildAndSignTransferArtifact,
  type TransferArtifactInput,
  type BuildTransferResult,
} from "./transfer-artifacts.js";
import type { WalletTransactionBuilder } from "./wallet-transaction-builder.js";
import {
  buildImmatureSaleTransferArtifact,
  buildMatureSaleTransferArtifact,
  coSignSaleTransferArtifact,
  type ImmatureSaleTransferInput,
  type MatureSaleTransferInput,
  type BuildSaleResult,
  type CoSignSaleResult,
} from "./sale-transfer-artifacts.js";
import {
  buildAndSignAuctionBidArtifact,
  type AuctionBidArtifactInput,
  type BuildAuctionBidResult,
} from "./auction-bid-artifacts.js";

// B5-WALLET (first slice) — the WalletSigner contract: the NARROW port the CLI / claim DELEGATE to. It exposes
// the owner pubkey + signing over value-records / recovery-descriptors; the private key/seed are held inside
// the signer and NEVER cross this boundary (the returned signed artifacts carry no key material). Non-wallet
// surfaces depend on this type-only contract (or a test-local mock), never on wallet signing internals or a
// crypto lib (the boundary lint enforces that). PSBT signing + W17 packages layer on this in later slices.

/** Value-record fields the caller supplies; the wallet adds the owner key + signature. */
export interface ValueRecordSignFields {
  readonly name: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt: string;
}

/** Recovery-descriptor fields the caller supplies; the wallet adds the owner key + signature. */
export interface RecoveryDescriptorSignFields {
  readonly name: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousDescriptorHash: string | null;
  readonly recoveryAddress: string;
  readonly signingProfile?: string;
  readonly challengeWindowBlocks?: number;
  readonly issuedAt: string;
}

/** The narrow signing contract CLI/claim DELEGATE to. The key/seed never cross this boundary. */
export interface WalletSigner {
  /** The owner x-only pubkey this signer signs as (NOT the private key). */
  readonly ownerPubkey: string;
  signValueRecord(fields: ValueRecordSignFields): SignedValueRecord;
  signRecoveryDescriptor(fields: RecoveryDescriptorSignFields): SignedRecoveryDescriptor;
}

export type CreateWalletSignerResult =
  | { readonly ok: true; readonly signer: WalletSigner & WalletTransactionBuilder }
  | { readonly ok: false; readonly reason: "malformed-mnemonic" | "malformed-index" };

/**
 * Create a signer for the owner key at `index` (deriveOwnerKey; else propagate the reason). The returned signer
 * closes over ownerPrivateKeyHex and exposes ownerPubkey + signValueRecord/signRecoveryDescriptor (delegating to
 * @ont/protocol with the held key). The private key/seed are NEVER returned or exposed on the signer.
 */
export function createWalletSigner(mnemonic: string, index = 0): CreateWalletSignerResult {
  const derived = deriveOwnerKey(mnemonic, index);
  if (!derived.ok) return { ok: false, reason: derived.reason };
  // The private key is captured ONLY in this closure — never an enumerable property of the signer, so it
  // never appears by key name or in a serialized dump (the no-key-exposure pin).
  const { ownerPrivateKeyHex, ownerPubkey } = derived.key;
  const signer: WalletSigner & WalletTransactionBuilder = {
    ownerPubkey,
    signValueRecord(fields: ValueRecordSignFields): SignedValueRecord {
      return signValueRecord({ ...fields, ownerPrivateKeyHex });
    },
    signRecoveryDescriptor(fields: RecoveryDescriptorSignFields): SignedRecoveryDescriptor {
      return signRecoveryDescriptor({ ...fields, ownerPrivateKeyHex });
    },
    buildAndSignTransfer(input: TransferArtifactInput): BuildTransferResult {
      return buildAndSignTransferArtifact(ownerPrivateKeyHex, input);
    },
    buildAndSignAuctionBid(input: AuctionBidArtifactInput): BuildAuctionBidResult {
      return buildAndSignAuctionBidArtifact(ownerPrivateKeyHex, input);
    },
    buildImmatureSaleTransfer(input: ImmatureSaleTransferInput): BuildSaleResult {
      return buildImmatureSaleTransferArtifact(ownerPrivateKeyHex, input);
    },
    buildMatureSaleTransfer(input: MatureSaleTransferInput): BuildSaleResult {
      return buildMatureSaleTransferArtifact(ownerPrivateKeyHex, input);
    },
    coSignSaleTransfer(partialPsbtBase64: string): CoSignSaleResult {
      return coSignSaleTransferArtifact(ownerPrivateKeyHex, partialPsbtBase64);
    },
  };
  return { ok: true, signer };
}
