// B2 value-record authority — interval-chain acceptance predicate.
//
// A pure deterministic verdict (V1/V12): given a candidate value-record
// envelope, the name's CURRENT ownership interval, and the current record-chain
// head for that interval, decide accept/reject — never mutating ownership state,
// reading a clock, or touching I/O.
//
// AUTHORITY DIGEST = the B1-normative @ont/wire v1 §8.1 record (recordVersion 1):
// the 'ont-value-record' Schnorr signature in `verifyValueRecord` and the
// canonical §8.1 digest in `valueRecordDigest`. The legacy @ont/protocol record
// (recordVersion 2) is evidence-only and NEVER a valid authority record (WIRE
// §8.1) — this module imports the wire v1 primitives, not the protocol ones, and
// rejects a recordVersion-2 candidate explicitly. This module owns only the
// consensus interval-chain acceptance rules on top of those wire primitives.
//
// The ownership interval is an INPUT (V1): the engine supplies which interval is
// current (its ownerPubkey + ownershipRef) and the chain head. WHEN/HOW an
// interval opens — the per-rail interval-reference definition (V5) and the
// recovery interval-opening timing (recovery-auth / PR-17) — is upstream and is
// NOT decided here; this predicate only compares the record against the given
// interval. So V2 (owner match), V4 (ref match), and V13 (no interval -> reject)
// are checks against the supplied interval, free of the parked interval-opening
// question.
//
// V10 (transfer clears the chain) is enforced compositionally: after a transfer
// the engine supplies the NEW interval (new ownershipRef) with a null head, so a
// record continuing the old chain is rejected by V4 (old ref) or V6 (a fresh
// chain's first record must be sequence 1 / null prev). Every transfer is
// non-preserving (Decision #18); no preserve signal is specified, so fail closed.
//
// FAIL-CLOSED: the wire primitives validate shape as a side effect and THROW on
// malformed input (bad hex, missing field, out-of-bound sequence/payload). A
// consensus verdict must never throw on a hostile candidate, so every wire call
// here is wrapped to turn a wire-shape error into a stable rejecting verdict.
//
// Rules: docs/core/B2_KERNEL_HARDENING.md V1-V13; DECISIONS #17/#18; WIRE_FORMAT
// §8.1. Out of scope here (deferred, not decided): the V5 interval-reference
// definition + recovery interval-opening (recovery-auth / PR-17, upstream); V15
// ACCEPTED_PAYLOAD_CAP (a launch-freeze parameter with no pinnable value — the
// wire 65,535-byte encodable bound is already enforced by @ont/wire). V9's
// standalone digest-canonicality / signature-malleability rules are
// candidate-stays: V8 recomputes the head's §8.1 v1 digest with the B1-normative
// mechanism, but this slice asserts no standalone V9 ratified semantics.

import {
  VALUE_RECORD_FORMAT,
  VALUE_RECORD_VERSION,
  SEQUENCE_BOUND,
  bytesToHex,
  valueRecordDigest,
  verifyValueRecord,
} from "@ont/wire";

/**
 * A v1 §8.1 value-record envelope. @ont/wire validates and verifies records as
 * untyped `Record<string, unknown>` and exports no record type, so the consensus
 * surface names the closed v1 field set it consumes here.
 */
export interface ValueRecordEnvelope {
  readonly format: string;
  readonly recordVersion: number;
  readonly name: string;
  readonly ownerPubkey: string;
  readonly ownershipRef: string;
  readonly sequence: number;
  readonly previousRecordHash: string | null;
  readonly valueType: number;
  readonly payloadHex: string;
  readonly issuedAt: string;
  readonly signature: string;
}

/**
 * The name's current ownership interval, as supplied by the engine — the only
 * ownership context the value-record verdict consumes (V1). The caller passes
 * `null` when the name has no current interval (unclaimed / nullified /
 * invalidated-or-released ownership).
 */
export interface OwnershipInterval {
  /** The current owner key of the interval (V2). */
  readonly ownerPubkey: string;
  /** The 32-byte reference of the on-chain event that opened the interval (V4/V5). */
  readonly ownershipRef: string;
}

