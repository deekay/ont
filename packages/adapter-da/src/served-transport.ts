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
 */
export function parseServedTransport(rawHex: string): readonly ServedLeaf[] | null {
  try {
    if (typeof rawHex !== "string" || !HEX_EVEN.test(rawHex)) return null; // no 0x / odd / non-hex
    const bytes = hexToBytes(rawHex);
    if (bytes.length < 5) return null; // version(1) + count(4) minimum
    if (bytes[0] !== 0x01) return null; // candidate transport version
    const count = ((bytes[1]! << 24) | (bytes[2]! << 16) | (bytes[3]! << 8) | bytes[4]!) >>> 0; // u32 BE
    if (bytes.length !== 5 + 64 * count) return null; // exact-count firewall (short / long / trailing)
    const leaves: ServedLeaf[] = [];
    for (let i = 0; i < count; i += 1) {
      const off = 5 + 64 * i;
      leaves.push({ keyHex: bytesToHex(bytes.slice(off, off + 32)), valueHex: bytesToHex(bytes.slice(off + 32, off + 64)) });
    }
    return leaves; // transport order; fresh lowercase-hex leaf objects; no sort / dedup
  } catch {
    return null;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}

/**
 * ASYNC wrapper: validate `anchoredRoot` as lowercase HEX_64 FIRST (a malformed root → null WITHOUT
 * consulting the provider — input validity must not depend on provider behavior), then await
 * `daSource.fetchServed(anchoredRoot)` forwarding the EXACT root (null / reject / throw / non-string result
 * → null), then `parseServedTransport`. The whole body (incl. the destructure + the root guard) is wrapped,
 * so malformed wrapper input (null / missing daSource / non-function fetchServed) also fails closed. Total +
 * fail-closed; never throws, never rejects.
 */
export async function fetchServedLeaves(input: FetchServedLeavesInput): Promise<readonly ServedLeaf[] | null> {
  try {
    const { daSource, anchoredRoot } = input;
    if (typeof anchoredRoot !== "string" || !HEX_64_LOWER.test(anchoredRoot)) return null; // BEFORE the provider
    const raw = await daSource.fetchServed(anchoredRoot);
    if (typeof raw !== "string") return null; // null / undefined / non-string
    return parseServedTransport(raw);
  } catch {
    return null;
  }
}
