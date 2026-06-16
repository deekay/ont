import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha2";
import { bitsToTarget } from "./block-header.js";
import {
  validateHeaderChain,
  type BitcoinDifficultyCheckpoint,
  type BitcoinNetworkParams,
} from "./validate-header-chain.js";

// I-SPV step (b) red battery — the #82 light-client header-chain validator (B3_INTEGRATION_PLAN
// §7). Fixtures: REAL mainnet block 170 pins the real-PoW happy path + Bitcoin Core's exact
// chainwork constant; SYNTHETIC chains (small powRetargetInterval, powTargetTimespan == 65535 so
// the retarget result scales linearly with the mantissa and is hand-derivable without mining real
// difficulty) exercise the difficulty/linkage/compact/PoW logic incl. the retarget boundary.

// ---------- byte helpers ----------
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}
const dsha256 = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes));
const reversed = (bytes: Uint8Array): Uint8Array => Uint8Array.from(bytes).reverse();

// ---------- synthetic header crafting ----------
const FIXED_MERKLE = new Uint8Array(32).fill(0x11);

function buildHeader(
  prevHashInternal: Uint8Array,
  bits: number,
  time: number,
  nonce: number,
): Uint8Array {
  const h = new Uint8Array(80);
  h[0] = 1; // version 1 (LE)
  h.set(prevHashInternal, 4);
  h.set(FIXED_MERKLE, 36);
  h[68] = time & 0xff;
  h[69] = (time >>> 8) & 0xff;
  h[70] = (time >>> 16) & 0xff;
  h[71] = (time >>> 24) & 0xff;
  h[72] = bits & 0xff;
  h[73] = (bits >>> 8) & 0xff;
  h[74] = (bits >>> 16) & 0xff;
  h[75] = (bits >>> 24) & 0xff;
  h[76] = nonce & 0xff;
  h[77] = (nonce >>> 8) & 0xff;
  h[78] = (nonce >>> 16) & 0xff;
  h[79] = (nonce >>> 24) & 0xff;
  return h;
}

function hashValue(header: Uint8Array): bigint {
  return BigInt("0x" + bytesToHex(reversed(dsha256(header))));
}

/** Mine a header (vary nonce) until its hash meets `bits`' target. Deterministic. */
function mineHeader(prevHashInternal: Uint8Array, bits: number, time: number): Uint8Array {
  const target = bitsToTarget(bits >>> 0);
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    const h = buildHeader(prevHashInternal, bits, time, nonce);
    if (hashValue(h) <= target) return h;
  }
  throw new Error("mineHeader: no nonce found (target too small for the test)");
}

/** Build a header whose hash does NOT meet its target (deterministic fail-PoW fixture). */
function mineFailHeader(prevHashInternal: Uint8Array, bits: number, time: number): Uint8Array {
  const target = bitsToTarget(bits >>> 0);
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    const h = buildHeader(prevHashInternal, bits, time, nonce);
    if (hashValue(h) > target) return h;
  }
  throw new Error("mineFailHeader: every nonce met target");
}

// ---------- synthetic params ----------
// powTargetTimespan == mantissa base (65535) so retarget newTarget == prevTarget * actual /
// 65535 scales the mantissa directly: actual 65535 → unchanged; 32767 → mantissa 0x7fff; clamp
// lower bound = 65535/4 = 16383 → mantissa 0x3fff. Interval 4 → boundary at height % 4 == 0.
const EPOCH_BITS = 0x2000ffff; // target 0xffff << 232
const SYNTH_PARAMS: BitcoinNetworkParams = {
  powLimitHex: bitsToTarget(0x20010000).toString(16), // 0x10000 << 232, ≥ every synthetic target
  powTargetTimespan: 65535,
  powRetargetInterval: 4,
};

const CP_HASH_INTERNAL = new Uint8Array(32).fill(0x22);
const CP_HASH_DISPLAY = bytesToHex(reversed(CP_HASH_INTERNAL));