/** The value-record acceptance verdict. Pure data; the caller applies it. */
export interface ValueRecordVerdict {
  readonly accepted: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const reject = (reason: string): ValueRecordVerdict => ({ accepted: false, reason });
const accept = (): ValueRecordVerdict => ({ accepted: true, reason: "value-record-accepted" });

// The wire functions accept an untyped envelope; the consensus layer passes its
// closed-field-set type through.
const asWire = (r: ValueRecordEnvelope): Record<string, unknown> =>
  r as unknown as Record<string, unknown>;

/** Fail-closed BIP340 verify: any wire-shape error verifies as `false`. */
function verifyWireSignature(r: ValueRecordEnvelope): boolean {
  try {
    return verifyValueRecord(asWire(r));
  } catch {
    return false;
  }
}

/**
 * Fail-closed §8.1 v1 digest, hex-encoded; `null` on any wire-shape error.
 * Used to recompute a head record's canonical hash (never trust a declared one).
 */
function wireDigestHex(r: ValueRecordEnvelope): string | null {
  try {
    return bytesToHex(valueRecordDigest(asWire(r)));
  } catch {
    return null;
  }
}

/**
 * Decide whether `record` is accepted into the chain of its name's current
 * ownership `interval`, given the current chain `head` (null = empty chain, i.e.
 * `record` would be the interval's first record).
 *
 * Pure and deterministic (V1): identical inputs yield identical verdicts at any
 * host clock, and issuedAt is never consulted for ordering (V11). Never mutates
 * ownership state (V12).
 */
export function valueRecordAccept(
  record: ValueRecordEnvelope,
  interval: OwnershipInterval | null,
  head: ValueRecordEnvelope | null
): ValueRecordVerdict {
  // V13: a record for a name with no current ownership interval is rejected.
  if (interval === null) {
    return reject("v13-no-current-ownership-interval");
  }

  // The authority record is the @ont/wire v1 §8.1 record (recordVersion 1). The
  // legacy @ont/protocol record (recordVersion 2) is evidence-only and never a
  // valid authority record (WIRE §8.1) — reject it explicitly rather than letting
  // it fall through as a generic malformed/signature failure.
  if (record.recordVersion !== VALUE_RECORD_VERSION) {
    return reject("v3-legacy-record-version-rejected");
  }

  // Fail-closed §8.1 wire validity: exact format, canonical name, registered
  // valueType, closed field set, well-formed hex/sequence/payload/timestamp.
  // (verifyWireSignature also re-derives the digest; this returns the canonical
  // hash and so doubles as the shape gate, keeping the verdict non-throwing.)
  if (record.format !== VALUE_RECORD_FORMAT || wireDigestHex(record) === null) {
    return reject("v3-malformed-value-record");
  }

  // V2: ownerPubkey must equal the current owner key of the interval.
  if (record.ownerPubkey !== interval.ownerPubkey) {
    return reject("v2-owner-key-mismatch");
  }

  // V4: ownershipRef must equal the current interval reference — a prior
  // interval's reference is rejected even under the same owner key (same-key
  // reacquisition).
  if (record.ownershipRef !== interval.ownershipRef) {
    return reject("v4-ownership-ref-mismatch");
  }

  // V3: the signature must be a valid BIP340 Schnorr signature by ownerPubkey
  // over the §8.1 v1 'ont-value-record' digest. The domain label plus the name in
  // the digest reject cross-context (recovery-descriptor) and cross-name replays.
  if (!verifyWireSignature(record)) {
    return reject("v3-invalid-signature");
  }

  // Chain linkage.
  if (head === null) {
    // V6: the first record of an interval must be sequence 1 with a null prev.
    if (record.sequence !== 1) {
      return reject("v6-first-record-must-be-sequence-1");
    }
    if (record.previousRecordHash !== null) {
      return reject("v6-first-record-must-have-null-previous-hash");
    }
    return accept();
  }

  // V7: a non-first record's sequence must be exactly head.sequence + 1. At the §8
  // max head sequence (2^53-1, SEQUENCE_BOUND) the required +1 is not a safe
  // integer, so the chain freezes fail-closed — guarded explicitly here rather
  // than relying on the arithmetic to miss. (A candidate whose own sequence
  // exceeds the bound is a wire-shape reject, caught fail-closed above.)
  if (head.sequence >= SEQUENCE_BOUND) {
    return reject("v7-head-sequence-bound-reached");
  }
  if (record.sequence !== head.sequence + 1) {
    return reject(
      record.sequence <= head.sequence ? "v7-stale-or-duplicate-sequence" : "v7-sequence-gap"
    );
  }

  // V8: previousRecordHash must equal the RECOMPUTED canonical §8.1 v1 digest of
  // the head (@ont/wire.valueRecordDigest) — never a declared/stored value (the
  // PB5 soundness lesson). The digest mechanism is B1-normative; V9's standalone
  // digest-canonicality / malleability semantics are candidate-stays and are not
  // asserted by this slice. Fail closed if the head itself does not re-derive.
  const headHash = wireDigestHex(head);
  if (headHash === null) {
    return reject("v8-head-record-malformed");
  }
  if (record.previousRecordHash !== headHash) {
    return reject("v8-previous-record-hash-mismatch");
  }

  return accept();
}
