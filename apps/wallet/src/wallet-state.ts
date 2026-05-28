// Local, plaintext record of the names this wallet considers its own.
//
// This is a convenience cache, not an authority. ONT ownership is a fact on
// Bitcoin; this file just remembers which names we've claimed or are tracking
// so the client can list them, follow their destination records, and know what
// to re-arm for recovery. It holds only public material (names, the owner
// pubkey, the on-chain ownership reference), so unlike the keystore it is not
// encrypted. If it's lost, nothing is lost: re-derive it from the resolver.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { normalizeName } from "@ont/protocol";

import type { OntNetwork } from "./keys.js";

export const WALLET_STATE_FORMAT = "ont-wallet-state";
export const WALLET_STATE_VERSION = 1;

export interface TrackedRecovery {
  readonly recoveryAddress: string;
  readonly sequence: number;
  readonly descriptorHash: string;
  readonly challengeWindowBlocks: number;
  readonly armedAt: string;
}

export interface PendingClaim {
  readonly bidTxid: string;
  readonly bidAmountSats: string;
  readonly broadcast: boolean;
  readonly claimedAt: string;
}

/**
 * The publisher-issued inclusion proof for a name claimed via the cheap rail.
 * Stored locally so the wallet can re-emit a portable proof bundle later
 * without needing to ask any publisher again.
 */
export interface BatchInclusion {
  readonly root: string;
  readonly leaf: string;
  readonly value: string;
  readonly siblings: ReadonlyArray<{ readonly level: number; readonly hash: string }>;
  readonly anchorTxid: string;
  readonly anchorHeight: number;
  readonly claimedAt: string;
}

export type CheapClaimStatus = "provisional" | "final" | "contested";

/**
 * Lifecycle of a cheap-rail (batched) claim, per ONT.md's one-path model. A
 * fresh cheap claim is **not** final on the publisher's confirmation: anchoring
 * opens a *notice window*, and the claim only finalizes if no competing claim
 * for the same name lands during it. So the wallet records the claim as
 * `provisional` and only treats it as `final` once it has observed canonical
 * state (via `sync`) accept it after the window closes. A competing claim
 * escalates the name to the bonded auction, which the wallet marks `contested`.
 */
export interface CheapRailClaim {
  readonly status: CheapClaimStatus;
  /** Bitcoin height at which the notice window closes (0 = anchor height not yet known). */
  readonly noticeWindowCloseHeight: number;
  /** Notice-window length in blocks used to derive the close height. */
  readonly noticeWindowBlocks: number;
  readonly recordedAt: string;
  readonly updatedAt: string;
}

/**
 * An in-flight or recently-resolved auction bid. The bond UTXO lives at the
 * funding address as a plain P2WPKH — but spending it before its release is a
 * consensus-level slashing condition, so the wallet must track which bond
 * outpoints are locked and keep auto-fund away from them.
 */
export interface TrackedBid {
  readonly bidTxid: string;
  readonly bondVout: number;
  readonly bondAmountSats: string;
  readonly name: string;
  readonly auctionId: string;
  readonly bidderId: string;
  readonly broadcast: boolean;
  readonly builtAt: string;
  // Reconciled by `sync` against the resolver's visibleBidOutcomes:
  readonly bondStatus?: string;
  readonly bondReleaseBlock?: number | null;
  readonly bondSpendStatus?: string;
  readonly lastSyncedAt?: string;
}

/**
 * Bond statuses where the UTXO must NOT be spent — spending before the bond is
 * released is a consensus-level slashing condition (`spent_before_allowed_release`).
 * Conservatively, an unknown status (no resolver sync yet) also counts as locked.
 */
export function isBidBondLocked(bid: TrackedBid): boolean {
  if (bid.bondStatus === undefined) {
    return true;
  }
  return (
    bid.bondStatus === "leading_locked" ||
    bid.bondStatus === "superseded_locked_until_settlement" ||
    bid.bondStatus === "winner_locked"
  );
}

export interface TrackedName {
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly addedAt: string;
  readonly updatedAt: string;
  readonly lastValueSequence?: number;
  readonly lastValueRecordHash?: string;
  readonly recovery?: TrackedRecovery;
  readonly pendingClaim?: PendingClaim;
  /** Resolver-reported status at the last `sync` (pending|immature|mature|invalid). */
  readonly status?: string;
  readonly lastSyncedAt?: string;
  /** Cheap-rail (batched) inclusion data — for re-emitting an accumulator_batch_claim proof. */
  readonly batchInclusion?: BatchInclusion;
  /** Cheap-rail notice-window lifecycle — provisional until the window closes uncontested. */
  readonly cheapClaim?: CheapRailClaim;
}

interface WalletStateDocument {
  readonly format: typeof WALLET_STATE_FORMAT;
  readonly version: typeof WALLET_STATE_VERSION;
  readonly network: string;
  readonly names: Record<string, TrackedName>;
  readonly bids?: Record<string, TrackedBid>;
}

export class WalletStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletStateError";
  }
}

