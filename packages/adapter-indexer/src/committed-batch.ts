import { accumulatorRootOf, sha256Hex, utf8ToBytes } from "@ont/protocol";
import { isCanonicalName } from "@ont/wire";
import type { CommittedBatchContents } from "@ont/consensus";

// B4-INDEX-COMMIT (B4_ADAPTERS_PLAN §9.6) — the fee-critical committed-batch projection. The audited
// gate-fee predicate reads `canonicalNameByteLength` per leaf as the Σ g basis (#52), so a lowered length
// underpays exactly like a low schedule. This projection is therefore VERIFIED, not raw producer data:
// the indexer RECOMPUTES every leaf from the batch material and binds the full committed set to the
// anchored accumulator root. A lying name → H(name) is not the committed leaf key → root mismatch → null;
// a lowered length is impossible — it is recomputed from the verified canonical name bytes. The indexer
// supplies NO schedule / window / projection shortcut (false-accept defense). Total + fail-closed.
//
// Canonical-name guard (CL): W3/batch material REJECTS non-canonical bytes — `isCanonicalName(name)` is the
// gate (NOT `normalizeName`, which is the W2 accepting parser). Only the exact canonical string is hashed
// and byte-counted. The accumulator value is the raw owner pubkey under current B3 (value === ownerPubkey),
// required as 32-byte lowercase hex; a malformed root/base/value is null, never a throw or case-normalized mint.

export interface CommittedBatchEntry {
  /** The canonical name (W3: must satisfy `isCanonicalName`); H(name) is its committed leaf key. */
  readonly name: string;
  /** The raw accumulator value under current B3: the 32-byte lowercase-hex owner pubkey. */
  readonly ownerPubkey: string;
}

export interface BuildCommittedBatchInput {
  /** The batch's accumulator root (from the confirmed anchor; trusted, chain-bound). */
  readonly anchoredRoot: string;
  /** The committed leaf count (from the confirmed anchor). */
  readonly batchSize: number;
  /** The K-deep base accumulator leaves (leafKey → ownerPubkey) for `prevRoot`. */
  readonly baseLeaves: ReadonlyMap<string, string>;
  /** The prevRoot the base must verify to (`accumulatorRootOf(baseLeaves) === prevRoot`). */
  readonly prevRoot: string;
  /** UNTRUSTED published batch material (only `name` + `ownerPubkey` are read; extra fields ignored). */
  readonly batchEntries: readonly CommittedBatchEntry[];
}

const HEX_64_LOWER = /^[0-9a-f]{64}$/;

/**
 * GREEN contract (B4-INDEX-COMMIT):
 *   1. base    accumulatorRootOf(baseLeaves) === prevRoot — else null (no trust of an unverified base).
 *   2. delta   for each entry: isCanonicalName(name) else null; leafKey = sha256Hex(utf8ToBytes(name));
 *              ownerPubkey must be 32-byte lowercase hex (value === ownerPubkey) else null; the delta must
 *              be disjoint from baseLeaves AND internally unique (insert-only) else null.
 *   3. bind    accumulatorRootOf(baseLeaves ∪ delta) === anchoredRoot — else null.
 *   4. size    delta.size === batchSize — else null (#52: Σ g over the FULL set; dropped/extra leaf → null).
 *   5. project leaves = [{ leafKeyHex, canonicalNameByteLength: utf8ToBytes(name).length }] from the VERIFIED
 *              name (never a producer-supplied length), SORTED by leafKeyHex (order-independent seam output).
 * A malformed root/base/value or any accumulatorRootOf throw → null (never an exception / case-normalized mint).
 */
export function buildCommittedBatchForRoot(input: BuildCommittedBatchInput): CommittedBatchContents | null {
  try {
    if (input === null || typeof input !== "object") return null;
    const { anchoredRoot, batchSize, baseLeaves, prevRoot, batchEntries } = input;
    if (typeof anchoredRoot !== "string" || typeof prevRoot !== "string") return null;
    if (!Number.isInteger(batchSize) || batchSize < 0) return null;
    if (!(baseLeaves instanceof Map) || !Array.isArray(batchEntries)) return null;

    // 1. base — no trust of an unverified base.
    if (accumulatorRootOf(baseLeaves) !== prevRoot) return null;

    // 2. delta — recompute each leaf; W3 gate; lowercase-hex owner value; insert-only disjoint + unique.
    const delta = new Map<string, string>();
    const leaves: { leafKeyHex: string; canonicalNameByteLength: number }[] = [];
    for (const entry of batchEntries) {
      if (entry === null || typeof entry !== "object") return null;
      const { name, ownerPubkey } = entry; // read ONLY name + ownerPubkey — riding fields ignored
      if (typeof name !== "string" || !isCanonicalName(name)) return null; // W3: reject, never normalize
      if (typeof ownerPubkey !== "string" || !HEX_64_LOWER.test(ownerPubkey)) return null;
      const nameBytes = utf8ToBytes(name);
      const leafKeyHex = sha256Hex(nameBytes);
      if (baseLeaves.has(leafKeyHex) || delta.has(leafKeyHex)) return null; // insert-only + unique
      delta.set(leafKeyHex, ownerPubkey);
      leaves.push({ leafKeyHex, canonicalNameByteLength: nameBytes.length });
    }

    // 3. bind — the full committed set must replay to the anchored root.
    const full = new Map<string, string>(baseLeaves);
    for (const [k, v] of delta) full.set(k, v);
    if (accumulatorRootOf(full) !== anchoredRoot) return null;

    // 4. size — Σ g is over the FULL committed set (#52); a dropped/extra leaf must not slip.
    if (delta.size !== batchSize) return null;

    // 5. project — deterministic, order-independent (sorted by leafKeyHex); length from the verified name.
    leaves.sort((a, b) => (a.leafKeyHex < b.leafKeyHex ? -1 : a.leafKeyHex > b.leafKeyHex ? 1 : 0));
    return { anchoredRoot, batchSize, leaves };
  } catch {
    return null;
  }
}
