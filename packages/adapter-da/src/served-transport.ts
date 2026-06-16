import type { ServedLeaf } from "@ont/evidence";

// B4-DA (B4_ADAPTERS_PLAN §10) — the served-bytes DA transport behind B4-INDEX-DATASOURCE's
// servedLeavesForRoot. B4-DA FETCHES + structurally PARSES the /da/{root} payload into a ServedLeaf[];
// DATASOURCE owns dedup / insert-only / non-empty / base + root reconstruction / availability-height. A
// withheld / malformed serve → null → DATASOURCE fails closed. B4-DA decides nothing; no schedule / window
// / base / root shortcut enters through DA.
//
// CANDIDATE /da/{root} transport (§10.1) — PROVISIONAL, NOT ratified WIRE_FORMAT (CL ruling, event
// 54c43028). Flagged reopen for DK; if rejected the blast radius is this parser + its tests, while
// DATASOURCE / B3 verification stays unchanged.
//
//   served-transport := version(1)=0x01 ‖ count(u32 big-endian, WIRE convention) ‖ count × leaf
//   leaf            := key(32) ‖ value(32)            // 64 bytes per leaf, internal binary
//
// Exact-length: total === 5 + 64 × count (no trailing). count=0 parses to [] (a STRUCTURAL decode — the
// non-empty requirement is DATASOURCE's, not B4-DA's). Leaves are returned as fresh { keyHex, valueHex }
// 32-byte LOWERCASE-hex objects in TRANSPORT ORDER — no sort / dedup here (DATASOURCE canonicalizes).

/** The network I/O seam (real HTTP `/da/{root}` in production; fixture in tests). ASYNC. */
export interface DaSource {
  /** Fetch the raw served-transport bytes (hex) for `anchoredRoot`, or null if withheld/unavailable. */
  fetchServed(anchoredRoot: string): Promise<string | null>;
}

export interface FetchServedLeavesInput {
  readonly daSource: DaSource;
  readonly anchoredRoot: string;
}

const HEX_64_LOWER = /^[0-9a-f]{64}$/;
const HEX_EVEN = /^(?:[0-9a-fA-F]{2})*$/;

/**
 * PURE structural parse of the candidate served-transport hex → `ServedLeaf[]`, or null. Accepts ONLY a
 * raw even-length hex string (no `0x`, no odd length, no non-hex). Rejects a bad version, and enforces the
 * exact-count firewall `bytes.length === 5 + 64 × count` (short / long / trailing → null). Leaves come out
 * as fresh lowercase-hex objects in transport order — NO sort / dedup (DATASOURCE owns canonicalization).
 * `count=0` → `[]` (structural; DATASOURCE rejects empty). Total + fail-closed; never throws.
 *
 * STUB (B4-DA, tests-first): returns null so the `da.*` red battery fails until implemented.
 */
export function parseServedTransport(_rawHex: string): readonly ServedLeaf[] | null {
  void HEX_64_LOWER;
  void HEX_EVEN;
  return null;
}

/**
 * ASYNC wrapper: validate `anchoredRoot` as lowercase HEX_64 FIRST (a malformed root → null WITHOUT
 * consulting the provider — input validity must not depend on provider behavior), then await
 * `daSource.fetchServed(anchoredRoot)` forwarding the EXACT root (null / reject / throw / non-string result
 * → null), then `parseServedTransport`. Total + fail-closed; never throws, never rejects.
 *
 * STUB (B4-DA, tests-first).
 */
export async function fetchServedLeaves(_input: FetchServedLeavesInput): Promise<readonly ServedLeaf[] | null> {
  return null;
}
