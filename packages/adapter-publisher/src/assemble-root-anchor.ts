import { type LegacyTransaction } from "@ont/bitcoin";
import { encodeEvent, EventType } from "@ont/wire";

// B4-PUB-ANCHOR (B4_ADAPTERS_PLAN §11.1) — the publisher write-side: assemble the unsigned RootAnchor tx
// the publisher broadcasts to anchor a batch. A write-side adapter validates NO untrusted input — its bar
// is the WRITE→READ round-trip: the assembled tx, dropped into a block, is ACCEPTED by the audited read-side
// buildConfirmedBatchAnchor (B4-INDEX-ANCHOR). Pure + deterministic; signing / PSBT / broadcast are the I/O
// edge (B4-PUB-BROADCAST) or B5 wallet-handoff. The vout-0 OP_RETURN carries the SAME encodeEvent(RootAnchor
// 0x0b) the read-side decodes, so write/read agree by construction.

const HEX_64_LOWER = /^[0-9a-f]{64}$/;
const HEX_EVEN = /^(?:[0-9a-fA-F]{2})*$/;
const U32_MAX = 0xffff_ffff;
const isU32 = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= U32_MAX;

/** One funding UTXO the operator spends to fund the anchor tx. `scriptSig` is empty (signing is wallet-handoff). */
export interface RootAnchorFundingInput {
  readonly prevoutTxid: string;
  readonly prevoutVout: number;
  /** Optional; defaults to 0xffffffff. */
  readonly sequence?: number;
}

export interface AssembleRootAnchorInput {
  /** R_{h-K}: the base root this batch's delta applies onto (#53), 32-byte lowercase hex. */
  readonly prevRoot: string;
  /** newRoot: the root the anchor commits, 32-byte lowercase hex. */
  readonly newRoot: string;
  /** The committed leaf count (u32). */
  readonly batchSize: number;
  /** The operator's funding UTXOs (non-empty). */
  readonly fundingInputs: readonly RootAnchorFundingInput[];
  /** Optional change output; its scriptPubKey MUST NOT be an OP_RETURN (no ambiguous second RootAnchor). */
  readonly changeOutput?: { readonly valueSats: bigint; readonly scriptPubKeyHex: string };
  readonly version?: number;
  readonly locktime?: number;
}

/**
 * GREEN contract (B4-PUB-ANCHOR):
 *   validate prevRoot/newRoot HEX_64_LOWER (uppercase → null); batchSize u32; fundingInputs a non-empty
 *   array of { prevoutTxid HEX_64_LOWER, prevoutVout u32, sequence? u32 default 0xffffffff }; build inputs
 *   with scriptSigHex "" (unsigned). payload = encodeEvent({type:RootAnchor, prevRoot, newRoot, batchSize})
 *   (73 B); vout-0 = { valueSats: 0n, scriptPubKeyHex: "6a49" + payloadHex } (minimal direct push). If a
 *   changeOutput is given: valueSats bigint ≥ 0, scriptPubKeyHex LOWERCASE even hex (the serializer is
 *   lowercase-only — uppercase would make legacyTxidOf null) NOT starting with 0x6a (OP_RETURN) — else null;
 *   append it after vout 0. `version`/`locktime`, if provided, must be u32 (non-u32 → null); default 1 / 0.
 *   Return { version, inputs, outputs, locktime }. Does not mutate caller arrays. The contract is "a
 *   serializable LegacyTransaction (legacyTxidOf non-null) or null" — never a maybe-malformed tx. Never throws.
 *
 * STUB (B4-PUB-ANCHOR, tests-first): returns null so the pub-anchor.* red battery fails until implemented.
 */
export function assembleRootAnchorTx(_input: AssembleRootAnchorInput): LegacyTransaction | null {
  void encodeEvent;
  void EventType;
  void HEX_64_LOWER;
  void HEX_EVEN;
  void isU32;
  return null;
}
