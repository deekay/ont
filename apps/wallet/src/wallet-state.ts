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
}

interface WalletStateDocument {
  readonly format: typeof WALLET_STATE_FORMAT;
  readonly version: typeof WALLET_STATE_VERSION;
  readonly network: string;
  readonly names: Record<string, TrackedName>;
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

  private constructor(network: string, names: Map<string, TrackedName>) {
    this.network = network;
    this.names = names;
  }

  /** Load the state file, or start an empty one if it doesn't exist yet. */
  static loadOrCreate(path: string, network: OntNetwork): WalletState {
    if (!existsSync(path)) {
      return new WalletState(network, new Map());
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
    return new WalletState(doc.network ?? network, names);
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

  save(path: string): void {
    const names: Record<string, TrackedName> = {};
    for (const entry of this.list()) {
      names[entry.name] = entry;
    }
    const doc: WalletStateDocument = {
      format: WALLET_STATE_FORMAT,
      version: WALLET_STATE_VERSION,
      network: this.network,
      names
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
