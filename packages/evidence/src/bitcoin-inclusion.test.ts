// D-BI conformance battery (B3_EVIDENCE_HARDENING.md §9 / E-BI1, E-BI2, E-ND1).
// Reuses the real block-170 fixture (the first BTC payment) and checks the built
// inclusion with the kernel's shared verifier (@ont/consensus). Two-tier:
// structural validity can differ from against-Bitcoin validity; a forged
// PoW/Merkle/orphan header must never produce valid===true (E-ND1) — asserted via
// the specific check-ID that flips, leaving the others passing.
import { readFileSync } from "node:fs";

import { bytesToHex, concatBytes, hexToBytes, sha256Bytes } from "@ont/protocol";
import {
  verifyProofBundleAgainstBitcoin,
  verifyProofBundleStructure,
  type BitcoinHeaderSource,
  type ProofBundleVerificationReport,
} from "@ont/consensus";
import { describe, expect, it } from "vitest";

import { buildBitcoinInclusion } from "./bitcoin-inclusion.js";

interface FixtureAnchor {
  readonly txid: string;
  readonly height: number;
  readonly blockHeaderHex: string;
  readonly merkle: readonly string[];
  readonly pos: number;
}

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../fixtures/proof-bundles/bitcoin-anchored-claim-proof.json", import.meta.url),
    "utf8",
  ),
) as { readonly bitcoinInclusion: { readonly anchors: readonly FixtureAnchor[] } } & Record<
  string,
  unknown
>;

const ANCHOR = fixture.bitcoinInclusion.anchors[0]!;
const BLOCK_170_HEADER = ANCHOR.blockHeaderHex;
// Block 170's coinbase txid — a well-known constant, pinned independently of the
// fixture's `merkle` field so "the builder reproduces the proof" is non-circular.
const BLOCK_170_COINBASE_TXID =
  "b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082";
// Block 170 has exactly two txs: coinbase (index 0), then the target (index 1).
const ORDERED_TXIDS = [BLOCK_170_COINBASE_TXID, ANCHOR.txid];

const GOOD_SOURCE: BitcoinHeaderSource = {
  headerHexAtHeight: (h) => (h === 170 ? BLOCK_170_HEADER : null),
};
const ORPHAN_SOURCE: BitcoinHeaderSource = { headerHexAtHeight: () => "00".repeat(80) };

const build = (): ReturnType<typeof buildBitcoinInclusion> =>
  buildBitcoinInclusion({
    txid: ANCHOR.txid,
    height: 170,
    blockHeaderHex: BLOCK_170_HEADER,
    orderedBlockTxids: ORDERED_TXIDS,
  });

/** A copy of the fixture bundle carrying a single replacement inclusion anchor. */
const bundleWith = (anchor: unknown): Record<string, unknown> => ({
  ...fixture,
  bitcoinInclusion: { ...(fixture.bitcoinInclusion as object), anchors: [anchor] },
});

const checkStatus = (report: ProofBundleVerificationReport, id: string): string | undefined =>
  report.checks.find((c) => c.id === id)?.status;

