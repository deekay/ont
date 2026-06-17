// @ont/indexer live — G2 slice 2a: the strict, bigint-safe codec for a ConfirmedAnchorRecord.
//
// The durable confirmed-anchor store (slice 2b) persists ConfirmedAnchorRecord to disk. The only non-JSON-safe
// data is the LegacyTransaction bodies in feeTxParts (bigint output values). Rather than hand-roll a
// bigint-in-JSON encoding (the exact class of bug @ont/db's legacy snapshot CAUTION describes — a silently
// lossy whitelist parser), each LegacyTransaction is encoded as its CONSENSUS raw-tx hex via the audited
// serializeLegacyTransaction and decoded via parseLegacyTransaction. Round-trip identity then reduces to the
// serialize↔parse inverse proven in @ont/bitcoin, plus verbatim primitive fields — bigint never touches JSON.
//
// decode() is the trust boundary (untrusted bytes off disk): closed shape (no missing/extra fields), validated
// primitives, fail-closed tx parsing, and a storage-corruption guard that the decoded anchor tx hashes to the
// stored anchorTxid. This is storage integrity, NOT a consensus decision — the audited core still re-derives
// everything downstream.
import {
  serializeLegacyTransaction,
  parseLegacyTransaction,
  legacyTxidOf,
} from "@ont/bitcoin";
import type { ConfirmedAnchorRecord } from "../ingest-anchors.js";

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

/** Encode a record to its JSON-safe on-disk form; fails closed if any tx cannot serialize. */
export function encodeConfirmedAnchorRecord(record: ConfirmedAnchorRecord): EncodedConfirmedAnchorRecord {
  void record;
  void serializeLegacyTransaction;
  void legacyTxidOf;
  throw new Error("confirmed-anchor codec encode not implemented");
}

/** Decode an untrusted on-disk value back to a ConfirmedAnchorRecord; fails closed on any integrity problem. */
export function decodeConfirmedAnchorRecord(value: unknown): ConfirmedAnchorRecord {
  void value;
  void parseLegacyTransaction;
  void legacyTxidOf;
  throw new Error("confirmed-anchor codec decode not implemented");
}
