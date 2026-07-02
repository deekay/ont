import { describe, expect, it } from "vitest";
import { headerMeetsTarget, bitsToTarget, type BitcoinDifficultyCheckpoint, type BitcoinNetworkParams } from "@ont/bitcoin";
import { verifyProofBundleAgainstBitcoin } from "@ont/consensus";
import { buildAccumulatorBatchClaimBundle, buildBitcoinInclusion, buildMembershipProof } from "@ont/evidence";
import {
  SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
  SIGNET_BITCOIN_NETWORK_PARAMS,
  SIGNET_CHALLENGE_SCRIPT_PUBKEY_HEX,
} from "@ont/launch-config";
import {
  accumulatorRootOf,
  computeValueRecordHash,
  deriveOwnerPubkey,
  normalizeName,
  sha256Hex,
  signValueRecord,
  utf8ToBytes,
} from "@ont/protocol";
import {
  buildCanonicalHeaderSourceFromHeaders,
  fetchCanonicalHeaderSource,
  type HeaderRangeProvider,
} from "./canonical-header-source.js";

// B4-HEADER red battery (B4_ADAPTERS_PLAN §8). The firewall test pipes the adapter output into the REAL
// B3 inclusion verifier (verifyProofBundleAgainstBitcoin): a validated source lets an in-range bundle
// accept; a hostile provider (forged child / withheld / short-or-overlong range / broken linkage) yields
// no source, so B3 cannot accept. RED until the adapter lands (the stub rejects).

// ---------- byte helpers ----------
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  let h = "";
  for (const b of bytes) h += b.toString(16).padStart(2, "0");
  return h;
}
const reversed = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
function overwriteNonce(headerHex: string, nonce: number): string {
  const bytes = hexToBytes(headerHex);
  bytes[76] = nonce & 0xff;
  bytes[77] = (nonce >>> 8) & 0xff;
  bytes[78] = (nonce >>> 16) & 0xff;
  bytes[79] = (nonce >>> 24) & 0xff;
  return bytesToHex(bytes);
}

// ---------- synthetic anchor header (1-tx block) + trusted checkpoint/params ----------
const EASY_BITS = 0x2000ffff; // target 0xffff<<232; the checkpoint epoch's bits
const FORGE_BITS = 0x20010000; // an EASIER target (0x10000<<232) → expected-bits mismatch at the anchor height
const ANCHOR_HEIGHT = 5; // 5 % 4 != 0 → within-epoch, so expected bits === checkpoint.bits
const CP_PREV_INTERNAL = new Uint8Array(32).fill(0x33); // the checkpoint block's internal hash
const ANCHOR_TXID = "0a".repeat(32); // the 1-tx block's only txid → block merkle root = internal(txid)

function mineHeader(prevInternal: Uint8Array, merkleInternal: Uint8Array, nBits: number, time: number): string {
  const h = new Uint8Array(80);
  h[0] = 1; // version
  h.set(prevInternal, 4);
  h.set(merkleInternal, 36);
  h[68] = time & 0xff; h[69] = (time >>> 8) & 0xff; h[70] = (time >>> 16) & 0xff; h[71] = (time >>> 24) & 0xff;
  h[72] = nBits & 0xff; h[73] = (nBits >>> 8) & 0xff; h[74] = (nBits >>> 16) & 0xff; h[75] = (nBits >>> 24) & 0xff;
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    h[76] = nonce & 0xff; h[77] = (nonce >>> 8) & 0xff; h[78] = (nonce >>> 16) & 0xff; h[79] = (nonce >>> 24) & 0xff;
    if (headerMeetsTarget(h)) return bytesToHex(h);
  }
  throw new Error("mineHeader: no nonce");
}

// Re-nonce a mined header so it KEEPS valid version/prev/merkle/time/bits but no longer meets target —
// isolates the spv-pow-insufficient surface (correct bits + linkage, failing PoW). Easy target → a
// random nonce fails ~99.6% of the time, so the first non-meeting nonce is found immediately.
function breakPow(headerHex: string): string {
  const h = hexToBytes(headerHex);
  for (let nonce = 1; nonce < 5_000_000; nonce++) {
    h[76] = nonce & 0xff; h[77] = (nonce >>> 8) & 0xff; h[78] = (nonce >>> 16) & 0xff; h[79] = (nonce >>> 24) & 0xff;
    if (!headerMeetsTarget(h)) return bytesToHex(h);
  }
  throw new Error("breakPow: every nonce met target");
}

