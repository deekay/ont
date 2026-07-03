// B5-WEB (clean explorer) — the narrow read-port the web renders from. It returns the B4 adapter PROJECTION
// INPUTS (the resolver's served ownership interval + records/descriptors for a name); the render path calls
// projectServedValueHistory / projectServedRecoveryHistory. No web-specific resolver model is invented. The web
// reads ONE resolver's served state — it does NOT fan out across resolvers or pick canonical by longest chain
// (the MR1 carry-forward); selection/fetch is an out-of-scope edge concern. null = the name is not served.
import type { OwnershipInterval, ServedNameStateResult, ServedTx, ServedTxOutput } from "@ont/adapter-resolver";
import type { SignedValueRecord, SignedRecoveryDescriptor } from "@ont/protocol";

// The served-tx contract is owned by @ont/adapter-resolver (G2 slice 4a); re-export it for web consumers.
export type { ServedTx, ServedTxOutput };
export type { ServedNameStateResult };

export interface ServedValueState {
  readonly currentOwnership: OwnershipInterval | null;
  readonly records: readonly SignedValueRecord[];
}

export interface ServedRecoveryState {
  readonly currentOwnership: OwnershipInterval | null;
  readonly descriptors: readonly SignedRecoveryDescriptor[];
}

export interface WebReadPort {
  valueHistory(name: string): ServedValueState | null;
  recoveryHistory(name: string): ServedRecoveryState | null;
  /** Optional request-scoped served enforced state from /names/:name/state; null = no served proof bundle. */
  nameState?(name: string): ServedNameStateResult | null;
  tx(txid: string): ServedTx | null;
}
