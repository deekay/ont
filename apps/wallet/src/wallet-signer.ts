import type { SignedValueRecord, SignedRecoveryDescriptor } from "@ont/protocol";

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
  | { readonly ok: true; readonly signer: WalletSigner }
  | { readonly ok: false; readonly reason: "malformed-mnemonic" | "malformed-index" };

/**
 * RED stub. Green: deriveOwnerKey(mnemonic, index) (else propagate the reason); return a signer that closes
 * over ownerPrivateKeyHex and exposes ownerPubkey + signValueRecord/signRecoveryDescriptor (consuming
 * @ont/protocol signValueRecord/signRecoveryDescriptor with the held key). The private key/seed are NEVER
 * returned or exposed on the signer.
 */
export function createWalletSigner(mnemonic: string, index = 0): CreateWalletSignerResult {
  void mnemonic;
  void index;
  return { ok: false, reason: "malformed-mnemonic" };
}
