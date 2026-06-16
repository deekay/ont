import { type LegacyTransaction } from "@ont/bitcoin";

// B4-PUB-INVOKE (B4_ADAPTERS_PLAN §11.2) — the publisher write-side: assemble the unsigned recover-owner
// INVOKE tx the owner broadcasts to invoke recovery. A write-side adapter validates NO untrusted input — its
// bar is the WRITE→READ round-trip: the assembled tx, dropped into a block, is ACCEPTED by the audited
// read-side buildConfirmedRecoverOwnerInvoke (B4-INDEX-INVOKE) with every decoded field equal to the operator
// intent. Pure + deterministic; signing / PSBT / broadcast are the I/O edge (B4-PUB-BROADCAST) / B5
// wallet-handoff. The vout-0 OP_RETURN carries the SAME encodeEvent(RecoverOwner 0x09) the read-side decodes,
// constructed ONLY from structured fields (no caller-supplied pre-encoded payload/script side channel). The
// adapter encodes operator intent — it does NOT pre-decide recovery authority (a non-invoke flags=1 still
// assembles and round-trips; the audited enforceRecoveryInvoke owns the authority verdict).

/** One funding UTXO the operator spends to fund the invoke tx. `scriptSig` is empty (signing is wallet-handoff). */
export interface RecoverOwnerInvokeFundingInput {
  readonly prevoutTxid: string;
  readonly prevoutVout: number;
  /** Optional; defaults to 0xffffffff. */
  readonly sequence?: number;
}

export interface AssembleRecoverOwnerInvokeInput {
  /** The prior owner-state txid being recovered from, 32-byte lowercase hex. */
  readonly prevStateTxid: string;
  /** The new owner pubkey the recovery installs, 32-byte lowercase hex. */
  readonly newOwnerPubkey: string;
  /** Recovery flags (single byte). The adapter does NOT judge authority — enforceRecoveryInvoke owns that. */
  readonly flags: number;
  /** The successor bond vout (single byte). */
  readonly successorBondVout: number;
  /** The challenge window (u32 blocks). */
  readonly challengeWindowBlocks: number;
  /** The armed recovery descriptor hash, 32-byte lowercase hex. */
  readonly recoveryDescriptorHash: string;
  /** The owner-key Schnorr signature, 64-byte lowercase hex. */
  readonly signature: string;
  /** The operator's funding UTXOs (non-empty). */
  readonly fundingInputs: readonly RecoverOwnerInvokeFundingInput[];
  /** Optional change output; its scriptPubKey MUST NOT be an OP_RETURN (no ambiguous second RecoverOwner). */
  readonly changeOutput?: { readonly valueSats: bigint; readonly scriptPubKeyHex: string };
  readonly version?: number;
  readonly locktime?: number;
}

/**
 * RED stub (B4-PUB-INVOKE): returns null until the assembler lands. Green contract (mirror of
 * assembleRootAnchorTx):
 *   validate prevStateTxid/newOwnerPubkey/recoveryDescriptorHash HEX_64_LOWER (uppercase → null); signature
 *   HEX_128_LOWER; flags/successorBondVout single bytes; challengeWindowBlocks u32; fundingInputs a non-empty
 *   array of { prevoutTxid HEX_64_LOWER, prevoutVout u32, sequence? u32 default 0xffffffff }; build inputs with
 *   scriptSigHex "" (unsigned). payload = encodeEvent({type:RecoverOwner, prevStateTxid, newOwnerPubkey, flags,
 *   successorBondVout, challengeWindowBlocks, recoveryDescriptorHash, signature}) (171 B); vout-0 = { valueSats:
 *   0n, scriptPubKeyHex: "6a4cab" + payloadHex } (OP_RETURN + PUSHDATA1 0xab=171 + payload). changeOutput, if
 *   given: valueSats bigint in [0, 2^64), scriptPubKeyHex LOWERCASE even hex not starting 0x6a — else null;
 *   appended after vout 0. version/locktime u32 (default 1/0). "Serializable LegacyTransaction or null"; never
 *   throws; does not mutate caller arrays. The event is built ONLY from structured fields (no side channel).
 */
export function assembleRecoverOwnerInvokeTx(input: AssembleRecoverOwnerInvokeInput): LegacyTransaction | null {
  void input;
  return null;
}
