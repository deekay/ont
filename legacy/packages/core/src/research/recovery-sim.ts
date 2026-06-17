/**
 * Recovery prototype — break-glass recovery for UTXO-less names.
 *
 * `docs/research/archive/ONT_LONG_TAIL_RECOVERY.md` proposes recovery that works for names with no on-chain
 * footprint (the long tail, and any name after its bond matures): the owner *arms* a backup recovery
 * set off-chain; *invoking* recovery opens a Bitcoin-timed challenge window; the owner's main key can
 * *veto* within the window; otherwise it *finalizes* to a new key. Sovereignty is preserved because
 * the name can only ever move via the owner's own pre-committed arrangement, vetoable by the owner.
 *
 * This module models the state machine and its authorization, not real Bitcoin transactions.
 * "Authorization by key K" is represented by the caller supplying K — so an actor can only produce
 * actions for keys it holds. That makes the security assertions real: a thief who holds the recovery
 * wallet but not the main key simply cannot produce a veto, and vice versa.
 */

export interface RecoveryDescriptor {
  /** Backup wallet pubkeys (a k-of-n set; n = 1 for a single backup). */
  readonly recoverySet: readonly string[];
  /** k — how many of the set must authorize an invoke. */
  readonly threshold: number;
  readonly challengeWindowBlocks: number;
  /** Increments each time the owner re-arms, invalidating prior descriptors. */
  readonly sequence: number;
}

export interface PendingRecovery {
  readonly proposedOwnerPubkey: string;
  readonly requestedHeight: number;
  readonly finalizeHeight: number;
  readonly descriptorSequence: number;
}

export interface RecoverableName {
  readonly name: string;
  readonly ownerPubkey: string;
  /** The armed recovery arrangement, or null if recovery is not armed. */
  readonly descriptor: RecoveryDescriptor | null;
  readonly pendingRecovery: PendingRecovery | null;
}

export type ActionStatus = "applied" | "rejected";

export interface ActionResult {
  readonly status: ActionStatus;
  readonly reason: string;
  /** The resulting record (unchanged on rejection). */
  readonly record: RecoverableName;
}

export function createName(name: string, ownerPubkey: string): RecoverableName {
  return { name, ownerPubkey, descriptor: null, pendingRecovery: null };
}

function ok(record: RecoverableName, reason: string): ActionResult {
  return { status: "applied", reason, record };
}

function no(record: RecoverableName, reason: string): ActionResult {
  return { status: "rejected", reason, record };
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Owner arms or re-arms (rotates) the recovery descriptor. Owner-authorized only. */
export function armRecovery(
  record: RecoverableName,
  input: {
    readonly signedBy: string;
    readonly recoverySet: readonly string[];
    readonly threshold: number;
    readonly challengeWindowBlocks: number;
  }
): ActionResult {
  if (input.signedBy !== record.ownerPubkey) {
    return no(record, "arm_not_owner");
  }
  if (record.pendingRecovery !== null) {
    return no(record, "arm_while_pending");
  }
  const set = distinct(input.recoverySet);
  if (set.length === 0 || set.length !== input.recoverySet.length) {
    return no(record, "arm_invalid_recovery_set");
  }
  if (!Number.isInteger(input.threshold) || input.threshold < 1 || input.threshold > set.length) {
    return no(record, "arm_invalid_threshold");
  }
  if (!Number.isInteger(input.challengeWindowBlocks) || input.challengeWindowBlocks < 1) {
    return no(record, "arm_invalid_window");
  }

  return ok(
    {
      ...record,
      descriptor: {
        recoverySet: set,
        threshold: input.threshold,
        challengeWindowBlocks: input.challengeWindowBlocks,
        sequence: (record.descriptor?.sequence ?? 0) + 1
      }
    },
    "recovery_armed"
  );
}

/**
 * Transfer to a new owner. Owner-authorized only. **Resets the recovery arming** — otherwise the
 * seller's backup wallet could "recover" (steal) a name they already sold. This is the sharpest
 * correctness rule in the design.
 */
export function transferName(
  record: RecoverableName,
  input: { readonly signedBy: string; readonly newOwnerPubkey: string }
): ActionResult {
  if (input.signedBy !== record.ownerPubkey) {
    return no(record, "transfer_not_owner");
  }
  if (input.newOwnerPubkey.length === 0) {
    return no(record, "transfer_invalid_new_owner");
  }

  return ok(
    {
      name: record.name,
      ownerPubkey: input.newOwnerPubkey,
      descriptor: null, // new owner must re-arm
      pendingRecovery: null
    },
    "transfer_applied"
  );
}

/** Invoke recovery: the backup set proposes a new owner key, opening the challenge window. */
export function invokeRecovery(
  record: RecoverableName,
  input: {
    readonly signedBy: readonly string[];
    readonly proposedOwnerPubkey: string;
    readonly height: number;
  }
): ActionResult {
  if (record.descriptor === null) {
    return no(record, "recovery_not_armed");
  }
  if (record.pendingRecovery !== null) {
    return no(record, "recovery_already_pending");
  }
  if (input.proposedOwnerPubkey.length === 0) {
    return no(record, "recovery_invalid_proposed_owner");
  }

  const authorizing = distinct(input.signedBy).filter((key) =>
    record.descriptor?.recoverySet.includes(key)
  );
  if (authorizing.length < record.descriptor.threshold) {
    return no(record, "recovery_threshold_not_met");
  }

  return ok(
    {
      ...record,
      pendingRecovery: {
        proposedOwnerPubkey: input.proposedOwnerPubkey,
        requestedHeight: input.height,
        finalizeHeight: input.height + record.descriptor.challengeWindowBlocks,
        descriptorSequence: record.descriptor.sequence
      }
    },
    "recovery_requested"
  );
}

/** Veto a pending recovery. Main-key-authorized only, and only before the window closes. */
export function vetoRecovery(
  record: RecoverableName,
  input: { readonly signedBy: string; readonly height: number }
): ActionResult {
  if (record.pendingRecovery === null) {
    return no(record, "veto_nothing_pending");
  }
  if (input.signedBy !== record.ownerPubkey) {
    return no(record, "veto_not_owner");
  }
  if (input.height >= record.pendingRecovery.finalizeHeight) {
    return no(record, "veto_too_late");
  }

  return ok({ ...record, pendingRecovery: null }, "recovery_vetoed");
}

/**
 * Finalize a pending recovery once the window has passed un-vetoed. Permissionless (anyone can
 * trigger the deterministic finalize); a veto would have cleared `pendingRecovery` already. The
 * recovered name's arming is reset so the new owner re-arms with their own keys.
 */
export function finalizeRecovery(
  record: RecoverableName,
  input: { readonly height: number }
): ActionResult {
  if (record.pendingRecovery === null) {
    return no(record, "finalize_nothing_pending");
  }
  if (input.height < record.pendingRecovery.finalizeHeight) {
    return no(record, "finalize_too_early");
  }

  return ok(
    {
      name: record.name,
      ownerPubkey: record.pendingRecovery.proposedOwnerPubkey,
      descriptor: null, // new owner must re-arm
      pendingRecovery: null
    },
    "recovery_finalized"
  );
}
