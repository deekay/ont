import { type BitcoinBlock, type BitcoinTransaction } from "@ont/bitcoin";
import { opcodes, script as btcScript, Transaction } from "bitcoinjs-lib";

import {
  OntEventType,
  type RootAnchorEventPayload,
  decodeRootAnchorPayload,
  encodeRootAnchorPayload,
  hexToBytes
} from "@ont/protocol";

import { emptyAccumulatorRoot } from "./accumulator.js";

/**
 * Anchored root chain (signet-prototype C2).
 *
 * A batch's accumulator root is committed to Bitcoin in an OP_RETURN payload, following the same
 * magic+version+type framing as the other ONT events (`protocol/wire.ts`). The anchor commits an
 * explicit `prevRoot -> newRoot` link, so a verifier can reject an anchor built on a stale tip — the
 * stale-root-chaining hazard from R2. `RootChain` is the indexer-side validator that walks anchors
 * in Bitcoin order and rejects invalid transitions; `measureAnchorTxVsize` reports the real on-chain
 * footprint (the ~150 vB assumption in the one-pager, R11).
 *
 * Productionising note: `ROOT_ANCHOR_EVENT_TYPE` should join `OntEventType` + `wire.ts` in
 * `@ont/protocol`; it lives here while C2 is a prototype.
 */

/** The ONT event type for a root anchor (now defined in `@ont/protocol`). */
export const ROOT_ANCHOR_EVENT_TYPE = OntEventType.RootAnchor;

/** Root anchor payload — the codec now lives in `@ont/protocol`; re-exported here for the rail. */
export type RootAnchor = RootAnchorEventPayload;
export { decodeRootAnchorPayload, encodeRootAnchorPayload };

/** Compile the anchor OP_RETURN output script. */
export function rootAnchorOpReturnScript(anchor: RootAnchor): Uint8Array {
  return Uint8Array.from(
    btcScript.compile([opcodes.OP_RETURN, Buffer.from(encodeRootAnchorPayload(anchor))])
  );
}

/** Extract every root anchor committed in a transaction's OP_RETURN outputs. */
export function extractRootAnchors(tx: BitcoinTransaction): RootAnchor[] {
  const anchors: RootAnchor[] = [];
  for (const output of tx.outputs) {
    if (output.scriptType !== "op_return" || output.dataHex === undefined) {
      continue;
    }
    try {
      anchors.push(decodeRootAnchorPayload(hexToBytes(output.dataHex)));
    } catch {
      // Not a root anchor (a payment, a transfer/auction op_return, or malformed) — skip it.
    }
  }
  return anchors;
}

export type AnchorApplyStatus = "applied" | "rejected";

export interface AnchorApplyResult {
  readonly status: AnchorApplyStatus;
  readonly reason: string;
  readonly tip: string;
}

/**
 * Indexer-side validator for the anchored root chain. Walks anchors in Bitcoin order; an anchor is
 * valid only if its `prevRoot` matches the current confirmed tip (and its `newRoot` is well-formed).
 * A stale or forged parent link is rejected and the tip is left unchanged.
 */
export class RootChain {
  private tip: string;
  private height: number;

  public constructor(genesisRoot: string = emptyAccumulatorRoot()) {
    this.tip = assertRoot(genesisRoot, "genesisRoot").toLowerCase();
    this.height = 0;
  }

  public currentTip(): string {
    return this.tip;
  }

  public anchorCount(): number {
    return this.height;
  }

  /**
   * Read anchors back out of a confirmed Bitcoin block and apply them in transaction order — the
   * indexer-side path. Non-anchor outputs (payments, other ONT op_returns) are ignored.
   */
  public applyBlock(block: BitcoinBlock): ReadonlyArray<{
    readonly txid: string;
    readonly txIndex: number;
    readonly anchor: RootAnchor;
    readonly result: AnchorApplyResult;
  }> {
    const applied: Array<{
      readonly txid: string;
      readonly txIndex: number;
      readonly anchor: RootAnchor;
      readonly result: AnchorApplyResult;
    }> = [];
    block.transactions.forEach((tx, txIndex) => {
      for (const anchor of extractRootAnchors(tx)) {
        applied.push({ txid: tx.txid, txIndex, anchor, result: this.apply(anchor) });
      }
    });
    return applied;
  }

  public apply(anchor: RootAnchor): AnchorApplyResult {
    let prevRoot: string;
    let newRoot: string;
    try {
      prevRoot = assertRoot(anchor.prevRoot, "prevRoot").toLowerCase();
      newRoot = assertRoot(anchor.newRoot, "newRoot").toLowerCase();
    } catch {
      return { status: "rejected", reason: "malformed_root", tip: this.tip };
    }
    if (prevRoot !== this.tip) {
      // Built on a stale/forged parent — the R2 stale-root-chaining hazard.
      return { status: "rejected", reason: "stale_or_wrong_prev_root", tip: this.tip };
    }
    if (newRoot === prevRoot) {
      return { status: "rejected", reason: "no_op_transition", tip: this.tip };
    }
    this.tip = newRoot;
    this.height += 1;
    return { status: "applied", reason: "anchored", tip: this.tip };
  }
}

/**
 * Measure the real on-chain virtual size (vBytes) of an anchor transaction: one P2WPKH input, the
 * OP_RETURN anchor output, and one P2WPKH change output. A dummy witness gives an accurate signed
 * vsize without real signing. This is the figure to compare against the one-pager's ~150 vB.
 */
export function measureAnchorTxVsize(payload: Uint8Array): number {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(new Uint8Array(32), 0); // dummy P2WPKH outpoint
  tx.addOutput(
    Uint8Array.from(btcScript.compile([opcodes.OP_RETURN, Buffer.from(payload)])),
    0n
  );
  // P2WPKH change output (OP_0 <20-byte program>).
  tx.addOutput(Uint8Array.from(btcScript.compile([opcodes.OP_0, Buffer.alloc(20, 1)])), 10_000n);
  // Realistic P2WPKH witness: a ~72-byte signature + 33-byte pubkey.
  tx.setWitness(0, [Buffer.alloc(72, 1), Buffer.alloc(33, 2)]);
  return tx.virtualSize();
}

/** Convenience: vBytes of an anchor tx carrying the given anchor. */
export function measureRootAnchorVsize(anchor: RootAnchor): number {
  return measureAnchorTxVsize(encodeRootAnchorPayload(anchor));
}

function assertRoot(value: string, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${label} must be 32-byte hex`);
  }
  return value;
}