/** A within-epoch checkpoint (height 4, epoch [4..7]); headers 5,6,7 share EPOCH_BITS. */
function withinEpochCheckpoint(): BitcoinDifficultyCheckpoint {
  return {
    height: 4,
    hashHex: CP_HASH_DISPLAY,
    bits: EPOCH_BITS,
    time: 100_000,
    epochStartTime: 100_000,
    cumulativeWorkHex: "0",
  };
}

/** Build a contiguous mined chain from the checkpoint hash; returns hex + internal tip hash. */
function mineChain(
  startPrevInternal: Uint8Array,
  specs: ReadonlyArray<{ bits: number; time: number }>,
): { headersHex: string[]; tipInternal: Uint8Array } {
  const headersHex: string[] = [];
  let prev = startPrevInternal;
  for (const spec of specs) {
    const h = mineHeader(prev, spec.bits, spec.time);
    headersHex.push(bytesToHex(h));
    prev = dsha256(h);
  }
  return { headersHex, tipInternal: prev };
}

// Bitcoin Core's exact block proof: floor((2^256 - 1) / (target + 1)) + 1.
function blockProof(target: bigint): bigint {
  return ((1n << 256n) - 1n) / (target + 1n) + 1n;
}

// ---------- REAL block 170 ----------
const BLOCK_170_HEADER_HEX =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const DIFF1_WORK = 0x100010001n; // GetBlockProof(difficulty-1) — public constant
const MAINNET_PARAMS: BitcoinNetworkParams = {
  powLimitHex: bitsToTarget(0x1d00ffff).toString(16),
  powTargetTimespan: 1_209_600,
  powRetargetInterval: 2016,
};
function block169Checkpoint(): BitcoinDifficultyCheckpoint {
  // Block 169's hash IS block 170's prevBlock field (bytes 4..36, internal) reversed.
  const h170 = hexToBytes(BLOCK_170_HEADER_HEX);
  const prevField = h170.slice(4, 36);
  return {
    height: 169,
    hashHex: bytesToHex(reversed(prevField)),
    bits: 0x1d00ffff,
    time: 1_231_731_025, // unused (170 is not a retarget boundary)
    epochStartTime: 1_231_469_665,
    cumulativeWorkHex: "0",
  };
}

