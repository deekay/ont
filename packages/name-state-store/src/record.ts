// @ont/name-state-store — the durable enforced name-state record + store contract (live-enforcement LE-INDEX).
//
// The per-name state an ACCEPTED batched claim produces (docs/core/LIVE_ENFORCEMENT_PLAN.md §2a). SHARED
// infrastructure: the indexer writes (put) one record per accepted name; the resolver reads (getByName) — no
// app->app edge, mirroring @ont/anchor-store. Persistence only: NO consensus/firewall logic. The live loop
// decides (enforceBatchedClaim accepts) and sources every field from the VERIFIED committed-entry seam +
// accepted served/root facts (NOT claim-path's synthetic completeness projection); this package only stores.

/** The owner identity under current B3: value === ownerPubkey, the 32-byte lowercase-hex owner public key. */
export interface NameStateOwner {
  readonly kind: "owner-key";
  readonly ownerPubkeyHex: string;
}

/** The accepted anchor's Bitcoin coordinates. `vout` is preserved from the inclusion candidate / firewall side
 *  (NOT inferred: ConfirmedBatchAnchor carries no vout and claim-path hard-codes vout:0). */
export interface NameStateAnchorCoords {
  readonly txid: string;
  readonly minedHeight: number;
  readonly txIndex: number;
  readonly vout: number;
}

/** One step of the accepted enforcement verdict path (the accepted BatchedClaimResult.trace mapped to this
 *  store-local shape — decoupled from claim-path's internal type; the loop does the mapping). `evidence` mirrors
 *  ClaimTraceEntry.evidence: a flat summary record (digest/root/count), constrained to string|number — never raw
 *  bytes — so it stays JSON-safe on disk. */
export interface NameStateTraceStep {
  readonly step: string;
  readonly ok: boolean;
  readonly reason: string;
  readonly evidence?: Readonly<Record<string, string | number>>;
}

export type NameStateJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly NameStateJsonValue[]
  | { readonly [key: string]: NameStateJsonValue };

export type NameStateProofBundle = { readonly [key: string]: NameStateJsonValue };

/** The per-name state record (LIVE_ENFORCEMENT_PLAN §2a). Keyed by `canonicalName`. */
export interface NameStateRecord {
  /** The store key. Reject-don't-normalize upstream (W3 / isCanonicalName) — the store never case-folds. */
  readonly canonicalName: string;
  /** The committed leaf key: sha256Hex(utf8ToBytes(canonicalName)). */
  readonly leafKeyHex: string;
  readonly owner: NameStateOwner;
  /** The name's index within its accepted batch. */
  readonly batchLocalIndex: number;
  readonly anchoredRoot: string;
  readonly anchor: NameStateAnchorCoords;
  readonly firstServableHeight: number;
  /** The accepted enforcement verdict path, for LE-RESOLVE evidence. */
  readonly trace: readonly NameStateTraceStep[];
  /** The indexer-emitted proof bundle clients verify against Bitcoin before treating this mirror as verified. */
  readonly proofBundle: NameStateProofBundle;
}

/** Persistence port — the indexer writes (put) per accepted name; the resolver reads (getByName). The read
 *  accessor mints/mutates nothing — the resolver serves these indexer-produced enforced facts, never confirms. */
export interface NameStateStore {
  has(canonicalName: string): Promise<boolean>;
  put(record: NameStateRecord): Promise<void>;
  /** Write a batch ATOMICALLY — all records land durably or NONE do (one temp+rename + one publish). The
   *  accept of a batched claim writes ALL its committed entries, so a mid-batch persistence failure must not
   *  leave partial name-state; the caller lets a throw propagate so the indexer cursor is not advanced (retry). */
  putMany(records: readonly NameStateRecord[]): Promise<void>;
  getByName(canonicalName: string): Promise<NameStateRecord | null>;
}
