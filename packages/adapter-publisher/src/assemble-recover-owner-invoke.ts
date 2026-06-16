import { type LegacyTransaction, type LegacyTransactionInput, type LegacyTransactionOutput } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";

const HEX_64_LOWER = /^[0-9a-f]{64}$/;
const HEX_128_LOWER = /^[0-9a-f]{128}$/; // 64-byte Schnorr signature, lowercase (the serializer is lowercase-only)
const HEX_EVEN_LOWER = /^(?:[0-9a-f]{2})*$/;
const U32_MAX = 0xffff_ffff;
const isU32 = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= U32_MAX;
const isByte = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xff;

function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}

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
 * GREEN contract (B4-PUB-INVOKE), mirror of assembleRootAnchorTx:
 *   validate prevStateTxid/newOwnerPubkey/recoveryDescriptorHash HEX_64_LOWER (uppercase → null); signature
 *   HEX_128_LOWER; flags/successorBondVout single bytes; challengeWindowBlocks u32; version/locktime u32 if
 *   given; fundingInputs a non-empty array of { prevoutTxid HEX_64_LOWER, prevoutVout u32, sequence? u32
 *   default 0xffffffff }; build inputs with scriptSigHex "" (unsigned). payload = encodeEvent({type:RecoverOwner,
 *   prevStateTxid, newOwnerPubkey, flags, successorBondVout, challengeWindowBlocks, recoveryDescriptorHash,
 *   signature}) (171 B); vout-0 = { valueSats: 0n, scriptPubKeyHex: "6a4cab" + payloadHex } (OP_RETURN +
 *   PUSHDATA1 0xab=171 + payload). changeOutput, if given: valueSats bigint in [0, 2^64), scriptPubKeyHex
 *   LOWERCASE even hex not starting 0x6a (no ambiguous second RecoverOwner) — else null; appended after vout 0.
 *   version/locktime default 1/0. The explicit lowercase/byte/u32 validation guarantees the read-side decode is
 *   EXACTLY the operator intent. "Serializable LegacyTransaction or null"; never throws; no caller mutation.
 *   The event is built ONLY from structured fields via encodeEvent (no caller pre-encoded payload/script).
 */
export function assembleRecoverOwnerInvokeTx(input: AssembleRecoverOwnerInvokeInput): LegacyTransaction | null {
  try {
    if (input === null || typeof input !== "object") return null;
    const {
      prevStateTxid, newOwnerPubkey, flags, successorBondVout, challengeWindowBlocks,
      recoveryDescriptorHash, signature, fundingInputs, changeOutput, version, locktime,
    } = input;

    if (typeof prevStateTxid !== "string" || !HEX_64_LOWER.test(prevStateTxid)) return null;
    if (typeof newOwnerPubkey !== "string" || !HEX_64_LOWER.test(newOwnerPubkey)) return null;
    if (typeof recoveryDescriptorHash !== "string" || !HEX_64_LOWER.test(recoveryDescriptorHash)) return null;
    if (typeof signature !== "string" || !HEX_128_LOWER.test(signature)) return null;
    if (!isByte(flags)) return null;
    if (!isByte(successorBondVout)) return null;
    if (!isU32(challengeWindowBlocks)) return null;
    if (version !== undefined && !isU32(version)) return null;
    if (locktime !== undefined && !isU32(locktime)) return null;
    if (!Array.isArray(fundingInputs) || fundingInputs.length === 0) return null;

    const inputs: LegacyTransactionInput[] = [];
    for (const fi of fundingInputs) {
      if (fi === null || typeof fi !== "object") return null;
      if (typeof fi.prevoutTxid !== "string" || !HEX_64_LOWER.test(fi.prevoutTxid)) return null;
      if (!isU32(fi.prevoutVout)) return null;
      if (fi.sequence !== undefined && !isU32(fi.sequence)) return null;
      inputs.push({ prevoutTxid: fi.prevoutTxid, prevoutVout: fi.prevoutVout, scriptSigHex: "", sequence: fi.sequence ?? 0xffffffff });
    }

    // vout 0: the RecoverOwner OP_RETURN — the SAME payload the read-side decodes (171 B → PUSHDATA1 carrier).
    const payload = encodeEvent({
      type: EventType.RecoverOwner,
      prevStateTxid, newOwnerPubkey, flags, successorBondVout, challengeWindowBlocks, recoveryDescriptorHash, signature,
    });
    const outputs: LegacyTransactionOutput[] = [{ valueSats: 0n, scriptPubKeyHex: "6a4cab" + bytesToHex(payload) }];

    if (changeOutput !== undefined) {
      if (changeOutput === null || typeof changeOutput !== "object") return null;
      const { valueSats, scriptPubKeyHex } = changeOutput;
      if (typeof valueSats !== "bigint" || valueSats < 0n || valueSats > 0xffff_ffff_ffff_ffffn) return null;
      if (typeof scriptPubKeyHex !== "string" || !HEX_EVEN_LOWER.test(scriptPubKeyHex) || scriptPubKeyHex.startsWith("6a")) return null;
      outputs.push({ valueSats, scriptPubKeyHex });
    }

    return { version: version ?? 1, inputs, outputs, locktime: locktime ?? 0 };
  } catch {
    return null;
  }
}
