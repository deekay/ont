// Publish a recovery descriptor for a name this wallet owns.
//
// Designates a recovery wallet (address) that can recover the name through the
// challenge window — ONT's protocol-native recovery path, distinct from backing
// up the key blob. Mirrors value-write.ts: refuses to sign unless this wallet is
// the resolver's current owner, chains onto the live head, signs locally, and
// publishes; the resolver re-checks everything before recording.
import { ApiError } from "../api/client";
import { resolver } from "../api/resolver";
import type { RecoveryDescriptor } from "../api/types";
import { accumulatorKeyForName, normalizeName } from "./accumulator";
import {
  computeRecoveryDescriptorHash,
  signRecoveryDescriptor,
  verifyRecoveryDescriptor,
  type SignedRecoveryDescriptor,
} from "./recovery-descriptor";
import { deriveOwnerPubkey } from "./value-record";

export interface PublishRecoveryInput {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly recoveryAddress: string;
}

export interface PublishRecoveryResult {
  readonly name: string;
  readonly sequence: number;
  readonly descriptorHash: string;
  readonly ownershipRef: string;
  readonly recoveryAddress: string;
  /** True when the descriptor was signed but not published (demo mode). */
  readonly simulated: boolean;
  readonly descriptor: SignedRecoveryDescriptor;
}

export interface RecoveryState {
  readonly name: string;
  readonly status: string;
  readonly currentOwnerPubkey: string | null;
  readonly ownershipRef: string | null;
  readonly currentSequence: number | null;
  readonly currentRecoveryAddress: string | null;
  readonly nextSequence: number;
}

/** Demo-only: sign a recovery descriptor in the demo sandbox (synthetic ref, no resolver). */
export function signRecoveryForDemo(input: {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly recoveryAddress: string;
  readonly sequence: number;
}): PublishRecoveryResult {
  const name = normalizeName(input.name);
  const ownershipRef = accumulatorKeyForName(name);
  const signed = signRecoveryDescriptor({
    name,
    ownerPrivateKeyHex: input.ownerPrivateKeyHex,
    ownershipRef,
    sequence: input.sequence,
    previousDescriptorHash: null,
    recoveryAddress: input.recoveryAddress.trim(),
  });
  if (!verifyRecoveryDescriptor(signed)) {
    throw new Error("Local signature self-check failed.");
  }
  return {
    name,
    sequence: input.sequence,
    descriptorHash: computeRecoveryDescriptorHash(signed),
    ownershipRef,
    recoveryAddress: signed.recoveryAddress,
    simulated: true,
    descriptor: signed,
  };
}

async function currentDescriptor(name: string): Promise<RecoveryDescriptor | null> {
  try {
    return await resolver.recovery(name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** The resolver's current view of a name's ownership + recovery chain. */
export async function readRecoveryState(rawName: string): Promise<RecoveryState | null> {
  const name = normalizeName(rawName);
  if (!name) {
    return null;
  }
  let record;
  try {
    record = await resolver.name(name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
  if (!record || record.status === "invalid") {
    return null;
  }
  const head = await currentDescriptor(name);
  return {
    name,
    status: record.status,
    currentOwnerPubkey: record.currentOwnerPubkey ?? null,
    ownershipRef: record.lastStateTxid ?? null,
    currentSequence: head === null ? null : head.sequence,
    currentRecoveryAddress: head?.recoveryAddress ?? null,
    nextSequence: head === null ? 1 : head.sequence + 1,
  };
}

/** Sign and publish the next recovery descriptor for `name`. */
export async function publishNameRecovery(
  input: PublishRecoveryInput,
  opts: { simulate?: boolean } = {},
): Promise<PublishRecoveryResult> {
  const name = normalizeName(input.name);
  if (!name) {
    throw new Error("Enter a name to set recovery for.");
  }
  const recoveryAddress = input.recoveryAddress.trim();
  if (!recoveryAddress) {
    throw new Error("Enter a recovery address.");
  }
  const ownerPubkey = deriveOwnerPubkey(input.ownerPrivateKeyHex).toLowerCase();

  let record;
  try {
    record = await resolver.name(name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(`The resolver doesn't know "${name}" yet — it has to be claimed first.`);
    }
    throw error;
  }
  if (!record || record.status === "invalid") {
    throw new Error(`"${name}" is not a claimable, owned name.`);
  }
  if ((record.currentOwnerPubkey ?? "").toLowerCase() !== ownerPubkey) {
    throw new Error(`This wallet doesn't own "${name}".`);
  }
  const ownershipRef = record.lastStateTxid;
  if (!ownershipRef) {
    throw new Error(`No ownership reference is published for "${name}" yet.`);
  }

  const head = await currentDescriptor(name);
  const sequence = head === null ? 1 : head.sequence + 1;
  const previousDescriptorHash = head === null ? null : head.descriptorHash;

  const signed = signRecoveryDescriptor({
    name,
    ownerPrivateKeyHex: input.ownerPrivateKeyHex,
    ownershipRef,
    sequence,
    previousDescriptorHash,
    recoveryAddress,
  });

  if (!verifyRecoveryDescriptor(signed)) {
    throw new Error("Local signature self-check failed — refusing to publish.");
  }

  // Demo mode signs but does not publish; live mode POSTs and the resolver
  // re-verifies everything before accepting (201).
  if (opts.simulate) {
    return {
      name,
      sequence,
      descriptorHash: computeRecoveryDescriptorHash(signed),
      ownershipRef,
      recoveryAddress: signed.recoveryAddress,
      simulated: true,
      descriptor: signed,
    };
  }
  const response = await resolver.publishRecovery(signed);
  return {
    name,
    sequence: response.sequence,
    descriptorHash: response.descriptorHash,
    ownershipRef: response.ownershipRef,
    recoveryAddress: response.recoveryAddress,
    simulated: false,
    descriptor: signed,
  };
}
