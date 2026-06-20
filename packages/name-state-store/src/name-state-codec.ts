// @ont/name-state-store — the strict codec for a NameStateRecord.
//
// Every field is JSON-safe (no bigint / tx bodies), so the codec is closed-shape + primitive validation only:
// encode() refuses to persist a poison runtime record (so corruption cannot be deferred to a later restart),
// and decode() is the untrusted-disk boundary (no missing/extra fields, objects-not-arrays, validated
// primitives). Neither direction makes a consensus decision — this is storage integrity only; the audited core
// already decided before the loop wrote the record.
import { sha256Hex, utf8ToBytes } from "@ont/protocol";
import { isCanonicalName } from "@ont/wire";
import type {
  NameStateRecord,
  NameStateOwner,
  NameStateAnchorCoords,
  NameStateTraceStep,
} from "./record.js";

/** The JSON-safe on-disk form. NameStateRecord is already JSON-safe, so the encoded form is structurally equal —
 *  the type alias documents the on-disk contract and keeps the encode/decode pair symmetric. */
export type EncodedNameStateRecord = NameStateRecord;

const HEX_64 = /^[0-9a-f]{64}$/;
const U32_MAX = 0xffff_ffff;

const isHex64 = (value: unknown): value is string => typeof value === "string" && HEX_64.test(value);
const isU32 = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= U32_MAX;
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isString = (value: unknown): value is string => typeof value === "string";

/** Own-enumerable keys of `value` are EXACTLY `keys` (rejects null, arrays, and missing/extra fields). */
function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(value, k));
}

function failEncode(reason: string): never {
  throw new Error(`cannot encode name-state record: ${reason}`);
}
function failDecode(reason: string): never {
  throw new Error(`invalid encoded name-state record: ${reason}`);
}

/** Validate the owner shape; `fail` distinguishes the encode (poison runtime) vs decode (corrupt disk) boundary. */
function validatedOwner(value: unknown, fail: (reason: string) => never): NameStateOwner {
  if (!hasExactKeys(value, ["kind", "ownerPubkeyHex"])) fail("owner must be exactly { kind, ownerPubkeyHex }");
  const owner = value as Record<string, unknown>;
  if (owner.kind !== "owner-key") fail('owner.kind must be "owner-key" (current B3: value === ownerPubkey)');
  if (!isHex64(owner.ownerPubkeyHex)) fail("owner.ownerPubkeyHex must be 64-char lowercase hex");
  return { kind: "owner-key", ownerPubkeyHex: owner.ownerPubkeyHex as string };
}

function validatedAnchor(value: unknown, fail: (reason: string) => never): NameStateAnchorCoords {
  if (!hasExactKeys(value, ["txid", "minedHeight", "txIndex", "vout"])) {
    fail("anchor must be exactly { txid, minedHeight, txIndex, vout }");
  }
  const a = value as Record<string, unknown>;
  if (!isHex64(a.txid)) fail("anchor.txid must be 64-char lowercase hex");
  if (!isU32(a.minedHeight)) fail("anchor.minedHeight must be a u32 integer");
  if (!isU32(a.txIndex)) fail("anchor.txIndex must be a u32 integer");
  if (!isU32(a.vout)) fail("anchor.vout must be a u32 integer");
  return {
    txid: a.txid as string,
    minedHeight: a.minedHeight as number,
    txIndex: a.txIndex as number,
    vout: a.vout as number,
  };
}

/** Validate the optional `evidence` summary: a flat object whose values are all string|number (mirrors
 *  ClaimTraceEntry.evidence). Returns a fresh object so no extra prototype/nested junk rides to disk. */
function validatedEvidence(value: unknown, fail: (reason: string) => never): Record<string, string | number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("trace step.evidence must be a flat object");
  }
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // A NUMBER must be FINITE: NaN/Infinity pass typeof but JSON.stringify them to `null`, so they would
    // silently corrupt the record across a restart. Reject them up front (the untrusted-disk boundary).
    const okValue = typeof v === "string" || (typeof v === "number" && Number.isFinite(v));
    if (!okValue) fail("trace step.evidence values must be a string or a finite number");
    out[k] = v as string | number;
  }
  return out;
}

