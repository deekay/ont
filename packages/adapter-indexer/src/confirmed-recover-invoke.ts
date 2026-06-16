import { type BitcoinHeaderSource, type LegacyTransaction } from "@ont/bitcoin";
import { decodeEvent, EventType } from "@ont/wire";
import type { ConfirmedRecoverOwnerInvoke, UnminedInvokeFields } from "@ont/claim-path";
import { bindTxInclusion, opReturnData, type InclusionRejectReason } from "./inclusion.js";

// B4-INDEX-INVOKE (B4_ADAPTERS_PLAN §9.10) — the recover-owner invoke firewall: bind a candidate
// RecoverOwner invoke tx to the canonical chain (REUSING the shared inclusion firewall) and mint the
// chain-bound ConfirmedRecoverOwnerInvoke the B3 I-REC orchestrator (enforceRecoveryInvoke) consumes. The
// SAME structured tx is decoded (WIRE 0x09 OP_RETURN, PUSHDATA1 carrier for the 171-byte event) and proven
// by Merkle inclusion — txid = legacyTxidOf(invokeTx), no caller-supplied txid / minedHeight / descriptor
// hash. recoveryDescriptorHash + every invokeFields member come from the DECODE only. The adapter decodes +
// BINDS — it does NOT pre-decide authority: a well-formed RecoverOwner with non-invoke flags still mints,
// and the audited enforceRecoveryInvoke rejects it (non-invoke-flags). Total + fail-closed; never throws.

export type ConfirmedRecoverOwnerInvokeRejectReason =
  | "invoke-malformed" // not a tx / no single decodable RecoverOwner OP_RETURN / wrong-type / bad payload
  | "invoke-noncanonical-header" // headerSource has no/other header at minedHeight (null/throw caught)
  | "invoke-not-included"; // merkle recompute != the block header's committed root

export interface BuildConfirmedRecoverOwnerInvokeInput {
  /** UNTRUSTED — the structured invoke tx (the SAME tx decoded AND proven by Merkle inclusion). */
  readonly invokeTx: LegacyTransaction;
  /** UNTRUSTED — the block's 80-byte header (display hex). */
  readonly blockHeaderHex: string;
  /** UNTRUSTED — the claimed mined height. */
  readonly minedHeight: number;
  /** UNTRUSTED — the Merkle sibling path (display hex, esplora order). */
  readonly merkle: readonly string[];
  /** UNTRUSTED — the tx index within the block (Merkle path direction). */
  readonly pos: number;
  /** TRUSTED — the canonical header source validated by B4-HEADER. */
  readonly headerSource: BitcoinHeaderSource;
  /** Optional explicit OP_RETURN output index; absent → the exactly-one-decodable-RecoverOwner rule. */
  readonly invokeVout?: number;
}

export type ConfirmedRecoverOwnerInvokeResult =
  | { readonly ok: true; readonly confirmedInvoke: ConfirmedRecoverOwnerInvoke }
  | { readonly ok: false; readonly reason: ConfirmedRecoverOwnerInvokeRejectReason };

/**
 * GREEN contract (B4-INDEX-INVOKE):
 *   1. payload   selectRecoverOwner: decode RecoverOwner (WIRE 0x09) from the OP_RETURN — with invokeVout an
 *                integer in [0, outputs.length) decoding ONLY that output (no fallback); else EXACTLY ONE
 *                decodable RecoverOwner (0 or >1 → "invoke-malformed", no first-match). wrong-type / missing
 *                / bad payload → "invoke-malformed".
 *   2. bind      bindTxInclusion (shared): height-guard (before headerSource) → legacyTxidOf → header-
 *                canonicality → merkle-inclusion → proven txid; generic reason mapped to "invoke-*".
 *   3. mint      confirmedInvoke { txid: bound.txid, minedHeight, recoveryDescriptorHash:
 *                decoded.recoveryDescriptorHash, invokeFields: { prevStateTxid, newOwnerPubkey, flags,
 *                successorBondVout, challengeWindowBlocks, recoveryDescriptorHash, signature } } — DECODE only.
 * The adapter does NOT judge flags / authority — enforceRecoveryInvoke owns that. Total + fail-closed;
 * never throws.
 */