describe("validateHeaderChain — real block-170 (real-PoW happy + chainwork pin)", () => {
  it("accepts the real block-170 header above its checkpoint", () => {
    const r = validateHeaderChain([BLOCK_170_HEADER_HEX], 170, block169Checkpoint(), MAINNET_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tipHeight).toBe(170);
    expect(r.headerSource.headerHexAtHeight(170)).toBe(BLOCK_170_HEADER_HEX);
    expect(r.headerSource.headerHexAtHeight(169)).toBeNull();
    expect(r.headerSource.headerHexAtHeight(171)).toBeNull();
  });

  it("accounts cumulative chainwork with Bitcoin Core's exact formula (diff-1 = 0x100010001)", () => {
    const r = validateHeaderChain([BLOCK_170_HEADER_HEX], 170, block169Checkpoint(), MAINNET_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(BigInt("0x" + r.cumulativeWorkHex)).toBe(DIFF1_WORK);
  });
});

describe("validateHeaderChain — synthetic within-epoch", () => {
  const cp = withinEpochCheckpoint();
  const { headersHex } = mineChain(CP_HASH_INTERNAL, [
    { bits: EPOCH_BITS, time: 100_001 },
    { bits: EPOCH_BITS, time: 100_002 },
    { bits: EPOCH_BITS, time: 100_003 },
  ]);

  it("accepts a constant-difficulty epoch and exposes the validated range", () => {
    const r = validateHeaderChain(headersHex, 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tipHeight).toBe(7);
    expect(r.headerSource.headerHexAtHeight(5)).toBe(headersHex[0]);
    expect(r.headerSource.headerHexAtHeight(7)).toBe(headersHex[2]);
    expect(r.headerSource.headerHexAtHeight(4)).toBeNull();
    expect(r.headerSource.headerHexAtHeight(8)).toBeNull();
    const expectedWork = blockProof(bitsToTarget(EPOCH_BITS)) * 3n;
    expect(BigInt("0x" + r.cumulativeWorkHex)).toBe(expectedWork);
  });

  it("is deterministic", () => {
    const a = validateHeaderChain(headersHex, 5, cp, SYNTH_PARAMS);
    const b = validateHeaderChain(headersHex, 5, cp, SYNTH_PARAMS);
    expect(a).toEqual(b);
  });

  it("rejects a first header that infers its own (different) bits — not from the checkpoint", () => {
    // Guardrail #1: a mid-epoch segment cannot set its own expected difficulty.
    const chain = mineChain(CP_HASH_INTERNAL, [{ bits: 0x20007fff, time: 100_001 }]);
    const r = validateHeaderChain(chain.headersHex, 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-unexpected-bits");
  });

  it("rejects an easy-target child (easier nBits than the epoch, self-PoW-valid, linked)", () => {
    // The #82 pin: PoW-valid against its own easy target, but bits != expected.
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const easy = mineHeader(dsha256(h0), 0x20010000, 100_002); // larger target than EPOCH_BITS
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(easy)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-unexpected-bits");
  });

  it("rejects sign-bit (negative) compact bits", () => {
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const bad = buildHeader(dsha256(h0), 0x20800000, 100_002, 0); // mantissa sign bit set
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(bad)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-compact-invalid");
  });

  it("rejects zero compact bits", () => {
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const bad = buildHeader(dsha256(h0), 0x00000000, 100_002, 0);
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(bad)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-compact-invalid");
  });

  it("rejects overflowing compact bits (target > 2^256)", () => {
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const bad = buildHeader(dsha256(h0), 0x22ffffff, 100_002, 0); // exp 34, mantissa 0xffffff
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(bad)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-compact-invalid");
  });

  it("rejects a valid-compact target above powLimit", () => {
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const bad = buildHeader(dsha256(h0), 0x20020000, 100_002, 0); // 0x20000 << 232 > powLimit
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(bad)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-target-above-powlimit");
  });

  it("rejects broken linkage mid-chain", () => {
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const h1 = mineHeader(new Uint8Array(32).fill(0x99), EPOCH_BITS, 100_002); // wrong prev
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(h1)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-broken-linkage");
  });

  it("rejects a first header that does not link to the checkpoint", () => {
    const h0 = mineHeader(new Uint8Array(32).fill(0x77), EPOCH_BITS, 100_001); // not the checkpoint
    const r = validateHeaderChain([bytesToHex(h0)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-broken-linkage");
  });

  it("rejects an insufficient-PoW header (hash above its own target)", () => {
    const h0 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 100_001);
    const weak = mineFailHeader(dsha256(h0), EPOCH_BITS, 100_002);
    const r = validateHeaderChain([bytesToHex(h0), bytesToHex(weak)], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-pow-insufficient");
  });
});

describe("validateHeaderChain — synthetic retarget boundary (height 8)", () => {
  // Checkpoint at height 7 (last of epoch [4..7]); height 8 begins a new epoch and retargets.
  function boundaryCheckpoint(actualTimespan: number): BitcoinDifficultyCheckpoint {
    return {
      height: 7,
      hashHex: CP_HASH_DISPLAY,
      bits: EPOCH_BITS,
      time: 200_000 + actualTimespan,
      epochStartTime: 200_000, // first block of epoch [4..7]
      cumulativeWorkHex: "0",
    };
  }

  it("accepts an unchanged retarget (actualTimespan == powTargetTimespan)", () => {
    const cp = boundaryCheckpoint(65535); // → newTarget == prevTarget → bits unchanged
    const h8 = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 200_100);
    const r = validateHeaderChain([bytesToHex(h8)], 8, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tipHeight).toBe(8);
  });

  it("accepts a correct difficulty increase at the boundary (actualTimespan halved)", () => {
    const cp = boundaryCheckpoint(32767); // → newTarget mantissa 0x7fff → bits 0x20007fff
    const h8 = mineHeader(CP_HASH_INTERNAL, 0x20007fff, 200_100);
    const r = validateHeaderChain([bytesToHex(h8)], 8, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tipHeight).toBe(8);
  });

  it("rejects a stale-difficulty boundary header (keeps old bits instead of retargeting)", () => {
    const cp = boundaryCheckpoint(32767); // expected bits 0x20007fff
    const stale = mineHeader(CP_HASH_INTERNAL, EPOCH_BITS, 200_100); // old (easier) bits, self-valid
    const r = validateHeaderChain([bytesToHex(stale)], 8, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-unexpected-bits");
  });

  it("clamps actualTimespan to powTargetTimespan/4 (mantissa 0x3fff)", () => {
    const cp = boundaryCheckpoint(5); // far below /4=16383 → clamp → bits 0x20003fff
    const h8 = mineHeader(CP_HASH_INTERNAL, 0x20003fff, 200_100);
    const r = validateHeaderChain([bytesToHex(h8)], 8, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tipHeight).toBe(8);
  });
});

describe("validateHeaderChain — input validation + totality", () => {
  const cp = withinEpochCheckpoint();
  const { headersHex } = mineChain(CP_HASH_INTERNAL, [{ bits: EPOCH_BITS, time: 100_001 }]);

  it("rejects an empty header list", () => {
    const r = validateHeaderChain([], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-input-malformed");
  });

  it("rejects a non-array headers input", () => {
    const r = validateHeaderChain("nope" as unknown as string[], 5, cp, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-input-malformed");
  });

  it("rejects a non-integer / negative startHeight", () => {
    const a = validateHeaderChain(headersHex, -1, cp, SYNTH_PARAMS);
    const b = validateHeaderChain(headersHex, 5.5, cp, SYNTH_PARAMS);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("spv-input-malformed");
    if (!b.ok) expect(b.reason).toBe("spv-input-malformed");
  });

  it("rejects a startHeight not contiguous with the checkpoint", () => {
    const r = validateHeaderChain(headersHex, 6, cp, SYNTH_PARAMS); // checkpoint.height + 1 == 5
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-noncontiguous-start");
  });

  it("rejects a malformed header (not 80 bytes / not hex)", () => {
    const a = validateHeaderChain(["deadbeef"], 5, cp, SYNTH_PARAMS);
    const b = validateHeaderChain(["zz".repeat(80)], 5, cp, SYNTH_PARAMS);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("spv-header-malformed");
    if (!b.ok) expect(b.reason).toBe("spv-header-malformed");
  });

  it("rejects a malformed checkpoint", () => {
    const bad: BitcoinDifficultyCheckpoint = { ...cp, hashHex: "xyz" };
    const r = validateHeaderChain(headersHex, 5, bad, SYNTH_PARAMS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("spv-checkpoint-malformed");
  });

  it("rejects malformed params", () => {
    const a = validateHeaderChain(headersHex, 5, cp, { ...SYNTH_PARAMS, powRetargetInterval: 0 });
    const b = validateHeaderChain(headersHex, 5, cp, { ...SYNTH_PARAMS, powLimitHex: "nothex" });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe("spv-params-malformed");
    if (!b.ok) expect(b.reason).toBe("spv-params-malformed");
  });

  it("never throws on bogus input", () => {
    expect(() =>
      validateHeaderChain(
        [123 as unknown as string, null as unknown as string],
        Number.NaN,
        null as unknown as BitcoinDifficultyCheckpoint,
        undefined as unknown as BitcoinNetworkParams,
      ),
    ).not.toThrow();
  });
});
