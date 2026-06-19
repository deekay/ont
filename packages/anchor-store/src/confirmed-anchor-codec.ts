// @ont/indexer live — G2 slice 2a: the strict, bigint-safe codec for a ConfirmedAnchorRecord.
//
// The durable confirmed-anchor store (slice 2b) persists ConfirmedAnchorRecord to disk. The only non-JSON-safe
// data is the LegacyTransaction bodies in feeTxParts (bigint output values). Rather than hand-roll a
// bigint-in-JSON encoding (the exact class of bug @ont/db's legacy snapshot CAUTION describes — a silently
// lossy whitelist parser), each LegacyTransaction is encoded as its CONSENSUS raw-tx hex via the audited
// serializeLegacyTransaction and decoded via parseLegacyTransaction. Round-trip identity then reduces to the
// serialize↔parse inverse proven in @ont/bitcoin, plus verbatim primitive fields — bigint never touches JSON.
//
// Both directions fail closed. encode() refuses to write a poison runtime record (primitive + anchor-txid
// validation up front, so corruption can't be deferred to a later restart). decode() is the untrusted-disk
// boundary: closed shape (no missing/extra fields, objects-not-arrays), validated primitives, fail-closed tx
// parsing, and a storage-corruption guard that the decoded anchor tx hashes to the stored anchorTxid. The
// txid guard is storage integrity, NOT a consensus decision — the audited core still re-derives downstream.
import {
  serializeLegacyTransaction,
  parseLegacyTransaction,
  legacyTxidOf,
  type LegacyTransaction,
} from "@ont/bitcoin";
import type { ConfirmedAnchorRecord } from "./record.js";

/** The JSON-safe on-disk form of a ConfirmedAnchorRecord (tx bodies as consensus raw-tx hex). */
export interface EncodedConfirmedAnchorRecord {
  readonly confirmedAnchor: {
    readonly anchorTxid: string;
    readonly minedHeight: number;
    readonly anchoredRoot: string;
    readonly batchSize: number;
  };
  readonly feeTxParts: {
    readonly anchorTxHex: string;
    readonly prevoutTxHexes: readonly string[];
  };
}

const HEX_64 = /^[0-9a-f]{64}$/;
const U32_MAX = 0xffff_ffff;

const isHex64 = (value: unknown): value is string => typeof value === "string" && HEX_64.test(value);
const isU32 = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= U32_MAX;

/** Own-enumerable keys of `value` are EXACTLY `keys` (rejects null, arrays, and missing/extra fields). */
function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(value, k));
}

function serializeToHex(tx: LegacyTransaction): string | null {
  const bytes = serializeLegacyTransaction(tx);
  return bytes === null ? null : Buffer.from(bytes).toString("hex");
}

function failEncode(reason: string): never {
  throw new Error(`cannot encode confirmed-anchor record: ${reason}`);
}
function failDecode(reason: string): never {
  throw new Error(`invalid encoded confirmed-anchor record: ${reason}`);
}

/** Encode a record to its JSON-safe on-disk form; fails closed on a poison record or a non-serializable tx. */
export function encodeConfirmedAnchorRecord(record: ConfirmedAnchorRecord): EncodedConfirmedAnchorRecord {
  const { confirmedAnchor, feeTxParts } = record;
  // Mirror decode's primitive validation so a poison runtime record cannot be persisted (watch 2).
  if (!isHex64(confirmedAnchor.anchorTxid)) failEncode("anchorTxid must be 64-char lowercase hex");
  if (!isHex64(confirmedAnchor.anchoredRoot)) failEncode("anchoredRoot must be 64-char lowercase hex");
  if (!isU32(confirmedAnchor.minedHeight)) failEncode("minedHeight must be a u32 integer");
  if (!isU32(confirmedAnchor.batchSize)) failEncode("batchSize must be a u32 integer");

  const anchorTxHex = serializeToHex(feeTxParts.anchorTx);
  if (anchorTxHex === null) failEncode("cannot serialize anchor tx");
  // Anchor-txid guard up front: refuse to write a record whose tx body and stored txid disagree (watch 2).
  if (legacyTxidOf(feeTxParts.anchorTx) !== confirmedAnchor.anchorTxid) failEncode("anchor txid does not match anchor tx");

  const prevoutTxHexes: string[] = [];
  for (const tx of feeTxParts.prevoutTxs) {
    const hex = serializeToHex(tx);
    if (hex === null) failEncode("cannot serialize prevout tx");
    prevoutTxHexes.push(hex);
  }

  return {
    confirmedAnchor: {
      anchorTxid: confirmedAnchor.anchorTxid,
      minedHeight: confirmedAnchor.minedHeight,
      anchoredRoot: confirmedAnchor.anchoredRoot,
      batchSize: confirmedAnchor.batchSize,
    },
    feeTxParts: { anchorTxHex, prevoutTxHexes },
  };
}

/** Decode an untrusted on-disk value back to a ConfirmedAnchorRecord; fails closed on any integrity problem. */
export function decodeConfirmedAnchorRecord(value: unknown): ConfirmedAnchorRecord {
  if (!hasExactKeys(value, ["confirmedAnchor", "feeTxParts"])) {
    failDecode("expected exactly { confirmedAnchor, feeTxParts }");
  }
  const ca = value.confirmedAnchor;
  if (!hasExactKeys(ca, ["anchorTxid", "minedHeight", "anchoredRoot", "batchSize"])) {
    failDecode("confirmedAnchor must be exactly { anchorTxid, minedHeight, anchoredRoot, batchSize }");
  }
  const ftp = value.feeTxParts;
  if (!hasExactKeys(ftp, ["anchorTxHex", "prevoutTxHexes"])) {
    failDecode("feeTxParts must be exactly { anchorTxHex, prevoutTxHexes }");
  }

  const { anchorTxid, minedHeight, anchoredRoot, batchSize } = ca;
  if (!isHex64(anchorTxid)) failDecode("anchorTxid must be 64-char lowercase hex");
  if (!isHex64(anchoredRoot)) failDecode("anchoredRoot must be 64-char lowercase hex");
  if (!isU32(minedHeight)) failDecode("minedHeight must be a u32 integer");
  if (!isU32(batchSize)) failDecode("batchSize must be a u32 integer");

  const { anchorTxHex, prevoutTxHexes } = ftp;
  if (typeof anchorTxHex !== "string") failDecode("anchorTxHex must be a string");
  const anchorTx = parseLegacyTransaction(anchorTxHex);
  if (anchorTx === null) failDecode("anchorTxHex does not parse as a legacy transaction");

  if (!Array.isArray(prevoutTxHexes)) failDecode("prevoutTxHexes must be an array");
  const prevoutTxs: LegacyTransaction[] = [];
  for (const hex of prevoutTxHexes) {
    if (typeof hex !== "string") failDecode("prevoutTxHexes must contain only strings");
    const tx = parseLegacyTransaction(hex);
    if (tx === null) failDecode("a prevout tx hex does not parse as a legacy transaction");
    prevoutTxs.push(tx);
  }

  // Storage-corruption guard: the decoded anchor tx must hash to the stored anchorTxid.
  if (legacyTxidOf(anchorTx) !== anchorTxid) failDecode("anchor txid does not match the decoded anchor tx");

  return {
    confirmedAnchor: { anchorTxid, minedHeight, anchoredRoot, batchSize },
    feeTxParts: { anchorTx, prevoutTxs },
  };
}
