import type { ServedValueHistoryResult, ServedRecoveryHistoryResult } from "@ont/adapter-resolver";

// B5-CLI (B5_CLI_CLASSIFICATION.md) — the read I/O seam. The clean CLI is a thin orchestrator: it shapes a
// query, fetches via this injected port, and renders the result. Production dispatches resolver-vs-chain
// behind this edge (HTTP to the resolver / esplora / indexer); tests mock it hermetically (no live network).
// The resolver-history reads return the resolver's read PROJECTION result, which carries its
// not-ownership-authority / resolver-indexed-mirror stamps; the tx read returns chain display, which is
// provenance only and NEVER ownership authority.

/** The CLI's display contract for a chain tx read (provenance/display, NOT ownership authority). */
export interface CliTxRead {
  readonly txid: string;
  readonly confirmations: number | null;
  readonly blockHeight: number | null;
  readonly rawHex: string | null;
}

// The 5 single/activity reads (get-name, get-value, get-recovery-descriptor, get-name-activity, list-activity)
// have no B4 read projection (lean ii): the CLI displays the resolver's RAW served JSON under a stamped
// envelope. The `data` is OPAQUE to the CLI (resolver HTTP shape; never typed/interpreted here); the envelope
// is what stamps it as resolver convenience, NOT authority.
export interface ResolverRawRead {
  readonly provenance: "resolver-indexed-mirror";
  readonly authority: "not-ownership-authority";
  readonly data: unknown;
}

/** Discriminated raw-read query — PRODUCED BY SHAPING, never a caller-supplied endpoint string. */
export type ResolverRawQuery =
  | { readonly command: "get-name"; readonly name: string }
  | { readonly command: "get-value"; readonly name: string }
  | { readonly command: "get-recovery-descriptor"; readonly name: string }
  | { readonly command: "get-name-activity"; readonly name: string }
  | { readonly command: "list-activity" };

export interface CliReadPort {
  /** Resolver value-history read (B4-RESOLVE-READ projection; carries the resolver's stamps). null = not found. */
  fetchValueHistory(name: string): Promise<ServedValueHistoryResult | null>;
  /** Resolver recovery-descriptor-history read (B4-RESOLVE-READ-RECOVERY projection; carries stamps). */
  fetchRecoveryDescriptorHistory(name: string): Promise<ServedRecoveryHistoryResult | null>;
  /** Chain tx read (provenance/display, not authority). null = not found. */
  fetchTx(txid: string): Promise<CliTxRead | null>;
  /** Raw resolver read for the single/activity commands — stamped envelope, opaque data. null = not found. */
  fetchResolverRaw(query: ResolverRawQuery): Promise<ResolverRawRead | null>;
}
