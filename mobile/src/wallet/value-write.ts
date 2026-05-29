// Publish a value record for a name this wallet owns.
//
// This is the owner-key WRITE path: it fetches the resolver's current view of
// the name, refuses to sign unless this wallet is the current owner, derives the
// next sequence + predecessor hash from the live chain head, signs locally
// (BIP340 Schnorr, see value-record.ts), self-verifies, and POSTs the signed
// record. The resolver independently re-checks the signature, owner, ownershipRef,
// and exact-next sequence — this client never assumes the resolver's word for
// anything it can verify itself.
import { ApiError } from "../api/client";
import { resolver } from "../api/resolver";
import type { ValueRecord } from "../api/types";
import { accumulatorKeyForName, normalizeName } from "./accumulator";
import {
  computeValueRecordHash,
  deriveOwnerPubkey,
  signValueRecord,
  verifyValueRecord,
  type SignedValueRecord,
} from "./value-record";

export interface PublishValueInput {
  /** The name to publish a value for. Normalized before use. */
  readonly name: string;
  /** Owner private key (32-byte hex) — must control the name's current owner pubkey. */
  readonly ownerPrivateKeyHex: string;
  /** Value type byte (0–255). Convention: 2 = URL. */
  readonly valueType: number;
  /** UTF-8 value (e.g. a URL). Encoded to the record's payload bytes. */
  readonly payloadUtf8: string;
}

export interface PublishValueResult {
  readonly name: string;
  readonly sequence: number;
  readonly recordHash: string;
  readonly ownershipRef: string;
  readonly valueType: number;
  readonly payloadHex: string;
  /** True when the record was signed but not published (demo mode). */
  readonly simulated: boolean;
  /** The fully-signed record (for display / local tracking). */
  readonly record: SignedValueRecord;
}

const encoder = new TextEncoder();

function utf8ToHex(value: string): string {
  return Array.from(encoder.encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Demo-only: sign a value record for a name "claimed" in the demo sandbox, with a
 * deterministic synthetic ownership ref (no resolver). Real BIP340 signature over
 * synthetic fields — exercises the signing core without any live write.
 */
export function signValueForDemo(input: {
  readonly name: string;
  readonly ownerPrivateKeyHex: string;
  readonly valueType: number;
  readonly payloadUtf8: string;
  readonly sequence: number;
}): PublishValueResult {
  const name = normalizeName(input.name);
  const ownershipRef = accumulatorKeyForName(name);
  const signed = signValueRecord({
    name,
    ownerPrivateKeyHex: input.ownerPrivateKeyHex,
    ownershipRef,
    sequence: input.sequence,
    previousRecordHash: null,
    valueType: input.valueType,
    payloadHex: utf8ToHex(input.payloadUtf8),
  });
  if (!verifyValueRecord(signed)) {
    throw new Error("Local signature self-check failed.");
  }
  return {
    name,
    sequence: input.sequence,
    recordHash: computeValueRecordHash(signed),
    ownershipRef,
    valueType: signed.valueType,
    payloadHex: signed.payloadHex,
    simulated: true,
    record: signed,
  };
}

/** Fetch the current value record, treating "no record yet" (404) as null. */
async function currentValue(name: string): Promise<ValueRecord | null> {
  try {
    return await resolver.value(name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export interface ValueState {
  readonly name: string;
  readonly status: string;
  readonly currentOwnerPubkey: string | null;
  readonly ownershipRef: string | null;
  /** The sequence of the current chain head, or null if no value is published yet. */
  readonly currentSequence: number | null;
  /** The sequence the next published record must carry. */
  readonly nextSequence: number;
}

/**
 * The resolver's current view of a name's ownership + value chain — what a
 * publish would chain onto. Returns null if the resolver doesn't know the name.
 */
export async function readValueState(rawName: string): Promise<ValueState | null> {
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
  const head = await currentValue(name);
  return {
    name,
    status: record.status,
    currentOwnerPubkey: record.currentOwnerPubkey ?? null,
    ownershipRef: record.lastStateTxid ?? null,
    currentSequence: head === null ? null : head.sequence,
    nextSequence: head === null ? 1 : head.sequence + 1,
  };
}

/**
 * Sign and publish the next value record for `name`.
 *
 * Throws with a human-readable message if the name is unknown, this wallet is
 * not the current owner, or the resolver rejects the record.
 */
export async function publishNameValue(
  input: PublishValueInput,
  opts: { simulate?: boolean } = {},
): Promise<PublishValueResult> {
  const name = normalizeName(input.name);
  if (!name) {
    throw new Error("Enter a name to set a value for.");
  }

  const ownerPubkey = deriveOwnerPubkey(input.ownerPrivateKeyHex).toLowerCase();

  // 1. The resolver's current view of the name establishes ownership + the
  //    ownership interval the value chain hangs off of.
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

  // 2. Chain the new record onto the live head: exact-next sequence, prev hash.
  const head = await currentValue(name);
  const sequence = head === null ? 1 : head.sequence + 1;
  const previousRecordHash = head === null ? null : head.recordHash;

  // 3. Sign locally with the owner key.
  const signed = signValueRecord({
    name,
    ownerPrivateKeyHex: input.ownerPrivateKeyHex,
    ownershipRef,
    sequence,
    previousRecordHash,
    valueType: input.valueType,
    payloadHex: utf8ToHex(input.payloadUtf8),
  });

  // 4. Never broadcast a record we can't verify ourselves.
  if (!verifyValueRecord(signed)) {
    throw new Error("Local signature self-check failed — refusing to publish.");
  }

  // 5. Demo mode signs but does not publish; live mode POSTs and the resolver
  //    re-verifies everything before accepting (201).
  if (opts.simulate) {
    return {
      name,
      sequence,
      recordHash: computeValueRecordHash(signed),
      ownershipRef,
      valueType: signed.valueType,
      payloadHex: signed.payloadHex,
      simulated: true,
      record: signed,
    };
  }
  const response = await resolver.publishValue(signed);
  return {
    name,
    sequence: response.sequence,
    recordHash: response.recordHash,
    ownershipRef: response.ownershipRef,
    valueType: response.valueType,
    payloadHex: signed.payloadHex,
    simulated: false,
    record: signed,
  };
}
