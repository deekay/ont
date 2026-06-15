// D-BI conformance battery (B3_EVIDENCE_HARDENING.md §9 / E-BI1, E-BI2, E-ND1).
// Tests-first: RED until bitcoin-inclusion.ts is built. Reuses the real
// block-170 fixture (the first BTC payment) and checks the built inclusion with
// the kernel's shared verifier (@ont/consensus). Two-tier: structural validity
// can differ from against-Bitcoin validity; a forged PoW/Merkle/orphan header
// must never produce valid===true (diagnostics may differ — E-ND1).
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import {
  verifyProofBundleAgainstBitcoin,
  verifyProofBundleStructure,
  type BitcoinHeaderSource,
} from "@ont/consensus";

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
// Block 170 has exactly two txs: the coinbase (index 0) then the target
// (index 1, pos 1). The fixture's single Merkle sibling IS the coinbase txid,
// display order — so the full ordered list is [coinbase, target].
const ORDERED_TXIDS = [ANCHOR.merkle[0]!, ANCHOR.txid];

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

describe("D-BI Bitcoin inclusion witness (B3, tests-first)", () => {
  it("E-BI1: the builder reproduces the known-good block-170 inclusion and the verifier accepts it", () => {
    const built = build();
    expect(built.pos).toBe(1);
    expect(built.merkle).toEqual(ANCHOR.merkle);
    expect(built.txid).toBe(ANCHOR.txid);
    expect(verifyProofBundleAgainstBitcoin(bundleWith(built)).valid).toBe(true);
  });

  it("E-BI2 two-tier: a forged-PoW header leaves structure valid while against-Bitcoin fails", () => {
    const built = build();
    // Flip the final nonce byte: PoW no longer meets target; the Merkle-root
    // region (header bytes 36..68) is untouched, isolating the PoW failure.
    const forgedHeader = built.blockHeaderHex.slice(0, -2) + (built.blockHeaderHex.endsWith("00") ? "01" : "00");
    const bundle = bundleWith({ ...built, blockHeaderHex: forgedHeader });
    expect(verifyProofBundleStructure(bundle).valid).toBe(true);
    expect(verifyProofBundleAgainstBitcoin(bundle).valid).toBe(false);
  });

  it("E-BI1 forged Merkle: a swapped sibling hash ⇒ no valid===true", () => {
    const built = build();
    const bundle = bundleWith({ ...built, merkle: ["00".repeat(32)] });
    expect(verifyProofBundleAgainstBitcoin(bundle).valid).toBe(false);
  });

  it("E-BI2 canonical header source: positive pins the chain; an orphan header is rejected", () => {
    const bundle = bundleWith(build());
    expect(verifyProofBundleAgainstBitcoin(bundle, { headerSource: GOOD_SOURCE }).valid).toBe(true);
    expect(verifyProofBundleAgainstBitcoin(bundle, { headerSource: ORPHAN_SOURCE }).valid).toBe(false);
  });
});
