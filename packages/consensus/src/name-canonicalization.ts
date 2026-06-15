// B2 name-canonicalization predicate (A6 / WIRE §2 / W3). A PURE, total verdict: a batched-claim
// leaf's name bytes are accepted only if they are already CANONICAL — the kernel REJECTS
// non-canonical name bytes and NEVER normalizes them (no lowercasing, trimming, or substitution).
// This mirrors the B1 wire law (WIRE_FORMAT §2: "a decoder MUST reject a payload whose name bytes are
// non-canonical") at the kernel/leaf boundary, killing the legacy normalize-on-ingest behavior
// (indexer.ts normalized leaf names instead of rejecting).
//
// It rides the audited B1 canonical-name primitive `isCanonicalName` (@ont/wire, NAME_RE
// /^[a-z0-9]{1,32}$/) — the same authority the wire decoder uses — so the kernel and wire agree on
// canonicality by construction rather than by a re-stated regex.
//
// SCOPE: this is ONLY the A6 reject-don't-normalize half (a6-02). The full A6 leaf well-formedness
// (accumulator key == sha256(canonical name), owner-binding == H(ownerPubkey)) is the B3 leaf-format
// / commitment-match concern (the owner-binding construction is candidate-stays, riding C6); this
// predicate decides canonicality of the name bytes only and asserts zero state effect.
//
// Total / fail-closed (the #63-#74 discipline): malformed hex, an empty or over-length byte string, or
// any non-canonical byte content rejects and never throws; the predicate never returns a normalized
// name (its verdict is canonical/not, never a rewritten value).
//
// Rules: docs/core/B2_KERNEL_HARDENING.md A6; docs/spec/WIRE_FORMAT.md §2 Names (normative); W3.

import { isCanonicalName } from "@ont/wire";

export interface CanonicalLeafNameVerdict {
  /** True iff the name bytes are already canonical; false rejects (the kernel never normalizes). */
  readonly canonical: boolean;
  /** Stable, rule-grounded reason code. */
  readonly reason: string;
}

const reject = (reason: string): CanonicalLeafNameVerdict => ({ canonical: false, reason });

/**
 * Decide whether `nameBytesHex` (lowercase-hex leaf name bytes) is a canonical name (WIRE §2 /
 * `isCanonicalName`). Pure and total — malformed or non-canonical input rejects and never throws, and
 * the verdict is canonical-or-not, NEVER a normalized name.
 */
export function acceptCanonicalLeafName(nameBytesHex: string): CanonicalLeafNameVerdict {
  if (typeof nameBytesHex !== "string" || nameBytesHex.length === 0 || nameBytesHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(nameBytesHex)) {
    return reject("a6-name-bytes-malformed");
  }
  // Canonical names are 1..32 bytes (WIRE §2). Reject an over-length byte string outright — never
  // truncate (truncation would be a form of normalization).
  if (nameBytesHex.length / 2 > 32) {
    return reject("a6-non-canonical-name-rejected");
  }
  let name = "";
  for (let i = 0; i < nameBytesHex.length; i += 2) {
    name += String.fromCharCode(parseInt(nameBytesHex.slice(i, i + 2), 16));
  }
  // WIRE §2 / W3: reject non-canonical name bytes; NEVER normalize (no lowercasing, no trimming, no
  // substitution). Non-[a-z0-9] bytes (e.g. uppercase 'A' = 0x41) reject — they are not rewritten.
  if (!isCanonicalName(name)) {
    return reject("a6-non-canonical-name-rejected");
  }
  return { canonical: true, reason: "canonical-name-accepted" };
}