describe("D-BI Bitcoin inclusion witness (B3)", () => {
  it("E-BI1: the builder reproduces the known-good block-170 inclusion and the verifier accepts it", () => {
    const built = build();
    expect(built.pos).toBe(1);
    expect(built.merkle).toEqual([BLOCK_170_COINBASE_TXID]);
    expect(built.merkle).toEqual(ANCHOR.merkle); // cross-check vs the fixture proof
    expect(built.txid).toBe(ANCHOR.txid);
    expect(verifyProofBundleAgainstBitcoin(bundleWith(built)).valid).toBe(true);
  });

  it("E-BI2 two-tier + forged PoW: structure passes, pow fails, inclusion still passes", () => {
    const built = build();
    // Flip the final nonce byte: PoW no longer meets target; Merkle-root region
    // (header bytes 36..68) is untouched, isolating the PoW failure.
    const forgedHeader = BLOCK_170_HEADER.slice(0, -2) + "71";
    const bundle = bundleWith({ ...built, blockHeaderHex: forgedHeader });
    expect(verifyProofBundleStructure(bundle).valid).toBe(true);
    const report = verifyProofBundleAgainstBitcoin(bundle);
    expect(report.valid).toBe(false);
    expect(checkStatus(report, "btc.0.pow")).toBe("failed");
    expect(checkStatus(report, "btc.0.inclusion")).toBe("passed");
  });

  it("E-BI1 forged Merkle: pow passes, inclusion fails, no valid===true", () => {
    const built = build();
    const report = verifyProofBundleAgainstBitcoin(bundleWith({ ...built, merkle: ["00".repeat(32)] }));
    expect(report.valid).toBe(false);
    expect(checkStatus(report, "btc.0.pow")).toBe("passed");
    expect(checkStatus(report, "btc.0.inclusion")).toBe("failed");
  });

  it("E-BI2 canonical header source: positive pins the chain; an orphan header fails only btc.0.chain", () => {
    const bundle = bundleWith(build());
    expect(verifyProofBundleAgainstBitcoin(bundle, { headerSource: GOOD_SOURCE }).valid).toBe(true);
    const report = verifyProofBundleAgainstBitcoin(bundle, { headerSource: ORPHAN_SOURCE });
    expect(report.valid).toBe(false);
    expect(checkStatus(report, "btc.0.chain")).toBe("failed");
    expect(checkStatus(report, "btc.0.pow")).toBe("passed");
    expect(checkStatus(report, "btc.0.inclusion")).toBe("passed");
  });

  // Odd-level duplicate-last coverage (CL r-on-ec3b91a): a synthetic 3-tx block.
  // No real PoW header exists, so the path is checked against a local Merkle
  // oracle that mirrors the verifier's reversed-sibling/double-sha256 convention.
  it("builds an odd (3-tx) tree with Bitcoin duplicate-last and the path folds to the root", () => {
    const TX0 = "11".repeat(32);
    const TX1 = "22".repeat(32);
    const TX2 = "33".repeat(32); // target at pos 2 — the odd one, needs duplicate-last
    const built = buildBitcoinInclusion({
      txid: TX2,
      height: 1,
      blockHeaderHex: "00".repeat(80),
      orderedBlockTxids: [TX0, TX1, TX2],
    });
    expect(built.pos).toBe(2);
    expect(built.merkle.length).toBe(2);
    expect(bytesToHex(foldInclusion(TX2, built.merkle, built.pos))).toBe(
      bytesToHex(merkleRootInternal([TX0, TX1, TX2])),
    );
  });

  it("rejects builder misuse: target absent / malformed header", () => {
    expect(() =>
      buildBitcoinInclusion({
        txid: "99".repeat(32),
        height: 170,
        blockHeaderHex: BLOCK_170_HEADER,
        orderedBlockTxids: ORDERED_TXIDS,
      }),
    ).toThrow();
    expect(() =>
      buildBitcoinInclusion({ txid: ANCHOR.txid, height: 170, blockHeaderHex: "00", orderedBlockTxids: ORDERED_TXIDS }),
    ).toThrow();
  });
});

// --- local Merkle oracle (mirrors proof-bundle.ts; for the synthetic odd case) ---
const dsha = (b: Uint8Array): Uint8Array => sha256Bytes(sha256Bytes(b));
const rev = (b: Uint8Array): Uint8Array => Uint8Array.from(b).reverse();
const internal = (displayHex: string): Uint8Array => rev(hexToBytes(displayHex));

function merkleRootInternal(orderedDisplay: readonly string[]): Uint8Array {
  let level = orderedDisplay.map(internal);
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]!);
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(dsha(concatBytes(level[i]!, level[i + 1]!)));
    level = next;
  }
  return level[0]!;
}

function foldInclusion(targetDisplay: string, siblingsDisplay: readonly string[], pos: number): Uint8Array {
  let acc = internal(targetDisplay);
  let index = pos;
  for (const sib of siblingsDisplay) {
    const s = internal(sib);
    acc = (index & 1) === 1 ? dsha(concatBytes(s, acc)) : dsha(concatBytes(acc, s));
    index >>= 1;
  }
  return acc;
}
