import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { verifyProofBundleAgainstBitcoin, verifyProofBundleStructure } from "@ont/consensus";
import type { BitcoinHeaderSource } from "@ont/consensus";
import {
  checkProofBundleHeaderDepthCoverage,
  runInspectProofBundle,
  runVerifyProofBundleAgainstBitcoin,
  type VerifyProofBundleAgainstBitcoinInput,
} from "./index.js";

const BLOCK_170_HEADER =
  "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70";
const GOOD_HEADER_SOURCE: BitcoinHeaderSource = {
  headerHexAtHeight: (height) => (height === 170 || height === 176 ? BLOCK_170_HEADER : null),
};

describe("@ont/light-client proof-bundle core", () => {
  it("surfaces the audited structural report verbatim", () => {
    const bundle = { proofSource: "accumulator_batch_claim", name: "alice" };
    const r = runInspectProofBundle(bundle);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleStructure(bundle));
  });

  it("requires a header source instead of falling back to Merkle/PoW-only verification", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    expect(verifyProofBundleAgainstBitcoin(bundle).valid).toBe(true);

    const r = runVerifyProofBundleAgainstBitcoin({ bundle });

    expect(r).toEqual({ ok: false, reason: "missing-header-source" });
  });

  it("accepts a verified bundle and surfaces the audited Bitcoin report verbatim", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    const r = runVerifyProofBundleAgainstBitcoin({ bundle, headerSource: GOOD_HEADER_SOURCE });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toEqual(verifyProofBundleAgainstBitcoin(bundle, { headerSource: GOOD_HEADER_SOURCE }));
  });

  it("rejects malformed input without throwing", () => {
    let r: ReturnType<typeof runVerifyProofBundleAgainstBitcoin> | undefined;
    expect(() => {
      r = runVerifyProofBundleAgainstBitcoin(null as unknown as VerifyProofBundleAgainstBitcoinInput);
    }).not.toThrow();
    expect(r).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("checkProofBundleHeaderDepthCoverage", () => {
  it("passes only when the header source can answer anchor height + confirmation depth", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    expect(checkProofBundleHeaderDepthCoverage({ bundle, headerSource: GOOD_HEADER_SOURCE, confirmationDepth: 6 })).toEqual({
      ok: true,
      anchorHeight: 170,
      requiredHeight: 176,
    });
  });

  it("fails closed when the source stops at the anchor height", async () => {
    const bundle = await loadBitcoinAnchoredBundle();
    const short: BitcoinHeaderSource = { headerHexAtHeight: (height) => (height === 170 ? BLOCK_170_HEADER : null) };

    expect(checkProofBundleHeaderDepthCoverage({ bundle, headerSource: short, confirmationDepth: 6 })).toEqual({
      ok: false,
      reason: "short-header-range",
      anchorHeight: 170,
      requiredHeight: 176,
    });
  });
});

async function loadBitcoinAnchoredBundle(): Promise<Record<string, unknown>> {
  const fixtureUrl = new URL("../../../fixtures/proof-bundles/bitcoin-anchored-claim-proof.json", import.meta.url);
  const raw = await readFile(fixtureUrl, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}