const ANCHOR_MERKLE = reversed(hexToBytes(ANCHOR_TXID));
const ANCHOR_HEADER = mineHeader(CP_PREV_INTERNAL, ANCHOR_MERKLE, EASY_BITS, 100_000);

const CHECKPOINT: BitcoinDifficultyCheckpoint = {
  height: ANCHOR_HEIGHT - 1,
  hashHex: bytesToHex(reversed(CP_PREV_INTERNAL)), // display hash; the anchor header's prevBlock links to it
  bits: EASY_BITS,
  time: 99_000,
  epochStartTime: 99_000,
  cumulativeWorkHex: "0",
};
const PARAMS: BitcoinNetworkParams = {
  powLimitHex: bitsToTarget(0x20010000).toString(16), // >= every synthetic target
  powTargetTimespan: 65535,
  powRetargetInterval: 4,
};

// ---------- a resident proof bundle anchored at ANCHOR_HEIGHT (the firewall-positive target) ----------
const NAME = "alice";
const LEAF = sha256Hex(utf8ToBytes(normalizeName(NAME)));
const OWNER_SK = "11".repeat(32);
const OWNER = deriveOwnerPubkey(OWNER_SK);
const REF = "ab".repeat(32);
const OTHER_KEY = "aa".repeat(32);
const OTHER_VAL = "33".repeat(32);
const FULL = new Map([[OTHER_KEY, OTHER_VAL], [LEAF, OWNER]]);
const membership = buildMembershipProof(FULL, LEAF);
const rec1 = signValueRecord({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 1, previousRecordHash: null, valueType: 0, payloadHex: "00", issuedAt: "2026-06-01T00:00:00.000Z" });
const rec2 = signValueRecord({ name: NAME, ownerPrivateKeyHex: OWNER_SK, ownershipRef: REF, sequence: 2, previousRecordHash: computeValueRecordHash(rec1), valueType: 0, payloadHex: "01", issuedAt: "2026-06-02T00:00:00.000Z" });
void accumulatorRootOf;
const BUNDLE = buildAccumulatorBatchClaimBundle({
  name: NAME,
  assuranceTier: "accumulator-batched",
  verificationGoal: "B4-HEADER firewall: the adapter source must let this bundle verify against Bitcoin.",
  ownership: { currentOwnerPubkey: OWNER, ownershipRef: REF },
  membership,
  anchor: { anchorTxid: ANCHOR_TXID, anchorHeight: ANCHOR_HEIGHT },
  inclusion: buildBitcoinInclusion({ txid: ANCHOR_TXID, height: ANCHOR_HEIGHT, blockHeaderHex: ANCHOR_HEADER, orderedBlockTxids: [ANCHOR_TXID] }),
  valueRecords: [rec1, rec2],
});

const provider = (headers: readonly string[] | null): HeaderRangeProvider => ({
  fetchHeaderHex: async () => headers,
});

// ---------- real signet launch checkpoint + no-network header tail ----------
const SIGNET_RANGE_START_HEIGHT = SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT.height + 1;
const SIGNET_HEADER_RANGE = [
  "000000205319b55397090ee5acf575ee0d8e6f1204babb38cc2b0357bfc69b030300000066a0302acc0c6b7042faa806a4bbd7e3d48cffc0803f2d6cb8a2d1fbe639114fd5dd466ac339151d464ff405",
  "0000002055730d2ddc8eaa251e4d43b623e0296afcda12502a73277982f5326714000000bbcc8ae343be9a4110ce4209962996c825483097866fd34543b01851e9612cfe50de466ac339151d1e7c1e06",
  "0000002040e56abc24626cf24bf15d7a7fefe4a1d7829c3b9684ffc48454a7c4100000001cbc0f514ba66ead2fe45bad836d4e15a500b84284598d6f11d3eca90a1b1009a0e1466ac339151d90f2950e",
  "00000020c1bbba44d3ba527d02a6a315e60ecfccc288d2e83f43b8bf64de04550a000000323b302dfdfe38f8e5efeec7926f39664af41c2314e24902b559fe9484f0256e67e2466ac339151db6155208",
] as const;
const MAINNET_HEADER_AT_311446 =
  "0200000040c79de67514e818f7d4868c58a5a41693a05d696e7a7a1c00000000000000006387626ac34066fef724cf097f23bcbfdaab1a5701f4edd0e5fb2418ae24db7e7cf9c953e66b3f181aeab162";
