// B5-WEB (clean explorer) — the narrow read-port the web renders from. It returns the B4 adapter PROJECTION
// INPUTS (the resolver's served ownership interval + records/descriptors for a name); the render path calls
// projectServedValueHistory / projectServedRecoveryHistory. No web-specific resolver model is invented. The web
// reads ONE resolver's served state — it does NOT fan out across resolvers or pick canonical by longest chain
// (the MR1 carry-forward); selection/fetch is an out-of-scope edge concern. null = the name is not served.
import type { OwnershipInterval } from "@ont/adapter-resolver";
import type { SignedValueRecord, SignedRecoveryDescriptor } from "@ont/protocol";

export interface ServedValueState {
  readonly currentOwnership: OwnershipInterval | null;
  readonly records: readonly SignedValueRecord[];
}

export interface ServedRecoveryState {
  readonly currentOwnership: OwnershipInterval | null;
  readonly descriptors: readonly SignedRecoveryDescriptor[];
}

/** A minimal web-local view of a served Bitcoin transaction (display subset). carrierPayloadHex is the OP_RETURN
 *  ONT-event payload already extracted by the indexer — the web decodes it via @ont/wire, never scanning scripts. */
export interface ServedTxOutput {
  readonly valueSats: string;
  readonly scriptHex: string;
  readonly address: string | null;
}
export interface ServedTx {
  readonly txid: string;
  readonly blockHash: string | null;
  readonly blockHeight: number | null;
  readonly outputs: readonly ServedTxOutput[];
  readonly carrierPayloadHex: string | null;
}

export interface WebReadPort {
  valueHistory(name: string): ServedValueState | null;
  recoveryHistory(name: string): ServedRecoveryState | null;
  tx(txid: string): ServedTx | null;
}