function validatedTrace(value: unknown, fail: (reason: string) => never): NameStateTraceStep[] {
  if (!Array.isArray(value)) fail("trace must be an array");
  // A record only exists on accept, which always has a verdict path — an empty trace is a poison/corrupt record.
  if (value.length === 0) fail("trace must be non-empty (the accepted verdict path)");
  const steps: NameStateTraceStep[] = [];
  for (const entry of value as unknown[]) {
    // step/ok/reason required; evidence optional. Reject any other key (closed shape, optional-aware).
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) fail("each trace step must be an object");
    const e = entry as Record<string, unknown>;
    const keys = Object.keys(e);
    const allowed = keys.every((k) => k === "step" || k === "ok" || k === "reason" || k === "evidence");
    const hasRequired = ["step", "ok", "reason"].every((k) => Object.prototype.hasOwnProperty.call(e, k));
    if (!allowed || !hasRequired) fail("each trace step must be { step, ok, reason, evidence? }");
    if (!isNonEmptyString(e.step)) fail("trace step.step must be a non-empty string");
    if (!isBoolean(e.ok)) fail("trace step.ok must be a boolean");
    if (!isString(e.reason)) fail("trace step.reason must be a string");
    const base = { step: e.step as string, ok: e.ok as boolean, reason: e.reason as string };
    steps.push(
      Object.prototype.hasOwnProperty.call(e, "evidence")
        ? { ...base, evidence: validatedEvidence(e.evidence, fail) }
        : base,
    );
  }
  return steps;
}

/** Validate a record (shared by encode + decode) and return a fresh, field-exact object (drops any extra keys). */
function validatedRecord(value: unknown, fail: (reason: string) => never): NameStateRecord {
  if (
    !hasExactKeys(value, [
      "canonicalName",
      "leafKeyHex",
      "owner",
      "batchLocalIndex",
      "anchoredRoot",
      "anchor",
      "firstServableHeight",
      "trace",
    ])
  ) {
    fail(
      "expected exactly { canonicalName, leafKeyHex, owner, batchLocalIndex, anchoredRoot, anchor, firstServableHeight, trace }",
    );
  }
  const r = value as Record<string, unknown>;
  if (!isNonEmptyString(r.canonicalName)) fail("canonicalName must be a non-empty string");
  // §2a integrity (untrusted-disk boundary): the name must be canonical (W3 reject-don't-normalize, never
  // case-fold) and the leaf key must RECOMPUTE from it — so a corrupt/poison record can't mint a false
  // name→leaf binding. This is storage integrity, NOT a consensus decision (the audited core already decided).
  if (!isCanonicalName(r.canonicalName)) fail("canonicalName must be canonical (W3 reject-don't-normalize)");
  if (!isHex64(r.leafKeyHex)) fail("leafKeyHex must be 64-char lowercase hex");
  if (r.leafKeyHex !== sha256Hex(utf8ToBytes(r.canonicalName))) {
    fail("leafKeyHex must equal sha256Hex(utf8ToBytes(canonicalName)) — name→leaf binding mismatch");
  }
  if (!isU32(r.batchLocalIndex)) fail("batchLocalIndex must be a u32 integer");
  if (!isHex64(r.anchoredRoot)) fail("anchoredRoot must be 64-char lowercase hex");
  if (!isU32(r.firstServableHeight)) fail("firstServableHeight must be a u32 integer");
  return {
    canonicalName: r.canonicalName as string,
    leafKeyHex: r.leafKeyHex as string,
    owner: validatedOwner(r.owner, fail),
    batchLocalIndex: r.batchLocalIndex as number,
    anchoredRoot: r.anchoredRoot as string,
    anchor: validatedAnchor(r.anchor, fail),
    firstServableHeight: r.firstServableHeight as number,
    trace: validatedTrace(r.trace, fail),
  };
}

/** Encode a record to its JSON-safe on-disk form; fails closed on a poison record (so it cannot be persisted). */
export function encodeNameStateRecord(record: NameStateRecord): EncodedNameStateRecord {
  return validatedRecord(record, failEncode);
}

/** Decode an untrusted on-disk value back to a NameStateRecord; fails closed on any integrity problem. */
export function decodeNameStateRecord(value: unknown): NameStateRecord {
  return validatedRecord(value, failDecode);
}