const BROKEN_POW_SIGNET_CHILD = overwriteNonce(SIGNET_HEADER_RANGE[0], 0);

describe("real signet launch checkpoint — bundled config validates forward and fails closed", () => {
  it("carries the BIP325 default signet challenge script for the later solution gate", () => {
    expect(SIGNET_CHALLENGE_SCRIPT_PUBKEY_HEX).toBe(
      "512103ad5e0edad18cb1f0fc0d28a3d4f1f3e445640337489abb10404f2d1e086be430210359ef5021964fe22d6f8e05b2463c9540ce96883fe3b278760f048f5189f2e6c452ae",
    );
  });

  it("validates a known real signet header range from the bundled checkpoint", () => {
    const r = buildCanonicalHeaderSourceFromHeaders(
      SIGNET_HEADER_RANGE,
      SIGNET_RANGE_START_HEIGHT,
      SIGNET_HEADER_RANGE.length,
      SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
      SIGNET_BITCOIN_NETWORK_PARAMS,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tipHeight).toBe(311_449);
    expect(r.tipHashHex).toBe("000000015c590137438ec3e2bae4586a51d2b5cb0f407c952dba0ae8e8c49495");
    expect(r.cumulativeWorkHex).toBe("eafe5a609e2");
    expect(r.headerSource.headerHexAtHeight(311_446)).toBe(SIGNET_HEADER_RANGE[0]);
    expect(r.headerSource.headerHexAtHeight(311_449)).toBe(SIGNET_HEADER_RANGE[3]);
    expect(r.headerSource.headerHexAtHeight(311_450)).toBeNull();
  });

  it("a signet child with malformed PoW yields no source", () => {
    expect(headerMeetsTarget(hexToBytes(BROKEN_POW_SIGNET_CHILD))).toBe(false);
    const r = buildCanonicalHeaderSourceFromHeaders(
      [BROKEN_POW_SIGNET_CHILD, ...SIGNET_HEADER_RANGE.slice(1)],
      SIGNET_RANGE_START_HEIGHT,
      SIGNET_HEADER_RANGE.length,
      SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
      SIGNET_BITCOIN_NETWORK_PARAMS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("spv-pow-insufficient");
  });

  it("a short real-signet tail fails closed before validation", () => {
    const r = buildCanonicalHeaderSourceFromHeaders(
      SIGNET_HEADER_RANGE.slice(0, -1),
      SIGNET_RANGE_START_HEIGHT,
      SIGNET_HEADER_RANGE.length,
      SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
      SIGNET_BITCOIN_NETWORK_PARAMS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("header-range-count-mismatch");
  });

  it("a shifted stale signet range fails closed", () => {
    const r = buildCanonicalHeaderSourceFromHeaders(
      SIGNET_HEADER_RANGE.slice(1),
      SIGNET_RANGE_START_HEIGHT,
      SIGNET_HEADER_RANGE.length - 1,
      SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
      SIGNET_BITCOIN_NETWORK_PARAMS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("spv-broken-linkage");
  });

  it("a wrong-network header range fails closed", () => {
    const r = buildCanonicalHeaderSourceFromHeaders(
      [MAINNET_HEADER_AT_311446],
      SIGNET_RANGE_START_HEIGHT,
      1,
      SIGNET_BITCOIN_DIFFICULTY_CHECKPOINT,
      SIGNET_BITCOIN_NETWORK_PARAMS,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("spv-broken-linkage");
  });
});

describe("buildCanonicalHeaderSourceFromHeaders (pure core) — validation + exact-count firewall", () => {
  it("a valid one-header range → a source whose header feeds verifyProofBundleAgainstBitcoin (accept)", () => {
    const r = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.headerSource.headerHexAtHeight(ANCHOR_HEIGHT)).toBe(ANCHOR_HEADER);
    expect(r.headerSource.headerHexAtHeight(ANCHOR_HEIGHT + 100)).toBeNull(); // out of validated range
    const report = verifyProofBundleAgainstBitcoin(BUNDLE, { headerSource: r.headerSource });
    expect(report.valid).toBe(true); // firewall-positive: the validated source admits the real bundle
  });

  it("a short range (count-1, withheld tail) → header-range-count-mismatch, before validation", () => {
    const r = buildCanonicalHeaderSourceFromHeaders([], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("header-range-count-mismatch");
  });

  it("an overlong range (count+1) → header-range-count-mismatch", () => {
    const r = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER, ANCHOR_HEADER], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("header-range-count-mismatch");
  });

  it("a forged easy-nBits child (bits != expected) → spv-unexpected-bits, no source", () => {
    const forged = mineHeader(CP_PREV_INTERNAL, ANCHOR_MERKLE, FORGE_BITS, 100_000);
    const r = buildCanonicalHeaderSourceFromHeaders([forged], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-unexpected-bits");
  });

  it("broken linkage (prevBlock != checkpoint) → spv-broken-linkage", () => {
    const unlinked = mineHeader(new Uint8Array(32).fill(0x99), ANCHOR_MERKLE, EASY_BITS, 100_000);
    const r = buildCanonicalHeaderSourceFromHeaders([unlinked], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-broken-linkage");
  });

  it("malformed checkpoint / params → fail closed (spv-* surfaced)", () => {
    const badCp = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, 1, { ...CHECKPOINT, hashHex: "xyz" }, PARAMS);
    const badParams = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, 1, CHECKPOINT, { ...PARAMS, powRetargetInterval: 0 });
    expect(badCp.ok).toBe(false);
    expect(badParams.ok).toBe(false);
    if (!badCp.ok) expect(badCp.reason).toBe("spv-checkpoint-malformed");
    if (!badParams.ok) expect(badParams.reason).toBe("spv-params-malformed");
  });

  // round 2 (CL): malformed RANGE inputs fail closed BEFORE the count firewall — count=0/empty must not
  // become a vacuous accepted source; non-int/negative startHeight and non-positive/non-int count reject.
  it("malformed range inputs (non-int/negative startHeight, non-positive/non-int count) → header-range-malformed, no vacuous accept", () => {
    const negStart = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], -1, 1, CHECKPOINT, PARAMS);
    const fracStart = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], 1.5, 1, CHECKPOINT, PARAMS);
    const zeroCount = buildCanonicalHeaderSourceFromHeaders([], ANCHOR_HEIGHT, 0, CHECKPOINT, PARAMS); // empty range, count 0
    const negCount = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, -1, CHECKPOINT, PARAMS);
    const fracCount = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, 1.5, CHECKPOINT, PARAMS);
    for (const r of [negStart, fracStart, zeroCount, negCount, fracCount]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("header-range-malformed");
    }
  });

  // round 2 (CL): two distinct hostile-header surfaces a partial green could skip while still checking
  // bits+linkage — strict 80-byte parse and PoW-against-target.
  it("a non-80-byte header → spv-header-malformed (strict parse, not skipped)", () => {
    const truncated = ANCHOR_HEADER.slice(0, 158); // 79 bytes
    const r = buildCanonicalHeaderSourceFromHeaders([truncated], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("spv-header-malformed");
  });

  it("a well-formed header with correct bits+linkage but failing PoW → spv-pow-insufficient (PoW not skipped)", () => {
    const noPow = breakPow(ANCHOR_HEADER);
    const r = buildCanonicalHeaderSourceFromHeaders([noPow], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("spv-pow-insufficient");
  });

  it("is deterministic", () => {
    const a = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    const b = buildCanonicalHeaderSourceFromHeaders([ANCHOR_HEADER], ANCHOR_HEIGHT, 1, CHECKPOINT, PARAMS);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.tipHeight).toBe(b.tipHeight);
    expect(a.cumulativeWorkHex).toBe(b.cumulativeWorkHex);
    expect(a.headerSource.headerHexAtHeight(ANCHOR_HEIGHT)).toBe(b.headerSource.headerHexAtHeight(ANCHOR_HEIGHT));
  });
});