export function buildConfirmedRecoverOwnerInvoke(
  input: BuildConfirmedRecoverOwnerInvokeInput,
): ConfirmedRecoverOwnerInvokeResult {
  try {
    if (input === null || typeof input !== "object") return { ok: false, reason: "invoke-malformed" };
    const { invokeTx, blockHeaderHex, minedHeight, merkle, pos, headerSource, invokeVout } = input;

    // 1. payload — the decoded RecoverOwner (no caller side-channel). invokeVout is no-fallback.
    const decoded = selectRecoverOwner(invokeTx, invokeVout);
    if (decoded === null) return { ok: false, reason: "invoke-malformed" };

    // 2. chain bind — the SHARED inclusion firewall (height → txid → header-canonicality → merkle-inclusion).
    const bound = bindTxInclusion({ tx: invokeTx, blockHeaderHex, minedHeight, merkle, pos, headerSource });
    if (!bound.ok) return { ok: false, reason: mapInclusionReason(bound.reason) };

    // 3. mint — chain-bound invoke fact; recoveryDescriptorHash + invokeFields from the DECODE only.
    return {
      ok: true,
      confirmedInvoke: {
        txid: bound.txid,
        minedHeight,
        recoveryDescriptorHash: decoded.recoveryDescriptorHash,
        invokeFields: decoded,
      },
    };
  } catch {
    return { ok: false, reason: "invoke-malformed" };
  }
}

function mapInclusionReason(reason: InclusionRejectReason): ConfirmedRecoverOwnerInvokeRejectReason {
  return reason === "tx-malformed"
    ? "invoke-malformed"
    : reason === "noncanonical-header"
      ? "invoke-noncanonical-header"
      : "invoke-not-included";
}

/** Decode the candidate output's OP_RETURN as a RecoverOwner (invokeFields), or null. decodeEvent throws → caught. */
function decodeRecoverOwnerAt(tx: LegacyTransaction, vout: number): UnminedInvokeFields | null {
  const output = tx.outputs[vout];
  if (output === undefined) return null;
  const data = opReturnData(output.scriptPubKeyHex);
  if (data === null) return null;
  let event: ReturnType<typeof decodeEvent>;
  try {
    event = decodeEvent(data);
  } catch {
    return null;
  }
  if (event.type !== EventType.RecoverOwner) return null;
  return {
    prevStateTxid: event.prevStateTxid,
    newOwnerPubkey: event.newOwnerPubkey,
    flags: event.flags,
    successorBondVout: event.successorBondVout,
    challengeWindowBlocks: event.challengeWindowBlocks,
    recoveryDescriptorHash: event.recoveryDescriptorHash,
    signature: event.signature,
  };
}

/**
 * Select the RecoverOwner to mint from. With an explicit `invokeVout` it must be an integer in
 * [0, outputs.length) decoding to a RecoverOwner — NO fallback to other outputs. Otherwise EXACTLY ONE
 * output must decode to a RecoverOwner (0 or >1 → null, no silent first-match).
 */
function selectRecoverOwner(tx: LegacyTransaction, invokeVout: number | undefined): UnminedInvokeFields | null {
  if (tx === null || typeof tx !== "object" || !Array.isArray(tx.outputs)) return null;
  if (invokeVout !== undefined) {
    if (!Number.isInteger(invokeVout) || invokeVout < 0 || invokeVout >= tx.outputs.length) return null;
    return decodeRecoverOwnerAt(tx, invokeVout);
  }
  let found: UnminedInvokeFields | null = null;
  for (let i = 0; i < tx.outputs.length; i += 1) {
    const candidate = decodeRecoverOwnerAt(tx, i);
    if (candidate === null) continue;
    if (found !== null) return null; // more than one decodable RecoverOwner → ambiguous, no first-match
    found = candidate;
  }
  return found;
}