/**
 * An in-memory view of the wallet-state file. Mutating methods update the view;
 * call save() to persist. Names are keyed by their normalized form so lookups
 * match the resolver and the protocol.
 */
export class WalletState {
  readonly network: string;
  private readonly names: Map<string, TrackedName>;
  private readonly bids: Map<string, TrackedBid>;

  private constructor(network: string, names: Map<string, TrackedName>, bids: Map<string, TrackedBid>) {
    this.network = network;
    this.names = names;
    this.bids = bids;
  }

  /** Load the state file, or start an empty one if it doesn't exist yet. */
  static loadOrCreate(path: string, network: OntNetwork): WalletState {
    if (!existsSync(path)) {
      return new WalletState(network, new Map(), new Map());
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new WalletStateError(
        `could not parse wallet state at ${path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const doc = parsed as Partial<WalletStateDocument>;
    if (doc.format !== WALLET_STATE_FORMAT) {
      throw new WalletStateError(`unexpected wallet state format in ${path} (expected ${WALLET_STATE_FORMAT})`);
    }
    if (doc.version !== WALLET_STATE_VERSION) {
      throw new WalletStateError(`unsupported wallet state version in ${path} (expected ${WALLET_STATE_VERSION})`);
    }

    const names = new Map<string, TrackedName>();
    for (const [key, value] of Object.entries(doc.names ?? {})) {
      names.set(normalizeName(key), value);
    }
    const bids = new Map<string, TrackedBid>();
    for (const [key, value] of Object.entries(doc.bids ?? {})) {
      bids.set(key, value);
    }
    return new WalletState(doc.network ?? network, names, bids);
  }

  /** Tracked names, sorted alphabetically for stable output. */
  list(): readonly TrackedName[] {
    return [...this.names.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): TrackedName | undefined {
    return this.names.get(normalizeName(name));
  }

  has(name: string): boolean {
    return this.names.has(normalizeName(name));
  }

  /**
   * Record (or refresh) a name this wallet owns. Preserves addedAt and any
   * existing value/recovery tracking unless overridden.
   */
  track(input: { name: string; ownerPubkey: string; ownershipRef: string }): TrackedName {
    const key = normalizeName(input.name);
    const now = new Date().toISOString();
    const existing = this.names.get(key);
    const entry: TrackedName = {
      ...existing,
      name: key,
      ownerPubkey: input.ownerPubkey,
      ownershipRef: input.ownershipRef,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now
    };
    this.names.set(key, entry);
    return entry;
  }

  /** Note the latest destination (value) record we published for a name. */
  recordValue(name: string, value: { sequence: number; recordHash: string }): void {
    const entry = this.requireTracked(name);
    this.names.set(entry.name, {
      ...entry,
      lastValueSequence: value.sequence,
      lastValueRecordHash: value.recordHash,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Record a freshly built/broadcast opening-bid claim. The bid txid is the
   * provisional on-chain ownership reference until the claim matures.
   */
  recordPendingClaim(
    input: { name: string; ownerPubkey: string },
    claim: PendingClaim
  ): TrackedName {
    const tracked = this.track({ ...input, ownershipRef: claim.bidTxid });
    const entry: TrackedName = { ...tracked, pendingClaim: claim };
    this.names.set(entry.name, entry);
    return entry;
  }

  /**
   * Reconcile a tracked name against the resolver's confirmed on-chain state:
   * adopt the real ownership ref, record the status, and clear any provisional
   * pending-claim marker (the claim is now reflected on-chain).
   */
  recordSync(name: string, input: { ownershipRef: string; status: string }): void {
    const entry = this.requireTracked(name);
    const { pendingClaim: _pendingClaim, ...rest } = entry;
    this.names.set(entry.name, {
      ...rest,
      ownershipRef: input.ownershipRef,
      status: input.status,
      lastSyncedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Note a publisher-issued accumulator inclusion proof for a cheap-rail
   * claim, so `export-proof` can later re-emit the bundle without re-asking.
   */
  recordBatchInclusion(name: string, inclusion: BatchInclusion): void {
    const entry = this.requireTracked(name);
    this.names.set(entry.name, {
      ...entry,
      batchInclusion: inclusion,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Record (or refresh) the notice-window lifecycle for a cheap-rail claim.
   * Always (re)sets the claim to `provisional` — call `reconcileCheapClaim` to
   * advance it once canonical state is observed. `noticeWindowCloseHeight` of 0
   * means the anchor height wasn't known yet (e.g. freshly broadcast).
   */
  recordCheapClaim(
    name: string,
    input: { noticeWindowCloseHeight: number; noticeWindowBlocks: number }
  ): TrackedName {
    const entry = this.requireTracked(name);
    const now = new Date().toISOString();
    const cheapClaim: CheapRailClaim = {
      status: "provisional",
      noticeWindowCloseHeight: input.noticeWindowCloseHeight,
      noticeWindowBlocks: input.noticeWindowBlocks,
      recordedAt: entry.cheapClaim?.recordedAt ?? now,
      updatedAt: now
    };
    const updated: TrackedName = { ...entry, cheapClaim, updatedAt: now };
    this.names.set(entry.name, updated);
    return updated;
  }

  /**
   * Reconcile a provisional cheap-rail claim against observed canonical state.
   * Returns the resulting status, or `undefined` if the name has no cheap claim.
   *   - `contested === true`              -> contested (escalated to the auction)
   *   - `chainHeight >= closeHeight > 0`  -> final (notice window passed uncontested)
   *   - otherwise                         -> unchanged (window still open / height unknown)
   * Never downgrades a `final`/`contested` claim back to `provisional`.
   */
  reconcileCheapClaim(
    name: string,
    input: { chainHeight: number; contested?: boolean }
  ): CheapClaimStatus | undefined {
    const entry = this.requireTracked(name);
    const current = entry.cheapClaim;
    if (current === undefined) {
      return undefined;
    }
    let status: CheapClaimStatus = current.status;
    if (input.contested === true) {
      status = "contested";
    } else if (current.status === "provisional") {
      if (current.noticeWindowCloseHeight > 0 && input.chainHeight >= current.noticeWindowCloseHeight) {
        status = "final";
      }
    }
    if (status === current.status) {
      return status;
    }
    const now = new Date().toISOString();
    this.names.set(entry.name, {
      ...entry,
      cheapClaim: { ...current, status, updatedAt: now },
      updatedAt: now
    });
    return status;
  }

  /** Note the recovery descriptor we armed for a name. */
  recordRecovery(name: string, recovery: TrackedRecovery): void {
    const entry = this.requireTracked(name);
    this.names.set(entry.name, {
      ...entry,
      recovery,
      updatedAt: new Date().toISOString()
    });
  }

  /** Stop tracking a name locally. Returns true if it was tracked. */
  forget(name: string): boolean {
    return this.names.delete(normalizeName(name));
  }

  /** Tracked bids, newest-built first. */
  listBids(): readonly TrackedBid[] {
    return [...this.bids.values()].sort((a, b) => b.builtAt.localeCompare(a.builtAt));
  }

  getBid(bidTxid: string): TrackedBid | undefined {
    return this.bids.get(bidTxid);
  }

  /** Record (or refresh) an auction bid. Idempotent on the bid txid. */
  recordBid(input: {
    bidTxid: string;
    bondVout: number;
    bondAmountSats: string;
    name: string;
    auctionId: string;
    bidderId: string;
    broadcast: boolean;
  }): TrackedBid {
    const existing = this.bids.get(input.bidTxid);
    const entry: TrackedBid = {
      ...existing,
      bidTxid: input.bidTxid,
      bondVout: input.bondVout,
      bondAmountSats: input.bondAmountSats,
      name: normalizeName(input.name),
      auctionId: input.auctionId,
      bidderId: input.bidderId,
      broadcast: input.broadcast,
      builtAt: existing?.builtAt ?? new Date().toISOString()
    };
    this.bids.set(entry.bidTxid, entry);
    return entry;
  }

  /** Update bond status fields from a resolver sync. */
  recordBidSync(
    bidTxid: string,
    update: { bondStatus: string; bondReleaseBlock: number | null; bondSpendStatus: string }
  ): void {
    const entry = this.bids.get(bidTxid);
    if (entry === undefined) {
      throw new WalletStateError(`bid ${bidTxid} is not tracked by this wallet`);
    }
    this.bids.set(bidTxid, {
      ...entry,
      bondStatus: update.bondStatus,
      bondReleaseBlock: update.bondReleaseBlock,
      bondSpendStatus: update.bondSpendStatus,
      lastSyncedAt: new Date().toISOString()
    });
  }

  /** Stop tracking a bid locally (e.g., after its bond has been spent). */
  forgetBid(bidTxid: string): boolean {
    return this.bids.delete(bidTxid);
  }

  /**
   * Outpoints (txid:vout) of tracked bid bonds the wallet must not auto-spend —
   * locked statuses, plus any unknown-status bid (conservative: sync first).
   */
  lockedBondOutpoints(): ReadonlySet<string> {
    const locked = new Set<string>();
    for (const bid of this.bids.values()) {
      if (isBidBondLocked(bid)) {
        locked.add(`${bid.bidTxid}:${bid.bondVout}`);
      }
    }
    return locked;
  }

  save(path: string): void {
    const names: Record<string, TrackedName> = {};
    for (const entry of this.list()) {
      names[entry.name] = entry;
    }
    const bids: Record<string, TrackedBid> = {};
    for (const entry of this.listBids()) {
      bids[entry.bidTxid] = entry;
    }
    const doc: WalletStateDocument = {
      format: WALLET_STATE_FORMAT,
      version: WALLET_STATE_VERSION,
      network: this.network,
      names,
      ...(Object.keys(bids).length > 0 ? { bids } : {})
    };
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  }

  private requireTracked(name: string): TrackedName {
    const entry = this.names.get(normalizeName(name));
    if (entry === undefined) {
      throw new WalletStateError(`"${normalizeName(name)}" is not tracked by this wallet — track it first`);
    }
    return entry;
  }
}