describe("fetchCanonicalHeaderSource (async wrapper) — provider I/O firewall", () => {
  const base = { startHeight: ANCHOR_HEIGHT, count: 1, checkpoint: CHECKPOINT, params: PARAMS };

  it("a valid provider range → a source that admits the real bundle", async () => {
    const r = await fetchCanonicalHeaderSource({ provider: provider([ANCHOR_HEADER]), ...base });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(verifyProofBundleAgainstBitcoin(BUNDLE, { headerSource: r.headerSource }).valid).toBe(true);
  });

  it("provider returns null (withheld) → header-provider-unavailable, no source", async () => {
    const r = await fetchCanonicalHeaderSource({ provider: provider(null), ...base });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("header-provider-unavailable");
  });

  it("provider rejects (async) → header-provider-unavailable (never rejects)", async () => {
    const rejecting: HeaderRangeProvider = { fetchHeaderHex: () => Promise.reject(new Error("rpc down")) };
    await expect(fetchCanonicalHeaderSource({ provider: rejecting, ...base })).resolves.toMatchObject({ ok: false, reason: "header-provider-unavailable" });
  });

  it("provider throws synchronously → header-provider-unavailable (never throws)", async () => {
    const throwing: HeaderRangeProvider = { fetchHeaderHex: () => { throw new Error("rpc threw"); } };
    let r: Awaited<ReturnType<typeof fetchCanonicalHeaderSource>> | undefined;
    await expect((async () => { r = await fetchCanonicalHeaderSource({ provider: throwing, ...base }); })()).resolves.toBeUndefined();
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("header-provider-unavailable");
  });

  it("provider returns the wrong count (overlong) → header-range-count-mismatch", async () => {
    const r = await fetchCanonicalHeaderSource({ provider: provider([ANCHOR_HEADER, ANCHOR_HEADER]), ...base });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("header-range-count-mismatch");
  });

  // round 2 (CL): the wrapper must forward the EXACT (startHeight, count) requested — else a green could
  // fetch the wrong range and still pass. The provider serves only (ANCHOR_HEIGHT, 1) and records its args.
  it("forwards the exact (startHeight, count) to the provider", async () => {
    const calls: Array<readonly [number, number]> = [];
    const exactOnly: HeaderRangeProvider = {
      fetchHeaderHex: async (s, c) => {
        calls.push([s, c]);
        return s === ANCHOR_HEIGHT && c === 1 ? [ANCHOR_HEADER] : null;
      },
    };
    const r = await fetchCanonicalHeaderSource({ provider: exactOnly, ...base });
    expect(calls).toEqual([[ANCHOR_HEIGHT, 1]]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(verifyProofBundleAgainstBitcoin(BUNDLE, { headerSource: r.headerSource }).valid).toBe(true);
  });

  // round 2 (CL): malformed async range input must reject WITHOUT consulting the provider (input validity
  // cannot depend on provider behavior). The provider is a tripwire that fails if ever called.
  it("malformed async range input → header-range-malformed, BEFORE the provider is consulted", async () => {
    let called = false;
    const tripwire: HeaderRangeProvider = {
      fetchHeaderHex: async () => { called = true; throw new Error("provider must not be called for malformed input"); },
    };
    const r = await fetchCanonicalHeaderSource({ provider: tripwire, startHeight: -1, count: 1, checkpoint: CHECKPOINT, params: PARAMS });
    expect(called).toBe(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("header-range-malformed");
  });

  // round 2 (CL, optional): provider short range through the I/O path → header-range-count-mismatch.
  it("provider returns a short (empty) range → header-range-count-mismatch (I/O short path closed)", async () => {
    const r = await fetchCanonicalHeaderSource({ provider: provider([]), ...base });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("header-range-count-mismatch");
  });
});
